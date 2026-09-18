import app from '../../backend/src/app.js';
import db from '../../backend/src/db/index.js';

describe('ROXSTAR Phase 2 REST API & Database Integration Tests', () => {
  let server;
  let baseUrl;
  let createdUserId;
  let secondUserId;
  let createdRoomId;
  let createdDraftId;

  beforeAll((done) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterAll(async () => {
    // Clean up created test data
    try {
      if (createdRoomId) {
        await db.query('DELETE FROM rooms WHERE id = $1', [createdRoomId]);
      }
      if (createdUserId) {
        await db.query('DELETE FROM users WHERE id = $1', [createdUserId]);
      }
      if (secondUserId) {
        await db.query('DELETE FROM users WHERE id = $1', [secondUserId]);
      }
    } catch (err) {
      console.warn('Cleanup error:', err);
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    const pool = await db.getPool();
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  });

  describe('GET /health (Readiness & DB Ping)', () => {
    it('should return 200 OK with connected database and latency', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.database).toBeDefined();
      expect(data.database.status).toBe('connected');
      expect(typeof data.database.latencyMs).toBe('number');
    });
  });

  describe('POST /api/users (User Identity & Upsert)', () => {
    it('should create a new user with valid username', async () => {
      const testUsername = `tester_${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: testUsername,
          display_name: 'Test Candidate',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.username).toBe(testUsername);
      expect(data.user.virtual_points).toBe(100);

      createdUserId = data.user.id;
    });

    it('should return existing user if username already exists', async () => {
      const secondUsername = `user2_${Date.now()}`;
      const uRes = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: secondUsername, display_name: 'Second User' }),
      });
      const uData = await uRes.json();
      secondUserId = uData.user.id;

      const res = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: secondUsername }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.is_new).toBe(false);
      expect(data.user.id).toBe(secondUserId);
    });

    it('should reject invalid username characters', async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'invalid user with spaces!' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/drafts & /api/drafts/upload (Voice Draft Hosting)', () => {
    it('should create and store draft metadata with hosted URL', async () => {
      const res = await fetch(`${baseUrl}/api/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: createdUserId,
          title: 'My First Echo Voice Draft',
          duration_ms: 4500,
          effect_applied: 'ECHO',
          file_url: `${baseUrl}/uploads/sample-draft.wav`,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.draft).toBeDefined();
      expect(data.draft.title).toBe('My First Echo Voice Draft');
      expect(data.draft.effect_applied).toBe('ECHO');

      createdDraftId = data.draft.id;
    });

    it('should fetch draft by ID', async () => {
      const res = await fetch(`${baseUrl}/api/drafts/${createdDraftId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.draft.id).toBe(createdDraftId);
      expect(data.draft.title).toBe('My First Echo Voice Draft');
    });
  });

  describe('POST /api/rooms & Room Lifecycle (Section B1)', () => {
    it('should create room and assign owner as HOST', async () => {
      const res = await fetch(`${baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Live Voice & Spin Arena',
          owner_id: createdUserId,
          max_participants: 10,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.room).toBeDefined();
      expect(data.room.title).toBe('Live Voice & Spin Arena');
      expect(data.room.status).toBe('ACTIVE');

      createdRoomId = data.room.id;
    });

    it('should list active rooms including online participant count', async () => {
      const res = await fetch(`${baseUrl}/api/rooms`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.rooms)).toBe(true);
      const found = data.rooms.find((r) => r.id === createdRoomId);
      expect(found).toBeDefined();
      expect(parseInt(found.online_participants_count, 10)).toBe(1); // host is online
    });

    it('should allow second user to join room', async () => {
      const res = await fetch(`${baseUrl}/api/rooms/${createdRoomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: secondUserId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.membership.role).toBe('PARTICIPANT');
      expect(data.membership.is_online).toBe(true);
    });

    it('should retrieve full room details with participant list', async () => {
      const res = await fetch(`${baseUrl}/api/rooms/${createdRoomId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.participants.length).toBe(2);
      expect(data.participants.some((p) => p.role === 'HOST')).toBe(true);
      expect(data.participants.some((p) => p.role === 'PARTICIPANT')).toBe(true);
    });

    it('should share a voice draft into the room', async () => {
      const res = await fetch(`${baseUrl}/api/rooms/${createdRoomId}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: createdDraftId,
          user_id: createdUserId,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.shared_draft.title).toBe('My First Echo Voice Draft');
      expect(data.shared_draft.shared_by).toBe(createdUserId);
    });

    it('should list shared drafts in the room', async () => {
      const res = await fetch(`${baseUrl}/api/rooms/${createdRoomId}/drafts`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.drafts.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow second user to leave room', async () => {
      const res = await fetch(`${baseUrl}/api/rooms/${createdRoomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: secondUserId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.membership.is_online).toBe(false);
    });
  });
});
