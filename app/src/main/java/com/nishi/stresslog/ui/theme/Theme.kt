package com.nishi.stresslog.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.nishi.stresslog.ui.common.StressLevel

private val StressPrimary = Color(0xFF6750A4)
private val StressSecondary = Color(0xFF625B71)

private val LightColors = lightColorScheme(
    primary = StressPrimary,
    secondary = StressSecondary
)

private val DarkColors = darkColorScheme(
    primary = StressPrimary,
    secondary = StressSecondary
)

@Composable
fun StressLogTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colors = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colors,
        content = content
    )
}

fun stressScoreColor(score: Int): Color = StressLevel.of(score).color
