import { v4 as uuidv4 } from 'uuid';

// In-Memory Database Tables
const tables = {
  users: [],
  rooms: [],
  room_members: [],
  drafts: [],
  room_shared_drafts: [],
  spins: [],
  spin_participants: [],
  spin_events: [],
};

export const checkHealth = async () => {
  return {
    status: 'connected',
    latencyMs: 1,
    timestamp: new Date().toISOString(),
    version: 'In-Memory DB Engine 1.0.0 (Supabase / Postgres Fallback Ready)',
  };
};

export const query = async (text, params = []) => {
  const sql = text.trim();
  const lowerSql = sql.toLowerCase();

  // 1. Health check / SELECT NOW()
  if (lowerSql.startsWith('select now()')) {
    return { rows: [{ current_time: new Date().toISOString(), version: 'In-Memory Engine' }] };
  }

  // 2. Startup Recovery: UPDATE spins SET status = 'ABORTED' ...
  if (lowerSql.includes('update spins') && lowerSql.includes("set status = 'aborted'")) {
    const aborted = [];
    tables.spins.forEach((s) => {
      if (s.status === 'WAITING' || s.status === 'RUNNING') {
        s.status = 'ABORTED';
        s.completed_at = new Date().toISOString();
        aborted.push({ id: s.id, room_id: s.room_id });
      }
    });
    return { rows: aborted, rowCount: aborted.length };
  }

  // 3. USERS
  if (lowerSql.includes('from users') && lowerSql.startsWith('select')) {
    if (lowerSql.includes('where username = $1')) {
      const match = tables.users.find((u) => u.username === params[0]);
      return { rows: match ? [match] : [] };
    }
    if (lowerSql.includes('where id = $1')) {
      const match = tables.users.find((u) => u.id === params[0]);
      return { rows: match ? [match] : [] };
    }
    return { rows: [...tables.users] };
  }

  if (lowerSql.startsWith('insert into users')) {
    const user = {
      id: uuidv4(),
      username: params[0],
      display_name: params[1] || params[0],
      avatar_url: params[2] || `https://api.dicebear.com/7.x/bottts/svg?seed=${params[0]}`,
      virtual_points: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    tables.users.push(user);
    return { rows: [user] };
  }

  if (lowerSql.startsWith('update users') && lowerSql.includes('virtual_points')) {
    const pointsToAdd = params[0];
    const userId = params[1];
    const user = tables.users.find((u) => u.id === userId);
    if (user) {
      user.virtual_points = (user.virtual_points || 0) + pointsToAdd;
      user.updated_at = new Date().toISOString();
      return { rows: [{ virtual_points: user.virtual_points }] };
    }
    return { rows: [] };
  }

  // 4. ROOMS
  if (lowerSql.startsWith('insert into rooms')) {
    let title = params[0];
    let ownerId = params[1];
    let maxParticipants = params[2];

    if (params.length === 1) {
      ownerId = params[0];
      if (sql.includes("'")) {
        const matches = sql.match(/'([^']+)'/g);
        if (matches && matches.length > 0) title = matches[0].replace(/'/g, '');
      }
    }
    const room = {
      id: uuidv4(),
      title: title || 'Room',
      owner_id: ownerId,
      max_participants: maxParticipants || 20,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      closed_at: null,
    };
    tables.rooms.push(room);
    return { rows: [room] };
  }

  if (lowerSql.includes('from rooms') && lowerSql.includes('order by r.created_at desc')) {
    // List rooms
    const activeRooms = tables.rooms
      .filter((r) => r.status === 'ACTIVE')
      .map((r) => {
        const owner = tables.users.find((u) => u.id === r.owner_id) || {};
        const onlineMembers = tables.room_members.filter((rm) => rm.room_id === r.id && rm.is_online);
        const hasActiveSpin = tables.spins.some((s) => s.room_id === r.id && (s.status === 'WAITING' || s.status === 'RUNNING'));
        return {
          id: r.id,
          title: r.title,
          owner_id: r.owner_id,
          status: r.status,
          max_participants: r.max_participants,
          created_at: r.created_at,
          owner_username: owner.username || 'Host',
          owner_display_name: owner.display_name || 'Host',
          owner_avatar_url: owner.avatar_url,
          online_participants_count: onlineMembers.length,
          has_active_spin: hasActiveSpin,
        };
      });
    return { rows: activeRooms };
  }

  if (lowerSql.includes('from rooms') && lowerSql.includes('where r.id = $1')) {
    const roomId = params[0];
    const r = tables.rooms.find((rm) => rm.id === roomId);
    if (!r) return { rows: [] };
    const owner = tables.users.find((u) => u.id === r.owner_id) || {};
    return {
      rows: [
        {
          ...r,
          owner_username: owner.username,
          owner_display_name: owner.display_name,
          owner_avatar_url: owner.avatar_url,
        },
      ],
    };
  }

  if (lowerSql.includes('from rooms where id = $1') || lowerSql.includes('select * from rooms where id = $1')) {
    const roomId = params[0];
    const r = tables.rooms.find((rm) => rm.id === roomId);
    return { rows: r ? [r] : [] };
  }

  // 5. ROOM MEMBERS
  if (lowerSql.startsWith('insert into room_members')) {
    const roomId = params[0];
    const userId = params[1];
    let role = params[2];
    if (!role) {
      if (lowerSql.includes("'host'")) role = 'HOST';
      else role = 'PARTICIPANT';
    }

    let existing = tables.room_members.find((rm) => rm.room_id === roomId && rm.user_id === userId);
    if (existing) {
      existing.is_online = true;
      existing.role = role;
      existing.left_at = null;
      return { rows: [existing] };
    } else {
      const member = {
        id: uuidv4(),
        room_id: roomId,
        user_id: userId,
        role,
        is_online: true,
        joined_at: new Date().toISOString(),
        left_at: null,
      };
      tables.room_members.push(member);
      return { rows: [member] };
    }
  }

  if (lowerSql.includes('from room_members') && lowerSql.includes('rm.room_id = $1')) {
    const roomId = params[0];
    const members = tables.room_members
      .filter((rm) => rm.room_id === roomId && rm.is_online)
      .map((rm) => {
        const u = tables.users.find((usr) => usr.id === rm.user_id) || {};
        return {
          membership_id: rm.id,
          role: rm.role,
          is_online: rm.is_online,
          joined_at: rm.joined_at,
          user_id: u.id,
          username: u.username,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          virtual_points: u.virtual_points,
        };
      });
    return { rows: members };
  }

  if (lowerSql.includes('select count(*) from room_members where room_id = $1')) {
    const roomId = params[0];
    const excludeUserId = params[1];
    const count = tables.room_members.filter((rm) => rm.room_id === roomId && rm.is_online && rm.user_id !== excludeUserId).length;
    return { rows: [{ count }] };
  }

  if (lowerSql.startsWith('update room_members')) {
    const roomId = params[0];
    const userId = params[1];
    const member = tables.room_members.find((rm) => rm.room_id === roomId && rm.user_id === userId);
    if (member) {
      member.is_online = false;
      member.left_at = new Date().toISOString();
      return { rows: [member] };
    }
    return { rows: [] };
  }

  // 6. DRAFTS & SHARED DRAFTS
  if (lowerSql.startsWith('insert into drafts')) {
    let title = params[1];
    if (!title && sql.includes("'")) {
      const singleQuoteMatches = sql.match(/'([^']+)'/g);
      if (singleQuoteMatches && singleQuoteMatches.length > 0) {
        title = singleQuoteMatches[0].replace(/'/g, '');
      }
    }
    const draft = {
      id: uuidv4(),
      user_id: params[0],
      title: title || 'Voice Draft',
      duration_ms: params[2] || 3000,
      file_url: params[3] || 'http://localhost:5000/uploads/test.wav',
      effect_applied: params[4] || 'ECHO',
      created_at: new Date().toISOString(),
    };
    tables.drafts.push(draft);
    return { rows: [draft] };
  }

  if (lowerSql.includes('from drafts') && (lowerSql.includes('where user_id = $1') || lowerSql.includes('where d.user_id = $1'))) {
    const userId = params[0];
    const userDrafts = tables.drafts.filter((d) => d.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { rows: userDrafts };
  }

  if (lowerSql.includes('from drafts') && (lowerSql.includes('where id = $1') || lowerSql.includes('where d.id = $1'))) {
    const draftId = params[0];
    const draft = tables.drafts.find((d) => d.id === draftId);
    if (!draft) return { rows: [] };
    const user = tables.users.find((u) => u.id === draft.user_id) || {};
    return {
      rows: [{
        ...draft,
        username: user.username,
        display_name: user.display_name,
      }]
    };
  }

  if (lowerSql.startsWith('insert into room_shared_drafts')) {
    const shared = {
      id: uuidv4(),
      room_id: params[0],
      draft_id: params[1],
      shared_by: params[2],
      shared_at: new Date().toISOString(),
    };
    tables.room_shared_drafts.push(shared);
    return { rows: [shared] };
  }

  if (lowerSql.includes('from room_shared_drafts')) {
    const roomId = params[0];
    const shared = tables.room_shared_drafts
      .filter((rsd) => rsd.room_id === roomId)
      .map((rsd) => {
        const d = tables.drafts.find((dr) => dr.id === rsd.draft_id) || {};
        const u = tables.users.find((usr) => usr.id === rsd.shared_by) || {};
        return {
          share_id: rsd.id,
          shared_at: rsd.shared_at,
          draft_id: d.id,
          title: d.title || 'Voice Draft',
          duration_ms: d.duration_ms || 0,
          file_url: d.file_url || '',
          effect_applied: d.effect_applied || 'NONE',
          user_id: u.id,
          username: u.username,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          shared_by_username: u.username,
          shared_by_display_name: u.display_name,
        };
      })
      .sort((a, b) => new Date(b.shared_at) - new Date(a.shared_at));
    return { rows: shared };
  }

  // 7. SPINS, PARTICIPANTS, EVENTS
  if (lowerSql.includes('from spins') && lowerSql.includes('where id = $1')) {
    const spinId = params[0];
    const s = tables.spins.find((sp) => sp.id === spinId);
    return { rows: s ? [s] : [] };
  }

  if (lowerSql.includes('from spins') && lowerSql.includes("status in ('waiting', 'running')")) {
    const roomId = params[0];
    const match = tables.spins.find((s) => s.room_id === roomId && (s.status === 'WAITING' || s.status === 'RUNNING'));
    return { rows: match ? [match] : [] };
  }

  if (lowerSql.startsWith('insert into spins')) {
    const spin = {
      id: uuidv4(),
      room_id: params[0],
      initiated_by: params[1],
      status: 'RUNNING',
      prize_points: params[2] || 50,
      created_at: new Date().toISOString(),
      completed_at: null,
      winner_id: null,
    };
    tables.spins.push(spin);
    return { rows: [spin] };
  }

  if (lowerSql.startsWith('insert into spin_participants')) {
    const part = {
      id: uuidv4(),
      spin_id: params[0],
      user_id: params[1],
      seat_order: params[2],
      is_eliminated: params[3] || false,
      elimination_round: null,
      eliminated_at: null,
    };
    tables.spin_participants.push(part);
    return { rows: [part] };
  }

  if (lowerSql.startsWith('update spin_participants')) {
    const round = params[0];
    const spinId = params[1];
    const userId = params[2];
    const p = tables.spin_participants.find((sp) => sp.spin_id === spinId && sp.user_id === userId);
    if (p) {
      p.is_eliminated = true;
      p.elimination_round = round;
      p.eliminated_at = new Date().toISOString();
    }
    return { rows: [] };
  }

  if (lowerSql.startsWith('update spins') && lowerSql.includes("status = 'completed'")) {
    const winnerId = params[0];
    const spinId = params[1];
    const s = tables.spins.find((sp) => sp.id === spinId);
    if (s) {
      s.status = 'COMPLETED';
      s.winner_id = winnerId;
      s.completed_at = new Date().toISOString();
    }
    return { rows: [] };
  }

  if (lowerSql.startsWith('update spins') && lowerSql.includes("status = 'aborted'")) {
    const spinId = params[0];
    const s = tables.spins.find((sp) => sp.id === spinId);
    if (s) {
      s.status = 'ABORTED';
      s.completed_at = new Date().toISOString();
    }
    return { rows: [] };
  }

  if (lowerSql.startsWith('insert into spin_events')) {
    const event = {
      id: uuidv4(),
      spin_id: params[0],
      event_type: params[1],
      sequence_no: params[2] || 1,
      payload_json: params[3],
      created_at: new Date().toISOString(),
    };
    tables.spin_events.push(event);
    return { rows: [event] };
  }

  return { rows: [], rowCount: 0 };
};

export const getClient = async () => {
  return {
    query: async (text, params) => query(text, params),
    release: () => {},
  };
};

export const getPool = async () => {
  return {
    query,
    getClient,
    ended: false,
  };
};

export default {
  getPool,
  query,
  getClient,
  checkHealth,
};
