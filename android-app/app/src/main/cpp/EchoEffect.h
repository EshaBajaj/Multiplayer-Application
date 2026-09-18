#ifndef ECHODSP_ECHO_EFFECT_H
#define ECHODSP_ECHO_EFFECT_H

#include <vector>
#include <cstdint>
#include <atomic>
#include <algorithm>

namespace roxstar {

class EchoEffect {
public:
    EchoEffect(int32_t sampleRate = 44100, int32_t maxDelayMs = 1000);
    ~EchoEffect() = default;

    /**
     * Process 16-bit mono PCM samples in-place
     */
    void process(int16_t* buffer, int32_t numFrames);

    void setEnabled(bool enabled);
    bool isEnabled() const;

    void setDelayMs(int32_t delayMs);
    int32_t getDelayMs() const;

    void setFeedback(float feedback);
    float getFeedback() const;

    void setDecay(float decay);
    float getDecay() const;

    void reset();

private:
    int32_t mSampleRate;
    int32_t mMaxDelaySamples;
    std::vector<float> mDelayBuffer;
    int32_t mWriteIndex;

    std::atomic<bool> mEnabled{true};
    std::atomic<int32_t> mDelaySamples;
    std::atomic<float> mFeedback{0.45f};  // Recirculation feedback
    std::atomic<float> mDecay{0.50f};     // Wet/dry blend
};

} // namespace roxstar

#endif // ECHODSP_ECHO_EFFECT_H
