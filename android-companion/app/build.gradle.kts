plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fr.veriteinterdite.mel"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.veriteinterdite.mel"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "MEL_BASE_URL", "\"https://meliturgos.adrien-lopezcarreras.workers.dev\"")
    }

    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    jvmToolchain(17)
}
