# Audio Flow Architecture - ROXSTAR Oboe & Web Audio DSP

## Native Oboe C++ Audio Processing Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant Mic as Hardware Microphone
    participant OboeIn as Oboe InputStream (AAudio/OpenSL ES)
    participant DSP as Echo DSP Engine (C++)
    participant Encoder as WAV Audio File Writer
    participant Storage as Local Storage / Draft Manager
    participant JNI as Android JNI / Kotlin Layer

    Mic->>OboeIn: Raw PCM Audio Stream (44.1kHz, 16-bit)
    OboeIn->>DSP: OnAudioReady(audioData, numFrames)
    
    rect rgb(240, 245, 255)
        note over DSP: Ring Buffer Delay Line<br/>Sample = Raw + (Feedback * DelayBuffer[ReadPtr])
        DSP->>DSP: Process Echo DSP Filter
    end

    DSP->>Encoder: Processed PCM Chunk
    Encoder->>Storage: Append PCM to WAV File (header + payload)
    
    JNI->>Storage: Stop Recording & Finalize WAV
    Storage->>JNI: Return Draft Metadata (id, duration, path)
```

## Audio Engine Specifications

- **Native Library**: Google Oboe (C++17)
- **Audio Format**: 16-bit PCM Mono / Stereo, 44,100 Hz
- **DSP Effect**: Circular Ring-Buffer Echo (Delay time: 50ms - 800ms, Feedback: 0.0 - 0.8)
- **Web Equivalent**: Web Audio API `DelayNode`, `GainNode`, and `MediaRecorder`
