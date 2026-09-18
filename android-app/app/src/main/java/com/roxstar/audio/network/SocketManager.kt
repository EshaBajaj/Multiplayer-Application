package com.roxstar.audio.network

import android.util.Log
import com.google.gson.Gson
import com.roxstar.audio.data.model.Room
import com.roxstar.audio.data.model.RoomMember
import com.roxstar.audio.data.model.SharedDraft
import com.roxstar.audio.data.model.WinnerInfo
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

sealed class SocketEvent {
    data class Connected(val socketId: String) : SocketEvent()
    object Disconnected : SocketEvent()
    data class RoomStateReceived(val room: Room, val activeSpin: JSONObject?) : SocketEvent()
    data class UserJoined(val user: RoomMember, val participants: List<RoomMember>? = null) : SocketEvent()
    data class UserLeft(val userId: String, val username: String, val participants: List<RoomMember>? = null) : SocketEvent()
    data class DraftShared(val draft: SharedDraft) : SocketEvent()
    data class SpinStarted(val spinId: String, val participants: List<RoomMember>) : SocketEvent()
    data class UserEliminated(
        val spinId: String,
        val eliminatedUser: RoomMember,
        val remainingPlayers: List<RoomMember>
    ) : SocketEvent()
    data class WinnerAnnounced(
        val spinId: String,
        val winner: WinnerInfo
    ) : SocketEvent()
    data class SpinAborted(val spinId: String, val reason: String) : SocketEvent()
    data class SpinError(val message: String) : SocketEvent()
}

class SocketManager {
    private val TAG = "SocketManager"
    private val gson = Gson()
    private val scope = CoroutineScope(Dispatchers.Main)

    private var socket: Socket? = null

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _events = MutableSharedFlow<SocketEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<SocketEvent> = _events.asSharedFlow()

