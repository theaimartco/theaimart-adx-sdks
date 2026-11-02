plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("maven-publish")
}

android {
    namespace = "co.theaimart.adx"
    compileSdk = 34

    defaultConfig {
        minSdk = 21
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets["main"].java.srcDirs("src/main/kotlin")
    sourceSets["test"].java.srcDirs("src/test/kotlin")

    publishing {
        singleVariant("release") {
            withSourcesJar()
        }
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    // org.json is provided by the Android platform at runtime; for local JVM unit tests we need
    // a real implementation on the classpath.
    testImplementation("org.json:json:20240303")
}

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("release") {
                from(components["release"])
                groupId = "co.theaimart"
                artifactId = "adx-android"
                version = "1.1.0"
                pom {
                    name.set("theaimart adx (Android)")
                    description.set("Official theaimart Ad Network SDK for Android.")
                    url.set("https://adx.theaimart.co")
                    licenses {
                        license {
                            name.set("The Apache License, Version 2.0")
                            url.set("https://www.apache.org/licenses/LICENSE-2.0.txt")
                        }
                    }
                    // Maven Central rejects a POM without a developer entry.
                    developers {
                        developer {
                            id.set("theaimart")
                            name.set("theaimart")
                            email.set("contact@theaimart.co")
                            url.set("https://theaimart.co")
                        }
                    }
                    scm {
                        url.set("https://github.com/theaimartco/theaimart-adx-sdks")
                        connection.set("scm:git:https://github.com/theaimartco/theaimart-adx-sdks.git")
                    }
                }
            }
        }
        // A plain directory, not a server: the release workflow signs what lands here and
        // uploads it to Maven Central (scripts/publish-maven-central.sh).
        repositories {
            maven {
                name = "staging"
                url = uri(layout.buildDirectory.dir("staging"))
            }
        }
    }
}
