package com.nishi.stresslog.domain

import java.util.Calendar
import javax.inject.Inject

/**
 * 現在のストレス状況に応じて、軽いストレス解消法をルールベースで提案する。
 * MVPでは統計/MLは使わず、スコア帯・時間帯・直近傾向で分岐する。
 */
class SuggestionEngine @Inject constructor() {

    fun suggest(
        score: Int,
        timestamp: Long = System.currentTimeMillis(),
        recentTrendRising: Boolean = false
    ): String {
        val hour = Calendar.getInstance().apply { timeInMillis = timestamp }.get(Calendar.HOUR_OF_DAY)
        val isNight = hour < 6 || hour >= 21
        val isDaytime = hour in 6..17

        return when {
            score >= 85 -> "かなり高いストレス反応が出ています。4-7-8呼吸法（4秒吸う→7秒止める→8秒吐くを3セット）を試してみましょう。"
            recentTrendRising && score >= 60 ->
                "ここ最近、ストレスが高い状態が続いています。一度作業の手を止めて、5分だけ休憩を取りましょう。"
            score >= 70 && isDaytime ->
                "1分だけ席を立って歩いてみましょう。軽い運動が交感神経の高ぶりを鎮めます。"
            score >= 70 && isNight ->
                "画面から少し離れて深呼吸を。夜のブルーライトは交感神経をさらに刺激することがあります。"
            score >= 70 ->
                "肩を上げ下げして力を抜き、ゆっくり深呼吸を3回してみましょう。"
            score >= 55 ->
                "軽くストレッチをして、意識的に肩の力を抜いてみましょう。"
            else -> "落ち着いた状態です。この調子を保ちましょう。"
        }
    }
}
