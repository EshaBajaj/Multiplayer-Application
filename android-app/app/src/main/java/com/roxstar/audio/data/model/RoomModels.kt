package com.roxstar.audio.data.model

import com.google.gson.annotations.SerializedName

data class User(
    val id: String = "",
    val username: String = "",
    @SerializedName("display_name") val displayName: String = "",
    @SerializedName("avatar_url") val avatarUrl: String = "",
    @SerializedName(value = "virtual_points", alternate = ["points"]) val virtualPoints: Int = 100,
    @SerializedName("created_at") val createdAt: String? = null
)

data class Room(
    val id: String = "",
    @SerializedName(value = "name", alternate = ["title"]) val name: String = "",
    @SerializedName(value = "host_id", alternate = ["owner_id"]) val hostId: String = "",
    @SerializedName(value = "participant_count", alternate = ["online_participants_count"]) val participantCount: Int = 1,
    @SerializedName(value = "members", alternate = ["participants"]) val members: List<RoomMember> = emptyList(),
    @SerializedName(value = "shared_drafts", alternate = ["drafts"]) val sharedDrafts: List<SharedDraft> = emptyList()
)

data class RoomMember(
    @SerializedName(value = "user_id", alternate = ["id"]) val userId: String = "",
    val username: String = "",
    val role: String = "MEMBER",
    @SerializedName("is_online") val isOnline: Boolean = true,
    @SerializedName("avatar_url") val avatarUrl: String? = null
)

data class SharedDraft(
    @SerializedName(value = "id", alternate = ["share_id", "draft_id"]) val id: String = "",
    @SerializedName("room_id") val roomId: String? = null,
    @SerializedName(value = "user_id", alternate = ["shared_by"]) val userId: String = "",
    val username: String? = null,
    val title: String = "",
    @SerializedName(value = "audio_url", alternate = ["file_url"]) val audioUrl: String = "",
    @SerializedName("duration_ms") val durationMs: Long = 0L,
    @SerializedName("effect_applied") val effectApplied: String = "ECHO",
    @SerializedName(value = "created_at", alternate = ["shared_at"]) val createdAt: String? = null
) {
    val formattedDuration: String
        get() {
            val totalSeconds = durationMs / 1000
            val minutes = totalSeconds / 60
            val seconds = totalSeconds % 60
            return "%02d:%02d".format(minutes, seconds)
        }
}

data class SpinState(
    val status: String = "WAITING", // WAITING, RUNNING, COMPLETED, ABORTED
    val spinId: String? = null,
    val activePlayers: List<RoomMember> = emptyList(),
    val eliminatedPlayers: List<RoomMember> = emptyList(),
    val winner: WinnerInfo? = null,
    val countdownSeconds: Int = 0,
    val abortReason: String? = null
)

data class WinnerInfo(
    @SerializedName("user_id") val userId: String = "",
    val username: String = "",
    @SerializedName("prize_points") val prizePoints: Int = 50,
    @SerializedName("total_points") val totalPoints: Int = 150
)
