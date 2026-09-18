# System Architecture - ROXSTAR Platform

## High-Level System Architecture Diagram

```mermaid
graph TD
    subgraph Client Layer
        A[Android Native App / Oboe C++]
        B[Web Single Page App / Web Audio DSP]
    end

    subgraph API & Real-Time Gateway (Node.js & Express)
        C[HTTP REST API Gateway]
        D[Socket.IO Real-Time Engine]
        E[Spin Engine & State Machine]
    end

    subgraph Data & Persistence Layer
        F[(PostgreSQL Primary Database)]
        G[(In-Memory SQL Fallback DB)]
        H[Local Draft File Storage / S3 Bucket]
    end

    A -- REST API / Multi-part Upload --> C
    B -- REST API / Multi-part Upload --> C
    A -- WebSocket Events --> D
    B -- WebSocket Events --> D

    D <--> E
    C <--> F
    D <--> F
    C <--> G
    D <--> G
    C <--> H
```

## Component Overview

1. **Android Audio Studio (Oboe C++)**:
   - High-performance native audio recording pipeline utilizing AAudio / OpenSL ES via Google Oboe.
   - Real-time Echo DSP filter processing audio chunks in C++.
   - Local WAV file encoding and Draft lifecycle manager.

2. **Web Audio Studio (Web Audio API DSP)**:
   - Zero-dependency web recording visualizer and DSP engine with Echo delay/feedback controls.

3. **Node.js Real-Time Engine (Express & Socket.IO)**:
   - State management for rooms, members, draft sharing, and 5-second physics spin wheel elimination loops.
   - Synchronizes real-time presence (`user_joined`, `user_left`, `draft_shared`, `spin_started`, `user_eliminated`, `winner_announced`).

4. **Persistence Layer (PostgreSQL / In-Memory SQL)**:
   - Production PostgreSQL schema with fallback to high-speed in-memory database for local zero-config execution.
