#include "EchoEffect.h"
#include <cmath>
#include <cstring>

namespace roxstar {

EchoEffect::EchoEffect(int32_t sampleRate, int32_t maxDelayMs)
    : mSampleRate(sampleRate),
      mMaxDelaySamples((sampleRate * maxDelayMs) / 1000),
      mWriteIndex(0) {
    mDelayBuffer.resize(mMaxDelaySamples, 0.0f);
    setDelayMs(250); // Default 250ms echo delay
}

void EchoEffect::process(int16_t* buffer, int32_t numFrames) {
    if (!mEnabled.load(std::memory_order_relaxed)) {
        return; // Bypass DSP cleanly if disabled (Clean mode)
    }

    const int32_t delaySamples = mDelaySamples.load(std::memory_order_relaxed);
    const float feedback = mFeedback.load(std::memory_order_relaxed);
    const float decay = mDecay.load(std::memory_order_relaxed);
    const int32_t bufferSize = static_cast<int32_t>(mDelayBuffer.size());

    for (int32_t i = 0; i < numFrames; ++i) {
        // Normalize input 16-bit PCM to [-1.0, 1.0] float
        float inputSample = static_cast<float>(buffer[i]) / 32768.0f;

        // Calculate tap index in circular buffer
        int32_t readIndex = mWriteIndex - delaySamples;
        if (readIndex < 0) {
            readIndex += bufferSize;
        }

        float delayedSample = mDelayBuffer[readIndex];

        // Echo formula: output = dry * (1 - decay) + wet * decay
        float outputSample = (inputSample * (1.0f - decay)) + (delayedSample * decay);

        // Circular feedback: delay[n] = input + feedback * delay[n - D]
        mDelayBuffer[mWriteIndex] = inputSample + (delayedSample * feedback);

        // Advance circular write index
        mWriteIndex = (mWriteIndex + 1) % bufferSize;

        // Hard-clip to avoid integer overflow distortion
        outputSample = std::max(-1.0f, std::min(1.0f, outputSample));

        // Convert back to 16-bit signed integer
        buffer[i] = static_cast<int16_t>(outputSample * 32767.0f);
    }
}

void EchoEffect::setEnabled(bool enabled) {
    mEnabled.store(enabled, std::memory_order_relaxed);
}

bool EchoEffect::isEnabled() const {
    return mEnabled.load(std::memory_order_relaxed);
}

void EchoEffect::setDelayMs(int32_t delayMs) {
    int32_t samples = (mSampleRate * delayMs) / 1000;
    samples = std::max(1, std::min(mMaxDelaySamples - 1, samples));
    mDelaySamples.store(samples, std::memory_order_relaxed);
}

int32_t EchoEffect::getDelayMs() const {
    return (mDelaySamples.load(std::memory_order_relaxed) * 1000) / mSampleRate;
}

void EchoEffect::setFeedback(float feedback) {
    feedback = std::max(0.0f, std::min(0.95f, feedback));
    mFeedback.store(feedback, std::memory_order_relaxed);
}

float EchoEffect::getFeedback() const {
    return mFeedback.load(std::memory_order_relaxed);
}

void EchoEffect::setDecay(float decay) {
    decay = std::max(0.0f, std::min(1.0f, decay));
    mDecay.store(decay, std::memory_order_relaxed);
}

float EchoEffect::getDecay() const {
    return mDecay.load(std::memory_order_relaxed);
}

void EchoEffect::reset() {
    std::fill(mDelayBuffer.begin(), mDelayBuffer.end(), 0.0f);
    mWriteIndex = 0;
}

} // namespace roxstar
