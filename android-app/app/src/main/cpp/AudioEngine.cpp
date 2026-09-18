#include "AudioEngine.h"
#include <android/log.h>
#include <cstdio>
#include <cmath>

#define TAG "AudioEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

namespace roxstar {

AudioEngine& AudioEngine::getInstance() {
    static AudioEngine instance;
    return instance;
}

AudioEngine::AudioEngine()
    : mEchoEffect(kSampleRate, 1000) {}

AudioEngine::~AudioEngine() {
    stopRecording();
}

bool AudioEngine::startRecording(const std::string& outputPath) {
    std::lock_guard<std::mutex> lock(mEngineMutex);
    if (mIsRecording.load()) {
        LOGW("AudioEngine is already recording!");
        return false;
    }

    mCurrentFilePath = outputPath;
    mEchoEffect.reset();

    // 1. Open WAV encoder file
    if (!mWavEncoder.open(mCurrentFilePath, kSampleRate, kChannelCount, 16)) {
        LOGE("Failed to open WAV encoder at path: %s", outputPath.c_str());
        return false;
    }

    // 2. Build Oboe Input Stream
    oboe::AudioStreamBuilder builder;
    builder.setDirection(oboe::Direction::Input)
           ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
           ->setSharingMode(oboe::SharingMode::Exclusive)
           ->setFormat(oboe::AudioFormat::I16)
           ->setChannelCount(kChannelCount)
           ->setSampleRate(kSampleRate)
           ->setDataCallback(this)
           ->setErrorCallback(this);

    oboe::Result result = builder.openStream(mStream);
    if (result != oboe::Result::OK) {
        LOGE("Failed to open Oboe recording stream. Error: %s", oboe::convertToText(result));
        mWavEncoder.close();
        return false;
    }

    result = mStream->requestStart();
    if (result != oboe::Result::OK) {
        LOGE("Failed to start Oboe recording stream. Error: %s", oboe::convertToText(result));
        mStream->close();
        mStream.reset();
        mWavEncoder.close();
        return false;
    }

    mIsRecording.store(true);
    LOGI("AudioEngine started recording to: %s", outputPath.c_str());
    return true;
}

bool AudioEngine::stopRecording() {
    std::lock_guard<std::mutex> lock(mEngineMutex);
    if (!mIsRecording.load()) {
        return true;
    }

    mIsRecording.store(false);

    if (mStream) {
        mStream->stop();
        mStream->close();
        mStream.reset();
    }

    mWavEncoder.close();
    mCurrentLevel.store(0.0f);
    LOGI("AudioEngine stopped recording cleanly. File finalized at: %s", mCurrentFilePath.c_str());
    return true;
}

bool AudioEngine::cancelRecording() {
    std::string pathToDelete;
    {
        std::lock_guard<std::mutex> lock(mEngineMutex);
        if (!mIsRecording.load()) return true;

        mIsRecording.store(false);
        pathToDelete = mCurrentFilePath;

        if (mStream) {
            mStream->stop();
            mStream->close();
            mStream.reset();
        }

        mWavEncoder.close();
        mCurrentLevel.store(0.0f);
    }

    if (!pathToDelete.empty()) {
        std::remove(pathToDelete.c_str());
        LOGI("AudioEngine cancelled recording. Discarded temp file: %s", pathToDelete.c_str());
    }
    return true;
}

void AudioEngine::setEchoEnabled(bool enabled) {
    mEchoEffect.setEnabled(enabled);
    LOGI("Echo DSP effect %s", enabled ? "ENABLED" : "DISABLED");
}

bool AudioEngine::isEchoEnabled() const {
    return mEchoEffect.isEnabled();
}

void AudioEngine::setEchoFeedback(float feedback) {
    mEchoEffect.setFeedback(feedback);
}

void AudioEngine::setEchoDelayMs(int32_t delayMs) {
    mEchoEffect.setDelayMs(delayMs);
}

bool AudioEngine::isRecording() const {
    return mIsRecording.load();
}

float AudioEngine::getCurrentLevel() const {
    return mCurrentLevel.load();
}

int64_t AudioEngine::getRecordingDurationMs() const {
    return mWavEncoder.getDurationMs();
}

oboe::DataCallbackResult AudioEngine::onAudioReady(
        oboe::AudioStream * /*oboeStream*/,
        void *audioData,
        int32_t numFrames) {

    if (!mIsRecording.load() || audioData == nullptr || numFrames <= 0) {
        return oboe::DataCallbackResult::Continue;
    }

    int16_t *samples = static_cast<int16_t*>(audioData);

    // 1. Calculate RMS Level for UI visualization
    double sumSquares = 0.0;
    for (int32_t i = 0; i < numFrames; ++i) {
        double val = static_cast<double>(samples[i]) / 32768.0;
        sumSquares += val * val;
    }
    float rms = static_cast<float>(std::sqrt(sumSquares / numFrames));
    // Apply fast attack, slow decay smoothing
    float prevLevel = mCurrentLevel.load();
    float smoothed = (rms > prevLevel) ? (prevLevel * 0.3f + rms * 0.7f) : (prevLevel * 0.85f + rms * 0.15f);
    mCurrentLevel.store(std::min(1.0f, smoothed));

    // 2. Process Echo DSP effect in-place (if enabled)
    mEchoEffect.process(samples, numFrames);

    // 3. Write processed frames directly to WAV file
    mWavEncoder.writeFrames(samples, numFrames);

    return oboe::DataCallbackResult::Continue;
}

void AudioEngine::onErrorBeforeClose(oboe::AudioStream * /*oboeStream*/, oboe::Result error) {
    LOGE("AudioEngine onErrorBeforeClose: %s", oboe::convertToText(error));
}

void AudioEngine::onErrorAfterClose(oboe::AudioStream * /*oboeStream*/, oboe::Result error) {
    LOGE("AudioEngine onErrorAfterClose: %s", oboe::convertToText(error));
    mIsRecording.store(false);
}

} // namespace roxstar
