#ifndef ECHODSP_WAV_ENCODER_H
#define ECHODSP_WAV_ENCODER_H

#include <string>
#include <fstream>
#include <cstdint>
#include <mutex>

namespace roxstar {

class WavEncoder {
public:
    WavEncoder();
    ~WavEncoder();

    /**
     * Open a file and write placeholder 44-byte WAV header
     */
    bool open(const std::string& filePath, int32_t sampleRate = 44100, int16_t numChannels = 1, int16_t bitsPerSample = 16);

    /**
     * Write raw 16-bit PCM frames to file
     */
    bool writeFrames(const int16_t* buffer, int32_t numFrames);

    /**
     * Finalize header sizes and close file stream
     */
    bool close();

    /**
     * Get recorded audio duration in milliseconds
     */
    int64_t getDurationMs() const;

    /**
     * Get total PCM bytes written
     */
    uint32_t getDataBytesWritten() const;

    bool isOpen() const;

private:
    void writeHeaderPlaceholder();
    void finalizeHeader();

    std::ofstream mFileStream;
    std::string mFilePath;
    int32_t mSampleRate;
    int16_t mNumChannels;
    int16_t mBitsPerSample;
    uint32_t mDataBytesWritten;
    mutable std::mutex mMutex;
    bool mIsOpen;
};

} // namespace roxstar

#endif // ECHODSP_WAV_ENCODER_H
