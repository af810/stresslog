package com.nishi.stresslog.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import androidx.room.TypeConverters

enum class TriggerType { AUTO, MANUAL }

/** 強いストレスを感じた瞬間の記録（自動検知 or 手動記録） */
@Entity(tableName = "stress_moments")
@TypeConverters(StressMomentConverters::class)
data class StressMoment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,
    val stressScore: Int,
    val trigger: TriggerType,
    val note: String? = null,
    val tags: List<String> = emptyList(),
    val hrBefore: Int? = null,
    val hrAfter: Int? = null,
    val appliedSuggestion: String? = null
)

class StressMomentConverters {
    @TypeConverter
    fun fromTags(tags: List<String>): String = tags.joinToString(",")

    @TypeConverter
    fun toTags(raw: String): List<String> =
        if (raw.isBlank()) emptyList() else raw.split(",").map { it.trim() }

    @TypeConverter
    fun fromTrigger(trigger: TriggerType): String = trigger.name

    @TypeConverter
    fun toTrigger(raw: String): TriggerType = TriggerType.valueOf(raw)
}
