# 🎙️ ROXSTAR - Real-Time Multiplayer Voice Arena & Spin Wheel System

**Author**: Esha Bajaj  
**GitHub Repository**: [https://github.com/EshaBajaj/Multiplayer-Application.git](https://github.com/EshaBajaj/Multiplayer-Application.git)  
**Live AWS Deployment**: [http://3.108.219.1/](http://3.108.219.1/)  

---

## 🌟 Executive Overview

**ROXSTAR** is a full-stack, real-time multiplayer application designed for live voice collaboration, voice draft sharing, and interactive elimination spin wheel games. Built from the ground up with high performance, beautiful UI aesthetics, and enterprise cloud infrastructure in mind, the platform seamlessly connects web and mobile clients through WebSockets, Web Audio DSP, and production AWS cloud hosting.

---

## 📁 Repository Structure

```text
.
├── android-app/             # Android App (Kotlin UI, ViewModel, JNI Bindings)
├── native-audio/            # High-Performance Oboe C++ Audio Engine & Echo DSP
├── backend/                 # Node.js Express REST API, Socket.IO & Single Page Web App
│   ├── src/                 # Server logic, routes, socket handlers, spin state machine
│   └── public/              # Modern Web App (Outfit Font, Web Audio DSP, Canvas Wheel)
├── database/                # PostgreSQL Schema Migrations
├── infrastructure/          # Dockerfile, Docker Compose, GitHub Actions CI/CD, Cloud Guide
├── docs/                    # Architecture Documentation & Diagrams
│   ├── api/                 # OpenAPI 3.0 Specification (openapi.yaml)
│   └── architecture/        # Mermaid System, Audio, Event, & Spin Diagrams
├── tests/                   # Automated Test Suites (32/32 Passed)
│   ├── unit/                # Audio DSP math & Spin Wheel logic unit tests
│   └── integration/         # REST API, WebSocket presence, & Spin state machine tests
├── docker-compose.yml       # Production multi-container orchestration
└── README.md                # Project Documentation
```

---

## 🎨 Product & Key Features

### 1. 👥 Smooth Player Onboarding & Room Lobby
- **Display Name Identity**: Instant display name selection with handle customization and quick-select suggestions (*Alex, Jordan, Sarah, Taylor*).
- **Direct Room ID Joining**: Join any active multiplayer room directly using a Room ID or selecting from the active room directory.
- **Room Hosting**: One-click creation of new live rooms with custom titles.

### 2. 🎛️ Web Audio Studio & Native C++ Audio Engine
- **Low-Latency Audio Capture**: 44.1kHz / 16-bit PCM audio recording.
- **Real-Time Web Audio DSP**: Integrated Echo DSP delay line filter (`Sample = Raw + (Feedback * DelayBuffer[ReadPtr])`) with live delay time and feedback controls.
- **Live Visualizers**: Real-time canvas waveform visualizer and dynamic microphone input volume meter.
- **Shared Room Jukebox**: One-click recording, previewing, and broadcasting of voice takes to all room members.

### 3. 🎡 5-Second Physics Elimination Spin Wheel
- **Multiplayer Elimination**: Requires 3 to 20 eligible room participants.
- **Backend-Authoritative Timers**: Spin state machine eliminates 1 participant every 5 seconds until a champion is crowned.
- **Rewards System**: Automatically updates and persists +50 Virtual Points to the winner.
- **Comprehensive Edge Case Safety**: Handles host drops, mid-spin disconnects, late reconnects, and concurrent spin requests safely.

### 4. ☁️ AWS Cloud Infrastructure & Nginx Reverse Proxy
- **Live AWS EC2 Hosting**: Deployed on AWS EC2 (`Ubuntu 26.04 LTS`) with Docker Compose orchestration.
- **Production Nginx Reverse Proxy**: Secure port 80 routing (`Internet → Nginx :80 → Docker Backend :5000 → PostgreSQL`).
- **PostgreSQL Database**: Managed database persistence with fallback to in-memory testing engines.
- **Automated GitHub Actions CI/CD**: Automatic test execution, Docker container building, and EC2 SSH deployment pipeline on every `git push`.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism, Dark Mode, Micro-animations), JavaScript (ES6+), Web Audio API, HTML5 Canvas.
- **Backend**: Node.js, Express.js, Socket.IO, PostgreSQL (`pg`), Winston Logger.
- **Native Audio**: C++20, Google Oboe (`AAudio`/`OpenSL ES`), Android NDK, JNI.
- **Android**: Kotlin, Jetpack ViewModel, Coroutines, AndroidX.
- **DevOps**: Docker, Docker Compose, Nginx, GitHub Actions, AWS EC2.

---

## 🚀 Quick Start Guide

### Option 1: Fast Local Execution
```bash
# 1. Navigate to backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Start backend & web application
npm start
```
Access the application locally at `http://localhost:5000/`.

---

### Option 2: Production Docker Compose
```bash
# Build and launch Node.js backend + PostgreSQL database
docker-compose up --build -d

# Verify health status
curl http://localhost:5000/health
```

---

### Option 3: Run Test Suite
```bash
cd backend
npm test
```
All **32 / 32 unit and integration tests** pass cleanly (100%).

---

## 📐 Architecture Diagrams

All architecture diagrams are rendered using standard Mermaid syntax in `/docs/architecture/`:
- **System Architecture**: [`docs/architecture/system_architecture.md`](docs/architecture/system_architecture.md)
- **Oboe & Audio Flow**: [`docs/architecture/audio_flow.md`](docs/architecture/audio_flow.md)
- **WebSocket Event Flow**: [`docs/architecture/event_flow.md`](docs/architecture/event_flow.md)
- **Spin State Machine**: [`docs/architecture/spin_state_machine.md`](docs/architecture/spin_state_machine.md)
- **OpenAPI 3.0 Specification**: [`docs/api/openapi.yaml`](docs/api/openapi.yaml)

---

## 👤 Author & Acknowledgments

Developed by **Esha Bajaj** as a demonstration of production-grade real-time systems, WebSockets, Web Audio DSP, and cloud DevOps engineering.
