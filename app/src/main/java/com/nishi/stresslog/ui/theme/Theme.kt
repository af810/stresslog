package com.nishi.stresslog.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val StressPrimary = Color(0xFF6750A4)
private val StressSecondary = Color(0xFF625B71)

// ストレスレベルの色分け（グラフ・ゲージ共通）
val StressColorCalm = Color(0xFF4CAF50)
val StressColorModerate = Color(0xFFFFA726)
val StressColorHigh = Color(0xFFE53935)

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

fun stressScoreColor(score: Int): Color = when {
    score < 40 -> StressColorCalm
    score < 70 -> StressColorModerate
    else -> StressColorHigh
}
