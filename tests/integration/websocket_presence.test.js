import http from 'http';
import { io as Client } from 'socket.io-client';
import app from '../../backend/src/app.js';
import db from '../../backend/src/db/index.js';
import { initSocketIO } from '../../backend/src/sockets/index.js';

describe('ROXSTAR Phase 3 WebSocket Presence & Room Sync Tests', () => {
  let server;
  let serverPort;
  let ioServer;
  let socketUrl;

  let hostUser;
  let participantUser;
  let testRoomId;
  let testDraftId;

  let hostSocket;
  let participantSocket;

  beforeAll(async () => {
    // 1. Start HTTP server and attach Socket.IO
    server = http.createServer(app);
    ioServer = initSocketIO(server);

    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        socketUrl = `http://localhost:${serverPort}`;
        resolve();
      });
    });

    // 2. Seed test users and draft in DB
    const u1 = await db.query(
      `INSERT INTO users (username, display_name) 
       VALUES ($1, 'Host Socket User') RETURNING *`,
      [`host_sock_${Date.now()}`]
    );
    hostUser = u1.rows[0];

    const u2 = await db.query(
      `INSERT INTO users (username, display_name) 
       VALUES ($1, 'Participant Socket User') RETURNING *`,
      [`part_sock_${Date.now()}`]
    );
    participantUser = u2.rows[0];

    // Seed test room
    const r = await db.query(
      `INSERT INTO rooms (title, owner_id, max_participants, status)
       VALUES ('WebSocket Live Arena', $1, 10, 'ACTIVE') RETURNING *`,
      [hostUser.id]
    );
    testRoomId = r.rows[0].id;

    // Seed test draft
    const d = await db.query(
      `INSERT INTO drafts (user_id, title, duration_ms, file_url, effect_applied)
       VALUES ($1, 'Socket Test Audio', 3000, 'http://localhost:5000/uploads/test.wav', 'ECHO') RETURNING *`,
      [hostUser.id]
    );
    testDraftId = d.rows[0].id;
  });

  afterAll(async () => {
    // Disconnect sockets
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (participantSocket && participantSocket.connected) participantSocket.disconnect();

    // Clean DB
    try {
      if (testRoomId) {
        await db.query('DELETE FROM rooms WHERE id = $1', [testRoomId]);
      }
      if (hostUser) {
        await db.query('DELETE FROM users WHERE id = $1', [hostUser.id]);
      }
      if (participantUser) {
        await db.query('DELETE FROM users WHERE id = $1', [participantUser.id]);
      }
    } catch (err) {
      console.warn('DB cleanup warning:', err);
    }

    // Close server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    const pool = await db.getPool();
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  });

  it('1. Connection: should establish Socket.IO connection and ping/pong', (done) => {
    hostSocket = Client(socketUrl);
    hostSocket.on('connect', () => {
      expect(hostSocket.id).toBeDefined();
      hostSocket.emit('ping_check', {}, (ack) => {
        expect(ack.pong).toBe(true);
        done();
      });
    });
  });

  it('2. Join Room & Initial Snapshot: Host should receive full room_state', (done) => {
    hostSocket.on('room_state', (state) => {
      expect(state).toBeDefined();
      expect(state.room.id).toBe(testRoomId);
      expect(state.participants.some((p) => p.user_id === hostUser.id)).toBe(true);
      done();
    });

    hostSocket.emit('join_room', { room_id: testRoomId, user_id: hostUser.id });
  });

  it('3. Presence Broadcasting: Host should receive user_joined when second user connects', (done) => {
    hostSocket.once('user_joined', (event) => {
      expect(event).toBeDefined();
      expect(event.user.id).toBe(participantUser.id);
      expect(event.participants.length).toBeGreaterThanOrEqual(2);
      done();
    });

    participantSocket = Client(socketUrl);
    participantSocket.on('connect', () => {
      participantSocket.emit('join_room', { room_id: testRoomId, user_id: participantUser.id });
    });
  });

  it('4. Voice Draft Sharing: All members should receive draft_shared notification', (done) => {
    let hostReceived = false;
    let participantReceived = false;

    const checkBoth = () => {
      if (hostReceived && participantReceived) done();
    };

    hostSocket.once('draft_shared', (draft) => {
      expect(draft.draft_id).toBe(testDraftId);
      expect(draft.title).toBe('Socket Test Audio');
      hostReceived = true;
      checkBoth();
    });

    participantSocket.once('draft_shared', (draft) => {
      expect(draft.draft_id).toBe(testDraftId);
      participantReceived = true;
      checkBoth();
    });

    participantSocket.emit('share_draft', {
      room_id: testRoomId,
      draft_id: testDraftId,
      user_id: participantUser.id,
    });
  });

  it('5. Disconnect & Presence Cleanup: Disconnecting user triggers user_left with presence sync', (done) => {
    hostSocket.once('user_left', (event) => {
      expect(event.user_id).toBe(participantUser.id);
      expect(event.participants.some((p) => p.user_id === participantUser.id)).toBe(false);
      done();
    });

    participantSocket.disconnect();
  });

  it('6. Reconnect & State Synchronization: Rejoining returns latest authoritative snapshot', (done) => {
    const reconnectSocket = Client(socketUrl);
    reconnectSocket.on('connect', () => {
      reconnectSocket.emit('get_room_state', { room_id: testRoomId }, (ack) => {
        expect(ack.success).toBe(true);
        expect(ack.roomState.room.id).toBe(testRoomId);
        expect(Array.isArray(ack.roomState.participants)).toBe(true);
        reconnectSocket.disconnect();
        done();
      });
    });
  });
});
