package com.nishi.stresslog.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.nishi.stresslog.ui.advice.AdviceScreen
import com.nishi.stresslog.ui.analysis.AnalysisScreen
import com.nishi.stresslog.ui.home.HomeScreen
import com.nishi.stresslog.ui.moments.MomentDetailScreen
import com.nishi.stresslog.ui.records.RecordsScreen
import com.nishi.stresslog.ui.sensor.SensorScreen
import com.nishi.stresslog.ui.settings.SettingsScreen

private object Routes {
    const val HOME = "home"
    const val RECORDS = "records"
    const val ANALYSIS = "analysis"
    const val ADVICE = "advice"
    const val SETTINGS = "settings"
    const val SENSOR = "sensor"
    const val MOMENT_DETAIL = "moments/{momentId}"
    fun momentDetail(id: Long) = "moments/$id"
}

private data class BottomTab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val BOTTOM_TABS = listOf(
    BottomTab(Routes.HOME, "ホーム", Icons.Filled.Home),
    BottomTab(Routes.RECORDS, "記録", Icons.Filled.List),
    BottomTab(Routes.ANALYSIS, "分析", Icons.Filled.Insights),
    BottomTab(Routes.ADVICE, "アドバイス", Icons.Filled.Lightbulb),
    BottomTab(Routes.SETTINGS, "設定", Icons.Filled.Settings),
    BottomTab(Routes.SENSOR, "センサー", Icons.Filled.Sensors)
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StressLogRoot(modifier: Modifier = Modifier) {
    val navController = rememberNavController()

    Scaffold(
        modifier = modifier,
        bottomBar = {
            val backStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = backStackEntry?.destination
            val showBottomBar = BOTTOM_TABS.any { tab ->
                currentDestination?.hierarchy?.any { it.route == tab.route } == true
            }
            if (showBottomBar) {
                NavigationBar {
                    BOTTOM_TABS.forEach { tab ->
                        val selected = currentDestination?.hierarchy?.any { it.route == tab.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) }
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
            modifier = Modifier.padding(padding)
        ) {
            composable(Routes.HOME) {
                HomeScreen(onRecordMoment = { navController.navigate(Routes.RECORDS) })
            }
            composable(Routes.RECORDS) {
                RecordsScreen(onOpenMoment = { id -> navController.navigate(Routes.momentDetail(id)) })
            }
            composable(Routes.ANALYSIS) {
                AnalysisScreen()
            }
            composable(Routes.ADVICE) {
                AdviceScreen()
            }
            composable(Routes.SETTINGS) {
                SettingsScreen()
            }
            composable(Routes.SENSOR) {
                SensorScreen()
            }
            composable(
                route = Routes.MOMENT_DETAIL,
                arguments = listOf(navArgument("momentId") { type = androidx.navigation.NavType.LongType })
            ) {
                MomentDetailScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
