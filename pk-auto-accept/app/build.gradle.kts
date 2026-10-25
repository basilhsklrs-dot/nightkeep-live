plugins { id("com.android.application") }
android {
 namespace = "live.nightkeep.pkauto"
 compileSdk = 35
 defaultConfig { applicationId = "live.nightkeep.pkauto"; minSdk = 26; targetSdk = 32; versionCode = 1; versionName = "1.0" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}