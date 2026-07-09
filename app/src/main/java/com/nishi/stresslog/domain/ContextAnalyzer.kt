package com.nishi.stresslog.domain

import com.nishi.stresslog.data.local.StressMoment
import java.util.Calendar
import javax.inject.Inject

data class StressInsight(val message: String)

private val WEEKDAY_NAMES = mapOf(
    Calendar.SUNDAY to "日曜",
    Calendar.MONDAY to "月曜",
    Calendar.TUESDAY to "火曜",
    Calendar.WEDNESDAY to "水曜",
    Calendar.THURSDAY to "木曜",
    Calendar.FRIDAY to "金曜",
    Calendar.SATURDAY to "土曜"
)

/**
 * 蓄積された StressMoment（強いストレスを感じた瞬間）から、
 * タグ・時間帯・曜日の傾向を集計し、回避のヒントを提示する。
 * 統計的な集計のみで、MLモデルは使わない（MVP）。
 * 将来、時系列の特徴量からの予兆検知に置き換える余地を残す拡張ポイント。
 */
class ContextAnalyzer @Inject constructor() {

    fun analyze(moments: List<StressMoment>): List<StressInsight> {
        if (moments.size < MIN_SAMPLES) {
            return listOf(StressInsight("まだ記録が少ないため、傾向はまだ見えていません。記録を続けると、ストレスが高まりやすい状況が見えてきます。"))
        }

        val insights = mutableListOf<StressInsight>()

        tagInsight(moments)?.let { insights += it }
        weekdayInsight(moments)?.let { insights += it }
        timeOfDayInsight(moments)?.let { insights += it }

        if (insights.isEmpty()) {
            insights += StressInsight("特定の強い傾向はまだ見つかっていません。記録を続けることで精度が上がります。")
        }
        return insights
    }

    private fun tagInsight(moments: List<StressMoment>): StressInsight? {
        val byTag = moments.flatMap { m -> m.tags.map { it to m.stressScore } }
            .groupBy({ it.first }, { it.second })
            .filter { it.value.size >= MIN_GROUP_SAMPLES }
        if (byTag.isEmpty()) return null

        val (tag, scores) = byTag.maxByOrNull { it.value.average() } ?: return null
        val avg = scores.average()
        return StressInsight(
            "「%s」の場面でストレスが高くなりやすい傾向があります（平均スコア %.0f、%d件）。事前の準備や区切りを設けることで軽減できるかもしれません。"
                .format(tag, avg, scores.size)
        )
    }

    private fun weekdayInsight(moments: List<StressMoment>): StressInsight? {
        val byWeekday = moments.groupBy { weekdayOf(it.timestamp) }
            .filter { it.value.size >= MIN_GROUP_SAMPLES }
        if (byWeekday.isEmpty()) return null

        val (weekday, list) = byWeekday.maxByOrNull { it.value.size } ?: return null
        val name = WEEKDAY_NAMES[weekday] ?: return null
        return StressInsight(
            "%sにストレスの記録が集中しています（過去%d件）。この曜日は事前に余裕を持ったスケジュールを意識してみましょう。"
                .format(name, list.size)
        )
    }

    private fun timeOfDayInsight(moments: List<StressMoment>): StressInsight? {
        val byBucket = moments.groupBy { timeBucketOf(it.timestamp) }
            .filter { it.value.size >= MIN_GROUP_SAMPLES }
        if (byBucket.isEmpty()) return null

        val (bucket, list) = byBucket.maxByOrNull { it.value.size } ?: return null
        return StressInsight(
            "%sの時間帯にストレスを感じやすい傾向があります（過去%d件）。この時間の前に短い休憩を挟むと予防になるかもしれません。"
                .format(bucket, list.size)
        )
    }

    private fun weekdayOf(timestamp: Long): Int =
        Calendar.getInstance().apply { timeInMillis = timestamp }.get(Calendar.DAY_OF_WEEK)

    private fun timeBucketOf(timestamp: Long): String {
        val hour = Calendar.getInstance().apply { timeInMillis = timestamp }.get(Calendar.HOUR_OF_DAY)
        return when (hour) {
            in 5..8 -> "早朝"
            in 9..11 -> "午前"
            in 12..13 -> "昼"
            in 14..17 -> "午後"
            in 18..20 -> "夕方"
            else -> "夜間"
        }
    }

    companion object {
        private const val MIN_SAMPLES = 5
        private const val MIN_GROUP_SAMPLES = 2
    }
}
