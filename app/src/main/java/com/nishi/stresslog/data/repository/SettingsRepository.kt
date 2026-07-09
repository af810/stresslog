package com.nishi.stresslog.data.repository

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "stresslog_settings")

data class AppSettings(
    val stressThreshold: Int = 70,
    val samplingIntervalMinutes: Int = 15,
    val notificationsEnabled: Boolean = true,
    val notificationCooldownMinutes: Int = 30
)

@Singleton
class SettingsRepository @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val THRESHOLD = intPreferencesKey("stress_threshold")
        val SAMPLING_INTERVAL = intPreferencesKey("sampling_interval_minutes")
        val NOTIFICATIONS_ENABLED = booleanPreferencesKey("notifications_enabled")
        val COOLDOWN = intPreferencesKey("notification_cooldown_minutes")
    }

    val settings: Flow<AppSettings> = context.dataStore.data.map { prefs ->
        AppSettings(
            stressThreshold = prefs[Keys.THRESHOLD] ?: 70,
            samplingIntervalMinutes = prefs[Keys.SAMPLING_INTERVAL] ?: 15,
            notificationsEnabled = prefs[Keys.NOTIFICATIONS_ENABLED] ?: true,
            notificationCooldownMinutes = prefs[Keys.COOLDOWN] ?: 30
        )
    }

    suspend fun setThreshold(value: Int) {
        context.dataStore.edit { it[Keys.THRESHOLD] = value }
    }

    suspend fun setSamplingInterval(minutes: Int) {
        context.dataStore.edit { it[Keys.SAMPLING_INTERVAL] = minutes }
    }

    suspend fun setNotificationsEnabled(enabled: Boolean) {
        context.dataStore.edit { it[Keys.NOTIFICATIONS_ENABLED] = enabled }
    }
}
