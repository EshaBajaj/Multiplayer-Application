#include <jni.h>
#include <string>
#include <android/log.h>
#include "AudioEngine.h"

#define TAG "NativeAudioBridge"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_roxstar_audio_bridge_NativeAudioBridge_initEngine(
        JNIEnv* /*env*/,
        jobject /*thiz*/) {
    roxstar::AudioEngine::getInstance();
    LOGI("AudioEngine initialized via JNI.");
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_com_roxstar_audio_bridge_NativeAudioBridge_startRecording(
        JNIEnv* env,
        jobject /*thiz*/,
        jstring jOutputPath) {
    if (jOutputPath == nullptr) return JNI_FALSE;

    const char* nativePath = env->GetStringUTFChars(jOutputPath, nullptr);
    std::string outputPath(nativePath);
    env->ReleaseStringUTFChars(jOutputPath, nativePath);

    bool success = roxstar::AudioEngine::getInstance().startRecording(outputPath);
    return success ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_roxstar_audio_bridge_NativeAudioBridge_stopRecording(
        JNIEnv* /*env*/,
        jobject /*thiz*/) {
    bool success = roxstar::AudioEngine::getInstance().stopRecording();
    return success ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_roxstar_audio_bridge_NativeAudioBridge_cancelRecording(
        JNIEnv* /*env*/,
        jobject /*thiz*/) {
    bool success = roxstar::AudioEngine::getInstance().cancelRecording();
    return success ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_roxstar_audio_bridge_NativeAudioBridge_setEchoEnabled(
        JNIEnv* /*env*/,
        jobject /*thiz*/,
        jboolean enabled) {
    roxstar::AudioEngine::getInstance().setEchoEnabled(enabled == JNI_TRUE);
}

JNIEXPORT jboolean JNICALL
Java_com_roxstar_audio_bridge_NativeAudioBridge_isEchoEnabled(
        JNIEnv* /*env*/,
        jobject /*thiz*/) {
    return roxstar::AudioEngine::getInstance().isEchoEnabled() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_roxstar_audio_bridge_NativeAudioBridge_isRecording(
        JNIEnv* /*env*/,
        jobject /*thiz*/) {
    return roxstar::AudioEngine::getInstance().isRecording() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jfloat JNICALL
Java_com_roxstar_audio_bridge_NativeAudioBridge_getCurrentLevel(
        JNIEnv* /*env*/,
        jobject /*thiz*/) {
    return roxstar::AudioEngine::getInstance().getCurrentLevel();
}

JNIEXPORT jlong JNICALL
Java_com_roxstar_audio_bridge_NativeAudioBridge_getRecordingDurationMs(
        JNIEnv* /*env*/,
        jobject /*thiz*/) {
    return static_cast<jlong>(roxstar::AudioEngine::getInstance().getRecordingDurationMs());
}

} // extern "C"
