plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Optional stable release signing from CI secrets; never committed to the repo.
val ksFile = System.getenv("PK_KEYSTORE_FILE")

android {
    namespace = "live.nightkeep.pkbattle"
    compileSdk = 35
    defaultConfig {
        applicationId = "live.nightkeep.pkbattle"
        minSdk = 26
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "0.1." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
        buildConfigField("String", "DEFAULT_SERVER", "\"${System.getenv("PK_DEFAULT_SERVER")?.ifEmpty { null } ?: "https://nightkeep-pk-battle.onrender.com"}\"")
    }
    signingConfigs {
        if (ksFile != null && file(ksFile).exists()) create("stable") {
            storeFile = file(ksFile)
            storePassword = System.getenv("PK_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("PK_KEY_ALIAS")
            keyPassword = System.getenv("PK_KEY_PASSWORD")
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("stable") ?: signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
