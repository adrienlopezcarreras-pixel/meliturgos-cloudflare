plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "fr.veriteinterdite.mel"
    compileSdk = 36

    defaultConfig {
        applicationId = "fr.veriteinterdite.mel"
        minSdk = 26
        targetSdk = 36
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
    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.11.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
