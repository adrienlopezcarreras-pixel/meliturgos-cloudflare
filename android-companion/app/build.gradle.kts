plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "fr.veriteinterdite.mel"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.veriteinterdite.mel"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
        buildConfigField("String", "MEL_BASE_URL", "\"https://meliturgos.adrien-lopezcarreras.workers.dev\"")
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.06.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
