package com.nishi.stresslog.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.ShowChart
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
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.nishi.stresslog.ui.dashboard.DashboardScreen
import com.nishi.stresslog.ui.moments.MomentDetailScreen
import com.nishi.stresslog.ui.moments.MomentsScreen
import com.nishi.stresslog.ui.settings.SettingsScreen
import com.nishi.stresslog.ui.trend.TrendScreen

private object Routes {
    const val DASHBOARD = "dashboard"
    const val TREND = "trend"
    const val MOMENTS = "moments"
    const val SETTINGS = "settings"
    const val MOMENT_DETAIL = "moments/{momentId}"
    fun momentDetail(id: Long) = "moments/$id"
}

private data class BottomTab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val BOTTOM_TABS = listOf(
    BottomTab(Routes.DASHBOARD, "ホーム", Icons.Filled.Home),
    BottomTab(Routes.TREND, "推移", Icons.Filled.ShowChart),
    BottomTab(Routes.MOMENTS, "記録", Icons.Filled.List)
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
            startDestination = Routes.DASHBOARD,
            modifier = Modifier.padding(padding)
        ) {
            composable(Routes.DASHBOARD) {
                DashboardScreen(onOpenSettings = { navController.navigate(Routes.SETTINGS) })
            }
            composable(Routes.TREND) {
                TrendScreen()
            }
            composable(Routes.MOMENTS) {
                MomentsScreen(onOpenMoment = { id -> navController.navigate(Routes.momentDetail(id)) })
            }
            composable(
                route = Routes.MOMENT_DETAIL,
                arguments = listOf(navArgument("momentId") { type = androidx.navigation.NavType.LongType })
            ) {
                MomentDetailScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
