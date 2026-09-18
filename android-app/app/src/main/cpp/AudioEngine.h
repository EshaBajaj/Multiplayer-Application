#ifndef ECHODSP_AUDIO_ENGINE_H
#define ECHODSP_AUDIO_ENGINE_H

#include <oboe/Oboe.h>
#include <string>
#include <memory>
#include <atomic>
#include <mutex>
#include "EchoEffect.h"
#include "WavEncoder.h"

namespace roxstar {

class AudioEngine : public oboe::AudioStreamDataCallback,
                    public oboe::AudioStreamErrorCallback {
public:
    static AudioEngine& getInstance();

    AudioEngine();
    virtual ~AudioEngine();

    /**
     * Start recording input stream to WAV file
     */
    bool startRecording(const std::string& outputPath);

    /**
     * Stop recording, finalize WAV header, close stream
     */
    bool stopRecording();

    /**
     * Cancel recording and discard file
     */
    bool cancelRecording();

    /**
     * Toggle real-time Echo DSP effect
     */
    void setEchoEnabled(bool enabled);
    bool isEchoEnabled() const;

    void setEchoFeedback(float feedback);
    void setEchoDelayMs(int32_t delayMs);

    bool isRecording() const;
    float getCurrentLevel() const;
    int64_t getRecordingDurationMs() const;

    // Oboe Callbacks
    oboe::DataCallbackResult onAudioReady(
            oboe::AudioStream *oboeStream,
            void *audioData,
            int32_t numFrames) override;

    void onErrorBeforeClose(oboe::AudioStream *oboeStream, oboe::Result error) override;
    void onErrorAfterClose(oboe::AudioStream *oboeStream, oboe::Result error) override;

private:
    std::shared_ptr<oboe::AudioStream> mStream;
    EchoEffect mEchoEffect;
    WavEncoder mWavEncoder;

    std::string mCurrentFilePath;
    std::atomic<bool> mIsRecording{false};
    std::atomic<float> mCurrentLevel{0.0f};
    mutable std::mutex mEngineMutex;

    static constexpr int32_t kSampleRate = 44100;
    static constexpr int32_t kChannelCount = 1; // Mono
};

} // namespace roxstar

#endif // ECHODSP_AUDIO_ENGINE_H
