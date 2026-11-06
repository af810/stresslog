plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.nishi.stresslog.watchprobe"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "com.nishi.stresslog.watchprobe"
        minSdk = 30
        targetSdk = 35
        versionCode = 12
        versionName = "0.5.5"
        buildConfigField("boolean", "WATCH_UI_PREVIEW", "false")
        resValue("bool", "measurement_enabled", "true")
        resValue("string", "watch_app_name", "StressLog")
    }
    buildTypes {
        create("uiPreview") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".preview"
            versionNameSuffix = "-ui-preview"
            buildConfigField("boolean", "WATCH_UI_PREVIEW", "true")
            resValue("bool", "measurement_enabled", "false")
            resValue("string", "watch_app_name", "StressLog UIプレビュー")
            matchingFallbacks += listOf("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
