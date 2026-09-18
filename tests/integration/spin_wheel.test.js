import http from 'http';
import { io as Client } from 'socket.io-client';
import app from '../../backend/src/app.js';
import db from '../../backend/src/db/index.js';
import { initSocketIO } from '../../backend/src/sockets/index.js';
import SpinStateMachine from '../../backend/src/services/spinStateMachine.js';

describe('ROXSTAR Phase 4 Elimination Spin Wheel State Machine & Edge Cases', () => {
  let server;
  let serverPort;
  let ioServer;
  let socketUrl;

  let hostUser;
  let player1;
  let player2;
  let nonHostUser;
  let testRoomId;

  let hostSocket;
  let player1Socket;
  let player2Socket;

  beforeAll(async () => {
    // 1. Start server
    server = http.createServer(app);
    ioServer = initSocketIO(server);

    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        socketUrl = `http://localhost:${serverPort}`;
        resolve();
      });
    });

    // 2. Seed 4 users
    const timestamp = Date.now();
    const uHost = await db.query(
      `INSERT INTO users (username, display_name) VALUES ($1, 'Host User') RETURNING *`,
      [`spin_host_${timestamp}`]
    );
    hostUser = uHost.rows[0];

    const uP1 = await db.query(
      `INSERT INTO users (username, display_name) VALUES ($1, 'Player One') RETURNING *`,
      [`spin_p1_${timestamp}`]
    );
    player1 = uP1.rows[0];

    const uP2 = await db.query(
      `INSERT INTO users (username, display_name) VALUES ($1, 'Player Two') RETURNING *`,
      [`spin_p2_${timestamp}`]
    );
    player2 = uP2.rows[0];

    const uNonHost = await db.query(
      `INSERT INTO users (username, display_name) VALUES ($1, 'Non Host') RETURNING *`,
      [`spin_nh_${timestamp}`]
    );
    nonHostUser = uNonHost.rows[0];

    // Seed room owned by hostUser
    const r = await db.query(
      `INSERT INTO rooms (title, owner_id, max_participants, status)
       VALUES ('Spin Wheel Arena', $1, 10, 'ACTIVE') RETURNING *`,
      [hostUser.id]
    );
    testRoomId = r.rows[0].id;
  });

  afterAll(async () => {
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (player1Socket && player1Socket.connected) player1Socket.disconnect();
    if (player2Socket && player2Socket.connected) player2Socket.disconnect();

    await new Promise((r) => setTimeout(r, 300));

    try {
      if (testRoomId) {
        await db.query('DELETE FROM rooms WHERE id = $1', [testRoomId]);
      }
      const userIds = [hostUser?.id, player1?.id, player2?.id, nonHostUser?.id].filter(Boolean);
      for (const uid of userIds) {
        await db.query('DELETE FROM users WHERE id = $1', [uid]);
      }
    } catch (err) {
      console.warn('DB cleanup warning:', err);
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    const pool = await db.getPool();
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  });

  it('Edge Case 1 (E1): should reject spin start if fewer than 3 participants online', async () => {
    await expect(
      SpinStateMachine.startSpin(testRoomId, hostUser.id, ioServer)
    ).rejects.toThrow(/Minimum 3 participants required/);
  });

  it('Setup: 3 participants join room via WebSocket', (done) => {
    let connectedCount = 0;
    const checkAllJoined = () => {
      connectedCount += 1;
      if (connectedCount === 3) done();
    };

    hostSocket = Client(socketUrl);
    hostSocket.on('connect', () => {
      hostSocket.emit('join_room', { room_id: testRoomId, user_id: hostUser.id }, () => checkAllJoined());
    });

    player1Socket = Client(socketUrl);
    player1Socket.on('connect', () => {
      player1Socket.emit('join_room', { room_id: testRoomId, user_id: player1.id }, () => checkAllJoined());
    });

    player2Socket = Client(socketUrl);
    player2Socket.on('connect', () => {
      player2Socket.emit('join_room', { room_id: testRoomId, user_id: player2.id }, () => checkAllJoined());
    });
  });

  it('Edge Case 2 (E2): should reject spin start if requested by non-host user', async () => {
    await expect(
      SpinStateMachine.startSpin(testRoomId, nonHostUser.id, ioServer)
    ).rejects.toThrow(/Only the room host can start/);
  });

  it('Core State Machine: Host starts spin -> broadcasts spin_started with 3 players', (done) => {
    let hostSawStart = false;
    let p1SawStart = false;

    const checkDone = () => {
      if (hostSawStart && p1SawStart) done();
    };

    hostSocket.once('spin_started', (data) => {
      expect(data.spin_id).toBeDefined();
      expect(data.participants.length).toBe(3);
      expect(data.interval_ms).toBe(300);
      hostSawStart = true;
      checkDone();
    });

    player1Socket.once('spin_started', (data) => {
      expect(data.spin_id).toBeDefined();
      p1SawStart = true;
      checkDone();
    });

    // Start with 300ms interval for fast test
    hostSocket.emit('start_spin', { room_id: testRoomId, user_id: hostUser.id, interval_ms: 300 }, (ack) => {
      expect(ack.success).toBe(true);
    });
  });

  it('Edge Case 3 & 9 (E3/E9): Concurrent spin start attempt is rejected', async () => {
    await expect(
      SpinStateMachine.startSpin(testRoomId, hostUser.id, ioServer)
    ).rejects.toThrow(/A spin is already active/);
  });

  it('Elimination & Winner Resolution: should broadcast eliminations and announce winner with points', (done) => {
    let eliminationsSeen = 0;

    hostSocket.on('user_eliminated', (data) => {
      eliminationsSeen += 1;
      expect(data.eliminated_user).toBeDefined();
      expect(data.remaining_players.length).toBe(3 - eliminationsSeen);
    });

    hostSocket.once('winner_announced', async (data) => {
      hostSocket.off('user_eliminated');
      expect(data.winner).toBeDefined();
      expect(data.winner.prize_points).toBe(50);
      expect(eliminationsSeen).toBe(2); // In 3-player game, exactly 2 eliminated, 1 winner

      // Verify points persisted in DB
      const dbWinner = await db.query('SELECT virtual_points FROM users WHERE id = $1', [data.winner.user_id]);
      expect(dbWinner.rows[0].virtual_points).toBeGreaterThanOrEqual(50);

      // Verify spin status in DB is COMPLETED
      const dbSpin = await db.query('SELECT status, winner_id FROM spins WHERE id = $1', [data.spin_id]);
      expect(dbSpin.rows[0].status).toBe('COMPLETED');
      expect(dbSpin.rows[0].winner_id).toBe(data.winner.user_id);

      done();
    });
  }, 10000);

  it('Edge Case 4 & 5 (E4/E5): Mid-spin disconnect drops room < 2 players -> Aborts spin', async () => {
    // Start a fresh spin with 3 players
    const spinResult = await SpinStateMachine.startSpin(testRoomId, hostUser.id, ioServer, {
      intervalMs: 5000, // standard interval so we can trigger disconnect mid-spin
    });
    expect(spinResult.success).toBe(true);

    const abortPromise = new Promise((resolve) => {
      hostSocket.once('spin_aborted', (data) => {
        expect(data.reason).toBe('INSUFFICIENT_PLAYERS');
        resolve();
      });
    });

    // Both players disconnect mid-spin
    player1Socket.disconnect();
    player2Socket.disconnect();

    await abortPromise;

    // Verify DB status is ABORTED
    const dbSpin = await db.query('SELECT status FROM spins WHERE id = $1', [spinResult.spin.id]);
    expect(dbSpin.rows[0].status).toBe('ABORTED');
  });
});
