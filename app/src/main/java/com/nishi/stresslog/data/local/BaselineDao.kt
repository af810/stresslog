package com.nishi.stresslog.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface BaselineDao {

    @Query("SELECT * FROM baselines WHERE id = ${Baseline.SINGLETON_ID}")
    fun observe(): Flow<Baseline?>

    @Query("SELECT * FROM baselines WHERE id = ${Baseline.SINGLETON_ID}")
    suspend fun get(): Baseline?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(baseline: Baseline)
}
