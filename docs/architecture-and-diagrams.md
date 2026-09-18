# ROXSTAR System Architecture & Engineering Diagrams

Comprehensive technical architecture, audio pipeline specifications, and WebSocket protocol diagrams for the **ROXSTAR Audio Engine & Multiplayer Elimination Platform**.

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph "Android Client (Kotlin + Jetpack Compose + C++ NDK)"
        UI["Jetpack Compose UI<br/>(Studio, Drafts, Room, SpinWheelArena)"]
        VM["RoomViewModel & StudioViewModel<br/>(StateFlow, Coroutines)"]
        AudioJNI["JNI Native Bridge<br/>(AudioEngine.cpp)"]
        OboeEngine["Oboe / AAudio C++ Engine<br/>(Lock-Free RingBuffer, DSP)"]
        LocalDB["Room SQLite Database<br/>(Offline Draft Storage)"]
        SocketClient["Socket.IO Client & OkHttp<br/>(Real-Time Gateway)"]
    end

    subgraph "Edge / Cloud Infrastructure"
        ALB["Application Load Balancer / Reverse Proxy<br/>(TLS Termination, Port 5000)"]
    end

    subgraph "Backend Services (Node.js 20 Alpine Docker)"
        API["Express.js REST API<br/>(Auth, Drafts, Rooms, Health)"]
        SocketServer["Socket.IO Server<br/>(Presence, Spin State Machine, Jukebox)"]
        SpinEngine["Authoritative Spin Machine<br/>(5s Round Intervals, Atomic Logic)"]
        UploadStorage["Persistent Audio Disk<br/>(/usr/src/app/uploads/*.wav)"]
    end

    subgraph "Persistence Tier (PostgreSQL / Neon Cloud)"
        UsersTbl[("users<br/>(Points, Profiles)")]
        RoomsTbl[("rooms & room_members<br/>(Active Sessions)")]
        DraftsTbl[("drafts & room_shared_drafts<br/>(Audio Takes)")]
        SpinsTbl[("spins & spin_rounds<br/>(Audited Elimination Ledger)")]
    end

    UI --> VM
    VM --> AudioJNI
    AudioJNI --> OboeEngine
    VM --> LocalDB
    VM --> SocketClient
    SocketClient <==>|WSS / HTTPS| ALB
    ALB <==> API
    ALB <==> SocketServer
    SocketServer <--> SpinEngine
    API --> UploadStorage
    API --> UsersTbl
    API --> RoomsTbl
    API --> DraftsTbl
    SpinEngine --> SpinsTbl
    SpinEngine --> UsersTbl
```

---

## 2. Low-Latency Native Audio Processing Pipeline (Section A)

```mermaid
sequenceDiagram
    autonumber
    actor Performer as Vocalist / Performer
    participant Mic as Android Mic Hardware
    participant AAudioIn as AAudio Input Stream (Oboe)
    participant RingBuf as Lock-Free SPSC Ring Buffer
    participant DSP as C++ AudioProcessor (DSP)
    participant CircBuf as Circular Delay Buffer (44.1kHz Float)
    participant AAudioOut as AAudio Output Stream (Oboe)
    participant Earphones as Low-Latency Earphones / Monitor
    participant JNI as JNI Bridge & WaveWriter
    participant LocalWav as Local .wav Storage (Flash)

    Performer->>Mic: Vocal Input (Acoustic Pressure)
    Mic->>AAudioIn: Low-Latency PCM Capture
    AAudioIn->>RingBuf: Enqueue Frames (Zero Allocation)
    
    loop Real-Time Audio Callback (every 5.3ms / 256 frames)
        RingBuf->>DSP: Process PCM samples (Float32)
        alt Clean Effect Selected
            DSP->>AAudioOut: Direct Pass-Through
        else Echo Effect Selected
            DSP->>CircBuf: Read Sample delayed by N ms
            DSP->>CircBuf: Write Current + (Delayed * Feedback 0.45)
            DSP->>AAudioOut: Mix Dry (0.7) + Wet (0.5)
        end
        AAudioOut->>Earphones: Real-Time Zero-Latency Monitor Feedback
        DSP->>JNI: Forward Samples to Recording Sink
    end

    Performer->>JNI: Tap "Stop Recording"
    JNI->>LocalWav: Write 16-bit 44.1kHz Stereo WAV File
```

---

## 3. Real-Time Multiplayer Spin Wheel State Machine (Section C)

```mermaid
stateDiagram-v2
    [*] --> WAITING: Room Created / Participants Join
    
    WAITING --> RUNNING: Host calls start_spin (>= 3 Online Players)
    WAITING --> WAITING: Participant count < 3 (Blocked)
    
    state RUNNING {
        [*] --> RoundTimer: Active Players Selected
        RoundTimer --> Eliminating: 5-Second Interval Expires
        Eliminating --> CheckRemaining: Server picks Random Victim
        CheckRemaining --> RoundTimer: Players Remaining > 1
    }
    
    RUNNING --> COMPLETED: 1 Player Remaining
    RUNNING --> ABORTED: Host leaves OR Online Players < 2
    
    state COMPLETED {
        [*] --> AwardPoints: Atomic DB Transaction
        AwardPoints --> WinnerAnnounced: Winner receives +50 Virtual Points
    }
    
    COMPLETED --> WAITING: Next Game Ready
    ABORTED --> WAITING: Error Reset
```

---

## 4. In-Room Jukebox Take Sharing Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Ayush as Ayush (Host on Mobile)
    participant App as ROXSTAR Android App
    participant Server as Node.js Backend
    participant Storage as Server File Storage
    participant DB as PostgreSQL
    actor Yatharth as Yatharth (PC Browser)
    actor Krishna as Krishna (PC Browser)

    Ayush->>App: Taps "Share Take" -> Selects "Testing Echo 1"
    App->>Server: POST /api/drafts/upload (Multipart/form-data .wav)
    Server->>Storage: Store /uploads/{uuid}.wav
    Server->>DB: INSERT INTO drafts RETURNING id
    Server-->>App: 201 Created (draft_id)
    
    App->>Server: socket.emit("share_draft", { room_id, draft_id })
    Server->>DB: INSERT INTO room_shared_drafts
    
    par Real-Time Broadcast
        Server-->>App: emit("draft_shared", payload)
        Server-->>Yatharth: emit("draft_shared", payload)
        Server-->>Krishna: emit("draft_shared", payload)
    end
    
    Yatharth->>Yatharth: Jukebox list prepends "Testing Echo 1"
    Yatharth->>Server: Clicks Play (GET /uploads/{uuid}.wav)
    Server-->>Yatharth: 200 OK (audio/wav streaming)
```
