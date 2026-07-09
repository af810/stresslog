package com.nishi.stresslog.di

import com.nishi.stresslog.data.source.MockStressDataSource
import com.nishi.stresslog.data.source.StressDataSource
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * ストレスの生データ源を差し替えるための唯一の場所。
 * 実機ウェアラブル（Health Connect）を導入するときは、
 * HealthConnectStressDataSource を実装して bind 先をこのファイルだけ変更すればよい。
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class DataSourceModule {

    @Binds
    @Singleton
    abstract fun bindStressDataSource(impl: MockStressDataSource): StressDataSource
}
