plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android { namespace = "live.nightkeep.pkmanager"; compileSdk = 35
 defaultConfig { applicationId = "live.nightkeep.pkmanager"; minSdk = 26; targetSdk = 35; versionCode = 2; versionName = "0.2-remote" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}
