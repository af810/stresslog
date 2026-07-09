package com.nishi.stresslog.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [StressReading::class, StressMoment::class, Baseline::class],
    version = 1,
    exportSchema = false
)
@TypeConverters(StressMomentConverters::class)
abstract class StressLogDatabase : RoomDatabase() {
    abstract fun stressReadingDao(): StressReadingDao
    abstract fun stressMomentDao(): StressMomentDao
    abstract fun baselineDao(): BaselineDao
}
