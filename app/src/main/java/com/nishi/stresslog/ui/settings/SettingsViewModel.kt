package com.nishi.stresslog.ui.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.repository.AppSettings
import com.nishi.stresslog.data.repository.SettingsRepository
import com.nishi.stresslog.work.WorkScheduler
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    val settings: StateFlow<AppSettings> = settingsRepository.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), AppSettings())

    fun setThreshold(value: Int) {
        viewModelScope.launch { settingsRepository.setThreshold(value) }
    }

    fun setSamplingInterval(minutes: Int) {
        viewModelScope.launch {
            settingsRepository.setSamplingInterval(minutes)
            WorkScheduler.schedule(context, minutes)
        }
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        viewModelScope.launch { settingsRepository.setNotificationsEnabled(enabled) }
    }
}
