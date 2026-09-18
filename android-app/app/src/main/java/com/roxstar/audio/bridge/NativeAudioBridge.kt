package com.roxstar.audio.bridge

import android.util.Log

object NativeAudioBridge {
    private const val TAG = "NativeAudioBridge"
    private var isLoaded = false

    init {
        try {
            System.loadLibrary("audioengine")
            isLoaded = true
            initEngine()
            Log.i(TAG, "Successfully loaded native audioengine library")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Failed to load audioengine native library", e)
            isLoaded = false
        }
    }

    fun isNativeLoaded(): Boolean = isLoaded

    // Native declarations
    external fun initEngine(): Boolean
    external fun startRecording(outputPath: String): Boolean
    external fun stopRecording(): Boolean
    external fun cancelRecording(): Boolean
    external fun setEchoEnabled(enabled: Boolean)
    external fun isEchoEnabled(): Boolean
    external fun isRecording(): Boolean
    external fun getCurrentLevel(): Float
    external fun getRecordingDurationMs(): Long
}
