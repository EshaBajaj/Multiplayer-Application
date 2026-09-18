# 🎙️ ROXSTAR - Voice Draft, Real-Time Room & Spin Wheel System

## 📁 Repository Structure

```
.
├── android-app/             # Android App (Kotlin UI, ViewModel, JNI Bindings)
├── native-audio/            # High-Performance Oboe C++ Audio Engine & Echo DSP
├── backend/                 # Node.js Express REST API, Socket.IO & Single Page Web App
│   ├── src/                 # Server logic, routes, socket handlers, spin state machine
│   └── public/              # Clean 3-step Web App (Outfit Font, Web Audio DSP, Wheel)
├── database/                # PostgreSQL Schema Migrations
├── infrastructure/          # Dockerfile, Docker Compose, GitHub Actions CI/CD, Cloud Guide
├── docs/                    # Architecture Documentation
│   ├── api/                 # OpenAPI 3.0 Specification (openapi.yaml)
│   └── architecture/        # Mermaid System, Audio, Event, & Spin Diagrams
├── tests/                   # Automated Test Suites
│   ├── unit/                # Audio DSP math & Spin Wheel logic unit tests
│   └── integration/         # REST API, WebSocket presence, & Spin state machine tests
├── docker-compose.yml       # One-click multi-container orchestration
└── README.md                # Submission Documentation
```

---

## 🚀 Quick Start Guide

### Option 1: Fast Zero-Config Local Execution (No Database Setup Needed)
The backend features an automated dual-mode database engine. If no `DATABASE_URL` is provided, it automatically boots a high-speed In-Memory SQL engine.

```bash
# 1. Navigate to backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Start the backend server & web application
npm start


### Option 2: Docker Compose Orchestration (Production PostgreSQL)

```bash
# Build and launch Node.js backend + PostgreSQL database
docker-compose up --build

# Access health endpoint:
curl http://localhost:5000/health
```

### Option 3: Run Automated Test Suites

```bash
cd backend
npm test
```

---

## 🛠️ Feature & Architecture Deep-Dive

### Section A: Native Oboe C++ Audio Processing
- **High-Performance Input Capture**: Built using Google's **Oboe C++ library** (`AAudio` / `OpenSL ES`) for low-latency audio capture at 44.1kHz / 16-bit PCM.
- **Echo DSP Filter**: Implements a circular ring-buffer DSP delay line (`Sample = Raw + (Feedback * DelayBuffer[ReadPtr])`).
- **WAV Writer & Draft Manager**: Encodes raw PCM buffer chunks into valid WAV files with headers and manages draft metadata.

### Section B & D: Backend API, Presence & Database
- **REST API**: Create/Join/Leave Rooms, Save & Fetch Drafts, Retrieve Spin Outcomes.
- **Socket.IO Real-Time Gateway**:
  - `user_joined`: Broadcasts updated participant list.
  - `user_left`: Cleans presence on departure/disconnect.
  - `draft_shared`: Notifies room members when a voice draft is posted to the Jukebox.
  - `spin_started`, `user_eliminated`, `winner_announced`: Synchronizes spin elimination sequence.
- **Dual Database Architecture**: Production PostgreSQL with schema migrations + zero-setup in-memory fallback engine.

### Section C: 5-Second Physics Elimination Spin Wheel & Edge Cases
- **Core Rules**: Requires 3 to 20 eligible users. Started manually by room host. Eliminates 1 user every 5 seconds until exactly 1 winner remains. Awards +50 Virtual Points to the winner.

#### Implemented Edge Cases Matrix (Section C4)
1. **E1. Non-Host Start Request**: Rejects non-host start attempts with `403` / `ONLY_HOST_ALLOWED` error.
2. **E2. Insufficient Participants (< 3)**: Rejects spin start if fewer than 3 eligible players are online.
3. **E3. Duplicate Spin Requests**: Rejects concurrent `start_spin` triggers with `SPIN_ALREADY_ACTIVE`.
4. **E4. User Disconnect Mid-Spin**: If an active player drops during a spin, they are marked eliminated. If online players drop below 2, the spin is automatically aborted (`spin_aborted`).
5. **E5. Late Reconnection / State Sync**: Rejoining clients immediately receive full active spin snapshot via `room_state` socket broadcast.
6. **E6. Host Disconnect Mid-Spin**: The spin state machine runs autonomously on the backend timer queue; spin continues smoothly for remaining players.

---

## 📐 Architecture Diagrams

All architecture diagrams are rendered using standard Mermaid syntax in `/docs/architecture/`:
- **System Architecture**: [`docs/architecture/system_architecture.md`](docs/architecture/system_architecture.md)
- **Oboe & Audio Flow**: [`docs/architecture/audio_flow.md`](docs/architecture/audio_flow.md)
- **WebSocket Event Flow**: [`docs/architecture/event_flow.md`](docs/architecture/event_flow.md)
- **Spin State Machine**: [`docs/architecture/spin_state_machine.md`](docs/architecture/spin_state_machine.md)
- **OpenAPI 3.0 Specification**: [`docs/api/openapi.yaml`](docs/api/openapi.yaml)

---


