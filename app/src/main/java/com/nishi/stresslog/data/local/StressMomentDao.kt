package com.nishi.stresslog.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface StressMomentDao {

    @Insert
    suspend fun insert(moment: StressMoment): Long

    @Update
    suspend fun update(moment: StressMoment)

    @Query("SELECT * FROM stress_moments ORDER BY timestamp DESC")
    fun observeAll(): Flow<List<StressMoment>>

    @Query("SELECT * FROM stress_moments WHERE id = :id")
    suspend fun getById(id: Long): StressMoment?

    @Query("SELECT * FROM stress_moments WHERE timestamp BETWEEN :from AND :to")
    suspend fun getInRange(from: Long, to: Long): List<StressMoment>

    @Query("SELECT MAX(timestamp) FROM stress_moments WHERE trigger = 'AUTO'")
    suspend fun getLastAutoMomentTime(): Long?
}
