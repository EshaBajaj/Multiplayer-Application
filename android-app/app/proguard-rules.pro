# Keep JNI native methods
-keepclasseswithmembernames class * {
    native <methods>;
}
-keep class com.roxstar.audio.bridge.** { *; }
-keep class com.roxstar.audio.data.model.** { *; }
