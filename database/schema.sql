-- ============================================================================
-- ROXSTAR Platform: Unified PostgreSQL Database Schema
-- Entities: Users, Rooms, RoomMembers, Drafts, RoomSharedDrafts,
--           Spins, SpinParticipants, SpinEvents
-- ============================================================================

-- Enable pgcrypto / uuid extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. USERS: Participant identity and profile metadata
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    avatar_url TEXT,
    virtual_points INTEGER NOT NULL DEFAULT 100 CHECK (virtual_points >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. ROOMS: Room owner, status and timestamps
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(128) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
    max_participants INTEGER NOT NULL DEFAULT 20 CHECK (max_participants >= 3 AND max_participants <= 20),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE
);

-- ----------------------------------------------------------------------------
-- 3. ROOM_MEMBERS: Membership, connection state, and roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'PARTICIPANT' CHECK (role IN ('HOST', 'PARTICIPANT')),
    is_online BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_room_member UNIQUE (room_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 4. DRAFTS: Recording metadata and hosted file location
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    file_url TEXT NOT NULL,
    effect_applied VARCHAR(32) NOT NULL DEFAULT 'NONE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. ROOM_SHARED_DRAFTS: Tracks voice drafts shared into a room
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_shared_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. SPINS: Room, status, start/completion time and winner
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'RUNNING', 'COMPLETED', 'ABORTED')),
    winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    prize_points INTEGER NOT NULL DEFAULT 100 CHECK (prize_points >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Crucial Constraint: Exactly ONE active spin per room ('WAITING' or 'RUNNING')
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_spin_per_room 
ON spins (room_id) 
WHERE status IN ('WAITING', 'RUNNING');

-- ----------------------------------------------------------------------------
-- 7. SPIN_PARTICIPANTS: Eligibility, elimination order/time and final status
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spin_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spin_id UUID NOT NULL REFERENCES spins(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seat_order INTEGER NOT NULL,
    is_eliminated BOOLEAN NOT NULL DEFAULT FALSE,
    elimination_round INTEGER,
    eliminated_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_spin_participant UNIQUE (spin_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 8. SPIN_EVENTS: Auditable event sequence and final outcome record
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spin_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spin_id UUID NOT NULL REFERENCES spins(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('SPIN_STARTED', 'USER_ELIMINATED', 'WINNER_ANNOUNCED', 'SPIN_ABORTED')),
    sequence_no INTEGER NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_spin_event_seq UNIQUE (spin_id, sequence_no)
);

-- ----------------------------------------------------------------------------
-- PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_room_shared_drafts_room ON room_shared_drafts(room_id);
CREATE INDEX IF NOT EXISTS idx_spins_room_id ON spins(room_id);
CREATE INDEX IF NOT EXISTS idx_spins_status ON spins(status);
CREATE INDEX IF NOT EXISTS idx_spin_participants_spin_id ON spin_participants(spin_id);
CREATE INDEX IF NOT EXISTS idx_spin_participants_user_id ON spin_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_spin_events_spin_id ON spin_events(spin_id);
