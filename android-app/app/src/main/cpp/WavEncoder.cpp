#include "WavEncoder.h"
#include <android/log.h>

#define TAG "WavEncoder"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)

namespace roxstar {

WavEncoder::WavEncoder()
    : mSampleRate(44100),
      mNumChannels(1),
      mBitsPerSample(16),
      mDataBytesWritten(0),
      mIsOpen(false) {}

WavEncoder::~WavEncoder() {
    close();
}

bool WavEncoder::open(const std::string& filePath, int32_t sampleRate, int16_t numChannels, int16_t bitsPerSample) {
    std::lock_guard<std::mutex> lock(mMutex);
    if (mIsOpen) {
        close();
    }

    mFilePath = filePath;
    mSampleRate = sampleRate;
    mNumChannels = numChannels;
    mBitsPerSample = bitsPerSample;
    mDataBytesWritten = 0;

    mFileStream.open(mFilePath, std::ios::binary | std::ios::out | std::ios::trunc);
    if (!mFileStream.is_open()) {
        LOGE("Failed to open file for writing: %s", mFilePath.c_str());
        return false;
    }

    writeHeaderPlaceholder();
    mIsOpen = true;
    LOGI("Opened WAV file for recording: %s (%d Hz, %d ch, %d-bit)",
         mFilePath.c_str(), mSampleRate, mNumChannels, mBitsPerSample);
    return true;
}

void WavEncoder::writeHeaderPlaceholder() {
    // 44-byte placeholder header
    char header[44] = {0};
    mFileStream.write(header, 44);
}

bool WavEncoder::writeFrames(const int16_t* buffer, int32_t numFrames) {
    std::lock_guard<std::mutex> lock(mMutex);
    if (!mIsOpen || !mFileStream.is_open() || buffer == nullptr || numFrames <= 0) {
        return false;
    }

    const uint32_t bytesToWrite = static_cast<uint32_t>(numFrames * mNumChannels * (mBitsPerSample / 8));
    mFileStream.write(reinterpret_cast<const char*>(buffer), bytesToWrite);
    mDataBytesWritten += bytesToWrite;
    return mFileStream.good();
}

void WavEncoder::finalizeHeader() {
    if (!mFileStream.is_open()) return;

    // Seek back to the beginning to write authoritative RIFF WAV header
    mFileStream.seekp(0, std::ios::beg);

    const uint32_t byteRate = mSampleRate * mNumChannels * (mBitsPerSample / 8);
    const uint16_t blockAlign = mNumChannels * (mBitsPerSample / 8);
    const uint32_t totalChunkSize = 36 + mDataBytesWritten;
    const uint32_t dataChunkSize = mDataBytesWritten;

    // 1. RIFF Chunk Descriptor
    mFileStream.write("RIFF", 4);
    mFileStream.write(reinterpret_cast<const char*>(&totalChunkSize), 4);
    mFileStream.write("WAVE", 4);

    // 2. "fmt " Subchunk
    mFileStream.write("fmt ", 4);
    const uint32_t subchunk1Size = 16; // 16 for PCM
    const uint16_t audioFormat = 1;    // 1 for PCM
    mFileStream.write(reinterpret_cast<const char*>(&subchunk1Size), 4);
    mFileStream.write(reinterpret_cast<const char*>(&audioFormat), 2);
    mFileStream.write(reinterpret_cast<const char*>(&mNumChannels), 2);
    mFileStream.write(reinterpret_cast<const char*>(&mSampleRate), 4);
    mFileStream.write(reinterpret_cast<const char*>(&byteRate), 4);
    mFileStream.write(reinterpret_cast<const char*>(&blockAlign), 2);
    mFileStream.write(reinterpret_cast<const char*>(&mBitsPerSample), 2);

    // 3. "data" Subchunk
    mFileStream.write("data", 4);
    mFileStream.write(reinterpret_cast<const char*>(&dataChunkSize), 4);

    mFileStream.flush();
    LOGI("WAV header finalized. Data bytes written: %u, Total size: %u",
         dataChunkSize, totalChunkSize + 8);
}

bool WavEncoder::close() {
    std::lock_guard<std::mutex> lock(mMutex);
    if (!mIsOpen) return true;

    finalizeHeader();
    mFileStream.close();
    mIsOpen = false;
    return true;
}

int64_t WavEncoder::getDurationMs() const {
    std::lock_guard<std::mutex> lock(mMutex);
    if (mSampleRate == 0 || mNumChannels == 0 || mBitsPerSample == 0) return 0;
    const uint32_t bytesPerSec = mSampleRate * mNumChannels * (mBitsPerSample / 8);
    if (bytesPerSec == 0) return 0;
    return (static_cast<int64_t>(mDataBytesWritten) * 1000) / bytesPerSec;
}

uint32_t WavEncoder::getDataBytesWritten() const {
    std::lock_guard<std::mutex> lock(mMutex);
    return mDataBytesWritten;
}

bool WavEncoder::isOpen() const {
    std::lock_guard<std::mutex> lock(mMutex);
    return mIsOpen;
}

} // namespace roxstar