    fun connect(serverUrl: String) {
        if (socket?.connected() == true) return

        try {
            val opts = IO.Options().apply {
                forceNew = true
                reconnection = true
                reconnectionAttempts = 10
                reconnectionDelay = 1000
                timeout = 10000
                transports = arrayOf("websocket", "polling")
            }

            val s = IO.socket(serverUrl, opts)
            socket = s

            s.on(Socket.EVENT_CONNECT) {
                Log.i(TAG, "Socket connected: ${s.id()}")
                _isConnected.value = true
                scope.launch { _events.emit(SocketEvent.Connected(s.id())) }
            }

            s.on(Socket.EVENT_DISCONNECT) {
                Log.w(TAG, "Socket disconnected")
                _isConnected.value = false
                scope.launch { _events.emit(SocketEvent.Disconnected) }
            }

            s.on(Socket.EVENT_CONNECT_ERROR) { args ->
                val err = if (args.isNotEmpty()) args[0].toString() else "Unknown"
                Log.e(TAG, "Socket connect error: $err")
                _isConnected.value = false
            }

            s.on("room_state") { args ->
                try {
                    if (args.isNotEmpty() && args[0] is JSONObject) {
                        val json = args[0] as JSONObject
                        val roomObj = json.optJSONObject("room") ?: json
                        if (json.has("participants") && !roomObj.has("members")) {
                            roomObj.put("members", json.getJSONArray("participants"))
                        }
                        if (json.has("shared_drafts") && !roomObj.has("shared_drafts")) {
                            roomObj.put("shared_drafts", json.getJSONArray("shared_drafts"))
                        }
                        val room = gson.fromJson(roomObj.toString(), Room::class.java)
                        val activeSpinJson = json.optJSONObject("active_spin")
                        scope.launch { _events.emit(SocketEvent.RoomStateReceived(room, activeSpinJson)) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing room_state", e)
                }
            }

            s.on("user_joined") { args ->
                try {
                    if (args.isNotEmpty() && args[0] is JSONObject) {
                        val json = args[0] as JSONObject
                        val userObj = json.optJSONObject("user") ?: json
                        val member = RoomMember(
                            userId = userObj.optString("user_id", userObj.optString("id")),
                            username = userObj.optString("username", "Participant"),
                            role = userObj.optString("role", "PARTICIPANT"),
                            isOnline = true,
                            avatarUrl = userObj.optString("avatar_url", null)
                        )
                        val partsList = mutableListOf<RoomMember>()
                        val partsArr = json.optJSONArray("participants")
                        if (partsArr != null) {
                            for (i in 0 until partsArr.length()) {
                                val pObj = partsArr.getJSONObject(i)
                                partsList.add(
                                    RoomMember(
                                        userId = pObj.optString("user_id", pObj.optString("id")),
                                        username = pObj.optString("username", "User"),
                                        role = pObj.optString("role", "PARTICIPANT"),
                                        isOnline = pObj.optBoolean("is_online", true),
                                        avatarUrl = pObj.optString("avatar_url", null)
                                    )
                                )
                            }
                        }
                        scope.launch { _events.emit(SocketEvent.UserJoined(member, if (partsList.isNotEmpty()) partsList else null)) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user_joined", e)
                }
            }

            s.on("user_left") { args ->
                try {
                    if (args.isNotEmpty() && args[0] is JSONObject) {
                        val json = args[0] as JSONObject
                        val uid = json.optString("user_id", "")
                        val uname = json.optString("username", "")
                        val partsList = mutableListOf<RoomMember>()
                        val partsArr = json.optJSONArray("participants")
                        if (partsArr != null) {
                            for (i in 0 until partsArr.length()) {
                                val pObj = partsArr.getJSONObject(i)
                                partsList.add(
                                    RoomMember(
                                        userId = pObj.optString("user_id", pObj.optString("id")),
                                        username = pObj.optString("username", "User"),
                                        role = pObj.optString("role", "PARTICIPANT"),
                                        isOnline = pObj.optBoolean("is_online", false),
                                        avatarUrl = pObj.optString("avatar_url", null)
                                    )
                                )
                            }
                        }
                        scope.launch { _events.emit(SocketEvent.UserLeft(uid, uname, if (partsList.isNotEmpty()) partsList else null)) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user_left", e)
                }
            }

            s.on("draft_shared") { args ->
                try {
                    if (args.isNotEmpty() && args[0] is JSONObject) {
                        val json = args[0] as JSONObject
                        val draftJson = json.optJSONObject("draft") ?: json
                        val draft = gson.fromJson(draftJson.toString(), SharedDraft::class.java)
                        scope.launch { _events.emit(SocketEvent.DraftShared(draft)) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing draft_shared", e)
                }
            }

            s.on("spin_started") { args ->
                try {
                    if (args.isNotEmpty() && args[0] is JSONObject) {
                        val json = args[0] as JSONObject
                        val spinId = json.getString("spin_id")
                        val participantsArr = json.getJSONArray("participants")
                        val members = mutableListOf<RoomMember>()
                        for (i in 0 until participantsArr.length()) {
                            val p = participantsArr.getJSONObject(i)
                            members.add(
                                RoomMember(
                                    userId = p.getString("user_id"),
                                    username = p.getString("username"),
                                    isOnline = true
                                )
                            )
                        }
                        scope.launch { _events.emit(SocketEvent.SpinStarted(spinId, members)) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing spin_started", e)
                }
            }

            s.on("user_eliminated") { args ->
                try {
                    if (args.isNotEmpty() && args[0] is JSONObject) {
                        val json = args[0] as JSONObject
                        val spinId = json.getString("spin_id")
                        val elimJson = json.getJSONObject("eliminated_user")
                        val elimMember = RoomMember(
                            userId = elimJson.getString("user_id"),
                            username = elimJson.getString("username"),
                            isOnline = false
                        )
                        val remainingArr = json.getJSONArray("remaining_players")
                        val remaining = mutableListOf<RoomMember>()
                        for (i in 0 until remainingArr.length()) {
                            val p = remainingArr.getJSONObject(i)
                            remaining.add(
                                RoomMember(
                                    userId = p.getString("user_id"),
                                    username = p.getString("username"),
                                    isOnline = true
                                )
                            )
                        }
                        scope.launch { _events.emit(SocketEvent.UserEliminated(spinId, elimMember, remaining)) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user_eliminated", e)
                }
            }

            s.on("winner_announced") { args ->
                try {
                    if (args.isNotEmpty() && args[0] is JSONObject) {
                        val json = args[0] as JSONObject
                        val spinId = json.getString("spin_id")
                        val wJson = json.getJSONObject("winner")
                        val winner = WinnerInfo(
                            userId = wJson.getString("user_id"),
                            username = wJson.getString("username"),
                            prizePoints = wJson.optInt("prize_points", 50),
                            totalPoints = wJson.optInt("total_points", 150)
                        )
                        scope.launch { _events.emit(SocketEvent.WinnerAnnounced(spinId, winner)) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing winner_announced", e)
                }
            }

            s.on("spin_aborted") { args ->
                try {
                    if (args.isNotEmpty() && args[0] is JSONObject) {
                        val json = args[0] as JSONObject
                        val spinId = json.optString("spin_id", "")
                        val reason = json.optString("reason", "ABORTED")
                        scope.launch { _events.emit(SocketEvent.SpinAborted(spinId, reason)) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing spin_aborted", e)
                }
            }

            s.on("spin_error") { args ->
                val msg = if (args.isNotEmpty()) args[0].toString() else "Spin error"
                scope.launch { _events.emit(SocketEvent.SpinError(msg)) }
            }

            s.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize socket", e)
        }
    }

    fun joinRoom(roomId: String, userId: String, username: String) {
        val payload = JSONObject().apply {
            put("room_id", roomId)
            put("user_id", userId)
            put("username", username)
        }
        socket?.emit("join_room", payload)
        Log.i(TAG, "Emitted join_room for user $username in room $roomId")
    }

    fun leaveRoom(roomId: String, userId: String) {
        val payload = JSONObject().apply {
            put("room_id", roomId)
            put("user_id", userId)
        }
        socket?.emit("leave_room", payload)
    }

    fun shareDraft(roomId: String, userId: String, draftId: String) {
        val payload = JSONObject().apply {
            put("room_id", roomId)
            put("user_id", userId)
            put("draft_id", draftId)
        }
        socket?.emit("share_draft", payload)
    }

    fun startSpin(roomId: String, userId: String) {
        val payload = JSONObject().apply {
            put("room_id", roomId)
            put("user_id", userId)
        }
        socket?.emit("start_spin", payload)
        Log.i(TAG, "Emitted start_spin for room $roomId")
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        _isConnected.value = false
    }
}
