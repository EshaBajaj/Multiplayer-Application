import db from '../db/index.js';
import logger from '../utils/logger.js';

// In-memory mutex locks to guard against rapid double-clicks (Edge Cases 3 & 9)
const activeSpinLocks = new Set();

// In-memory active spin timer tracking (keyed by spinId)
const activeSpinRoutines = new Map();

/**
 * Fisher-Yates array shuffle for true random seating & elimination sequence
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class SpinStateMachine {
  /**
   * Check if room has an active spin in memory or DB
   */
  static isRoomSpinActive(roomId) {
    return activeSpinLocks.has(roomId);
  }

  /**
   * Start Spin Wheel with full validation of all 9 edge cases
   */
  static async startSpin(roomId, requestedByUserId, io, options = {}) {
    const intervalMs = options?.intervalMs ?? 5000;
    const prizePoints = options?.prizePoints ?? 50;

    // Edge Case 9 & 3: In-memory lock guard
    if (activeSpinLocks.has(roomId)) {
      const err = new Error('A spin is already active in this room.');
      err.code = 'SPIN_ALREADY_ACTIVE';
      err.status = 409;
      throw err;
    }

    activeSpinLocks.add(roomId);

    try {
      // 1. Fetch Room & Owner Info
      const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
      if (roomRes.rows.length === 0) {
        throw new Error('Room not found.');
      }
      const room = roomRes.rows[0];

      if (room.status !== 'ACTIVE') {
        const err = new Error('Cannot start spin in a closed room.');
        err.code = 'ROOM_CLOSED';
        err.status = 400;
        throw err;
      }

      // Edge Case 2: Host Permission Check
      if (room.owner_id !== requestedByUserId) {
        const err = new Error('Only the room host can start the spin wheel.');
        err.code = 'ONLY_HOST_ALLOWED';
        err.status = 403;
        throw err;
      }

      // Edge Case 3: DB level active spin check
      const dbSpinCheck = await db.query(
        `SELECT id FROM spins WHERE room_id = $1 AND status IN ('WAITING', 'RUNNING')`,
        [roomId]
      );
      if (dbSpinCheck.rows.length > 0) {
        const err = new Error('A spin is already active in this room.');
        err.code = 'SPIN_ALREADY_ACTIVE';
        err.status = 409;
        throw err;
      }

      // 2. Fetch eligible online participants
      const membersRes = await db.query(
        `SELECT rm.user_id, u.username, u.display_name, u.avatar_url, u.virtual_points
         FROM room_members rm
         JOIN users u ON rm.user_id = u.id
         WHERE rm.room_id = $1 AND rm.is_online = true
         ORDER BY rm.joined_at ASC`,
        [roomId]
      );
      const eligibleUsers = membersRes.rows;

      // Edge Case 1: Minimum 3 participants required
      if (eligibleUsers.length < 3) {
        const err = new Error(`Minimum 3 participants required to start the spin (current online: ${eligibleUsers.length}).`);
        err.code = 'INSUFFICIENT_PARTICIPANTS';
        err.status = 400;
        throw err;
      }

      // 3. Begin DB Transaction to create authoritative spin & participants
      const client = await db.getClient();
      let spin;
      let seatedParticipants = [];

      try {
        await client.query('BEGIN');

        // Insert spin record
        const insertSpinRes = await client.query(
          `INSERT INTO spins (room_id, initiated_by, status, prize_points)
           VALUES ($1, $2, 'RUNNING', $3)
           RETURNING *`,
          [roomId, requestedByUserId, prizePoints]
        );
        spin = insertSpinRes.rows[0];

        // Randomize seating order
        const shuffled = shuffle(eligibleUsers);
        for (let i = 0; i < shuffled.length; i++) {
          const user = shuffled[i];
          const partRes = await client.query(
            `INSERT INTO spin_participants (spin_id, user_id, seat_order, is_eliminated)
             VALUES ($1, $2, $3, false)
             RETURNING id, spin_id, user_id, seat_order, is_eliminated`,
            [spin.id, user.user_id, i + 1]
          );
          seatedParticipants.push({
            ...partRes.rows[0],
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
          });
        }

        // Audit Event 1: SPIN_STARTED
        await client.query(
          `INSERT INTO spin_events (spin_id, event_type, sequence_no, payload_json)
           VALUES ($1, 'SPIN_STARTED', 1, $2)`,
          [
            spin.id,
            JSON.stringify({
              participants_count: seatedParticipants.length,
              interval_ms: intervalMs,
              participants: seatedParticipants,
            }),
          ]
        );

        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        throw dbErr;
      } finally {
        client.release();
      }

      // 4. Initialize active spin routine state
      const routineState = {
        spinId: spin.id,
        roomId,
        hostUserId: room.owner_id,
        intervalMs,
        prizePoints,
        remainingPlayers: [...seatedParticipants],
        eliminatedPlayers: [],
        currentRound: 0,
        sequenceNo: 1,
        timerHandle: null,
        isAborted: false,
        isCompleted: false,
      };

      activeSpinRoutines.set(spin.id, routineState);

      // 5. Broadcast spin_started
      const startPayload = {
        spin_id: spin.id,
        room_id: roomId,
        participants: seatedParticipants,
        interval_ms: routineState.intervalMs,
        start_time: new Date().toISOString(),
      };

      logger.info(`🎡 Spin [${spin.id}] STARTED in Room [${roomId}] with ${seatedParticipants.length} participants.`);
      io.to(`room:${roomId}`).emit('spin_started', startPayload);

      // 6. Schedule first elimination round
      this.scheduleNextElimination(spin.id, io);

      return {
        success: true,
        spin,
        participants: seatedParticipants,
      };
    } catch (err) {
      activeSpinLocks.delete(roomId);
      throw err;
    }
  }

  /**
   * Schedule the next 5-second elimination round
   */
  static scheduleNextElimination(spinId, io) {
    const routine = activeSpinRoutines.get(spinId);
    if (!routine || routine.isAborted || routine.isCompleted) return;

    routine.timerHandle = setTimeout(async () => {
      try {
        await this.executeEliminationRound(spinId, io);
      } catch (err) {
        logger.error(`Error executing spin elimination round for [${spinId}]:`, err);
      }
    }, routine.intervalMs);
  }

  /**
   * Execute single elimination round
   */
  static async executeEliminationRound(spinId, io) {
    const routine = activeSpinRoutines.get(spinId);
    if (!routine || routine.isAborted || routine.isCompleted) return;

    // Edge Case 5: Sudden drop below 2 active players
    if (routine.remainingPlayers.length < 2) {
      await this.abortSpin(spinId, io, 'INSUFFICIENT_PLAYERS');
      return;
    }

    routine.currentRound += 1;
    routine.sequenceNo += 1;

    // Pick a player to eliminate at random from remaining
    const eliminateIndex = Math.floor(Math.random() * routine.remainingPlayers.length);
    const [eliminatedUser] = routine.remainingPlayers.splice(eliminateIndex, 1);
    routine.eliminatedPlayers.push(eliminatedUser);

    // Update database
    await db.query(
      `UPDATE spin_participants
       SET is_eliminated = true, elimination_round = $1, eliminated_at = NOW()
       WHERE spin_id = $2 AND user_id = $3`,
      [routine.currentRound, spinId, eliminatedUser.user_id]
    );

    // Audit Event: USER_ELIMINATED
    const eliminationPayload = {
      spin_id: spinId,
      room_id: routine.roomId,
      eliminated_user: {
        user_id: eliminatedUser.user_id,
        username: eliminatedUser.username,
        display_name: eliminatedUser.display_name,
      },
      elimination_round: routine.currentRound,
      remaining_players: routine.remainingPlayers.map((p) => ({
        user_id: p.user_id,
        username: p.username,
        display_name: p.display_name,
      })),
      timestamp: new Date().toISOString(),
    };

    await db.query(
      `INSERT INTO spin_events (spin_id, event_type, sequence_no, payload_json)
       VALUES ($1, 'USER_ELIMINATED', (SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM spin_events WHERE spin_id = $1), $2)`,
      [spinId, JSON.stringify(eliminationPayload)]
    );

    logger.info(`💥 Spin [${spinId}] Round ${routine.currentRound}: Eliminated [${eliminatedUser.username}], ${routine.remainingPlayers.length} remaining.`);
    io.to(`room:${routine.roomId}`).emit('user_eliminated', eliminationPayload);

    // Check if we have a winner
    if (routine.remainingPlayers.length === 1) {
      await this.concludeWinner(spinId, io);
    } else {
      // Schedule next elimination round
      this.scheduleNextElimination(spinId, io);
    }
  }

  /**
   * Conclude spin and announce winner
   */
  static async concludeWinner(spinId, io) {
    const routine = activeSpinRoutines.get(spinId);
    if (!routine || routine.isCompleted || routine.isAborted) return;

    routine.isCompleted = true;
    clearTimeout(routine.timerHandle);

    const winner = routine.remainingPlayers[0];
    routine.sequenceNo += 1;

    // 1. Update spin record to COMPLETED with winner_id
    await db.query(
      `UPDATE spins
       SET status = 'COMPLETED', winner_id = $1, completed_at = NOW()
       WHERE id = $2`,
      [winner.user_id, spinId]
    );

    // 2. Award prize virtual points to winner
    const userRes = await db.query(
      `UPDATE users
       SET virtual_points = virtual_points + $1
       WHERE id = $2
       RETURNING virtual_points`,
      [routine.prizePoints, winner.user_id]
    );
    const newTotalPoints = userRes.rows[0]?.virtual_points || 0;

    // 3. Audit Event: WINNER_ANNOUNCED
    const winnerPayload = {
      spin_id: spinId,
      room_id: routine.roomId,
      winner: {
        user_id: winner.user_id,
        username: winner.username,
        display_name: winner.display_name,
        prize_points: routine.prizePoints,
        total_points: newTotalPoints,
      },
      completed_at: new Date().toISOString(),
    };

    await db.query(
      `INSERT INTO spin_events (spin_id, event_type, sequence_no, payload_json)
       VALUES ($1, 'WINNER_ANNOUNCED', (SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM spin_events WHERE spin_id = $1), $2)`,
      [spinId, JSON.stringify(winnerPayload)]
    );

    logger.info(`🏆 Spin [${spinId}] WINNER: [${winner.username}] won ${routine.prizePoints} points! (Total: ${newTotalPoints})`);
    io.to(`room:${routine.roomId}`).emit('winner_announced', winnerPayload);

    // Clean up locks
    activeSpinLocks.delete(routine.roomId);
    activeSpinRoutines.delete(spinId);
  }

  /**
   * Abort active spin (e.g. Edge Case 5: participants drop below 2)
   */
  static async abortSpin(spinId, io, reason = 'ABORTED') {
    const routine = activeSpinRoutines.get(spinId);
    if (!routine || routine.isAborted || routine.isCompleted) return;

    routine.isAborted = true;
    clearTimeout(routine.timerHandle);

    // Update DB
    await db.query(
      `UPDATE spins
       SET status = 'ABORTED', completed_at = NOW()
       WHERE id = $1`,
      [spinId]
    );

    const abortPayload = {
      spin_id: spinId,
      room_id: routine.roomId,
      reason,
      remaining_players: routine.remainingPlayers.map((p) => ({
        user_id: p.user_id,
        username: p.username,
      })),
      aborted_at: new Date().toISOString(),
    };

    await db.query(
      `INSERT INTO spin_events (spin_id, event_type, sequence_no, payload_json)
       VALUES ($1, 'SPIN_ABORTED', (SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM spin_events WHERE spin_id = $1), $2)`,
      [spinId, JSON.stringify(abortPayload)]
    );

    logger.warn(`🛑 Spin [${spinId}] ABORTED. Reason: ${reason}`);
    io.to(`room:${routine.roomId}`).emit('spin_aborted', abortPayload);

    // Clean up locks
    activeSpinLocks.delete(routine.roomId);
    activeSpinRoutines.delete(spinId);
  }

  /**
   * Edge Case 4 & 6: Handle participant disconnect or leave mid-spin
   */
  static async handleParticipantLeave(roomId, userId, io) {
    // Find active routine for this room
    let targetRoutine = null;
    for (const routine of activeSpinRoutines.values()) {
      if (routine.roomId === roomId && !routine.isCompleted && !routine.isAborted) {
        targetRoutine = routine;
        break;
      }
    }

    if (!targetRoutine) return; // No active spin running

    // Edge Case 6: If the user who left is the Host, the spin CONTINUES autonomously!
    if (userId === targetRoutine.hostUserId) {
      logger.info(`Host [${userId}] left room during active spin [${targetRoutine.spinId}]. Spin continues autonomously.`);
    }

    // Edge Case 4: If disconnecting user is an active uneliminated participant
    const playerIndex = targetRoutine.remainingPlayers.findIndex((p) => p.user_id === userId);
    if (playerIndex !== -1) {
      const [disconnectedPlayer] = targetRoutine.remainingPlayers.splice(playerIndex, 1);
      targetRoutine.eliminatedPlayers.push(disconnectedPlayer);

      logger.info(`Active participant [${disconnectedPlayer.username}] left during spin [${targetRoutine.spinId}]. Auto-eliminating.`);

      // Update DB
      await db.query(
        `UPDATE spin_participants
         SET is_eliminated = true, elimination_round = $1, eliminated_at = NOW()
         WHERE spin_id = $2 AND user_id = $3`,
        [targetRoutine.currentRound, targetRoutine.spinId, userId]
      );

      const payload = {
        spin_id: targetRoutine.spinId,
        room_id: roomId,
        eliminated_user: {
          user_id: disconnectedPlayer.user_id,
          username: disconnectedPlayer.username,
          display_name: disconnectedPlayer.display_name,
        },
        reason: 'DISCONNECTED',
        elimination_round: targetRoutine.currentRound,
        remaining_players: targetRoutine.remainingPlayers.map((p) => ({
          user_id: p.user_id,
          username: p.username,
          display_name: p.display_name,
        })),
        timestamp: new Date().toISOString(),
      };

      await db.query(
        `INSERT INTO spin_events (spin_id, event_type, sequence_no, payload_json)
         VALUES ($1, 'USER_ELIMINATED', (SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM spin_events WHERE spin_id = $1), $2)`,
        [targetRoutine.spinId, JSON.stringify(payload)]
      );

      io.to(`room:${roomId}`).emit('user_eliminated', payload);

      // Edge Case 5: Sudden drop below 2 active players -> Abort immediately
      if (targetRoutine.remainingPlayers.length < 2) {
        await this.abortSpin(targetRoutine.spinId, io, 'INSUFFICIENT_PLAYERS');
      }
    }
  }
}

export default SpinStateMachine;
