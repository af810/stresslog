package com.nishi.stresslog.di

import android.content.Context
import androidx.room.Room
import com.nishi.stresslog.data.local.BaselineDao
import com.nishi.stresslog.data.local.StressLogDatabase
import com.nishi.stresslog.data.local.StressMomentDao
import com.nishi.stresslog.data.local.StressReadingDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): StressLogDatabase =
        Room.databaseBuilder(context, StressLogDatabase::class.java, "stresslog.db")
            .build()

    @Provides
    fun provideStressReadingDao(db: StressLogDatabase): StressReadingDao = db.stressReadingDao()

    @Provides
    fun provideStressMomentDao(db: StressLogDatabase): StressMomentDao = db.stressMomentDao()

    @Provides
    fun provideBaselineDao(db: StressLogDatabase): BaselineDao = db.baselineDao()
}
