package com.roxstar.audio.ui.room

import android.app.Application
import android.media.MediaPlayer
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.roxstar.audio.data.model.*
import com.roxstar.audio.data.repository.DraftRepository
import com.roxstar.audio.network.ApiClient
import com.roxstar.audio.network.SocketEvent
import com.roxstar.audio.network.SocketManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

class RoomViewModel(application: Application) : AndroidViewModel(application) {
    private val TAG = "RoomViewModel"
    private val apiClient = ApiClient()
    private val socketManager = SocketManager()
    private val localDraftRepo = DraftRepository(application.applicationContext)

    val localDraftsFlow = localDraftRepo.draftsFlow

    private val _serverUrl = MutableStateFlow("http://10.0.2.2:5000") // 10.0.2.2 for emulator, 10.108.172.139 for real device
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    private val _activeRooms = MutableStateFlow<List<Room>>(emptyList())
    val activeRooms: StateFlow<List<Room>> = _activeRooms.asStateFlow()

    private val _currentRoom = MutableStateFlow<Room?>(null)
    val currentRoom: StateFlow<Room?> = _currentRoom.asStateFlow()

    private val _spinState = MutableStateFlow(SpinState())
    val spinState: StateFlow<SpinState> = _spinState.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _statusMessage = MutableStateFlow<String?>(null)
    val statusMessage: StateFlow<String?> = _statusMessage.asStateFlow()

    // Shared Draft Playback
    private var roomAudioPlayer: MediaPlayer? = null
    private val _playingDraftId = MutableStateFlow<String?>(null)
    val playingDraftId: StateFlow<String?> = _playingDraftId.asStateFlow()

    private var countdownJob: Job? = null

    init {
        // Collect socket events
        viewModelScope.launch {
            socketManager.events.collect { event ->
                handleSocketEvent(event)
            }
        }
    }

    fun setServerUrl(url: String) {
        val trimmed = url.trim().removeSuffix("/")
        _serverUrl.value = trimmed
        apiClient.baseUrl = trimmed
        Log.i(TAG, "Server URL updated to: $trimmed")
    }

    fun loginOrRegister(username: String) {
        if (username.isBlank()) {
            _statusMessage.value = "Username cannot be empty"
            return
        }
        viewModelScope.launch {
            _isLoading.value = true
            val result = apiClient.createUser(username.trim())
            _isLoading.value = false
            result.onSuccess { user ->
                _currentUser.value = user
                _statusMessage.value = "Logged in as ${user.username} (${user.virtualPoints} pts)"
                socketManager.connect(_serverUrl.value)
                refreshActiveRooms()
            }.onFailure { err ->
                _statusMessage.value = "Auth failed: ${err.message}"
            }
        }
    }

    fun refreshActiveRooms() {
        viewModelScope.launch {
            val result = apiClient.getActiveRooms()
            result.onSuccess { rooms ->
                _activeRooms.value = rooms
            }.onFailure { err ->
                Log.w(TAG, "Failed to fetch rooms: ${err.message}")
            }
        }
    }

    fun createRoom(name: String) {
        val user = _currentUser.value ?: return
        if (name.isBlank()) {
            _statusMessage.value = "Room name cannot be empty"
            return
        }
        viewModelScope.launch {
            _isLoading.value = true
            val result = apiClient.createRoom(name.trim(), user.id)
            _isLoading.value = false
            result.onSuccess { room ->
                joinRoom(room.id)
            }.onFailure { err ->
                _statusMessage.value = "Failed to create room: ${err.message}"
            }
        }
    }

    fun joinRoom(roomId: String) {
        val user = _currentUser.value ?: return
        viewModelScope.launch {
            _isLoading.value = true
            val result = apiClient.getRoom(roomId)
            _isLoading.value = false
            result.onSuccess { room ->
                _currentRoom.value = room
                _spinState.value = SpinState() // Reset spin state
                socketManager.joinRoom(room.id, user.id, user.username)
                _statusMessage.value = "Joined room: ${room.name}"
            }.onFailure { err ->
                _statusMessage.value = "Failed to join room: ${err.message}"
            }
        }
    }

    fun refreshCurrentRoom() {
        val room = _currentRoom.value ?: return
        viewModelScope.launch {
            val result = apiClient.getRoom(room.id)
            result.onSuccess { updated ->
                _currentRoom.value = updated
            }
        }
    }

    fun leaveRoom() {
        val room = _currentRoom.value ?: return
        val user = _currentUser.value ?: return
        stopRoomPlayback()
        countdownJob?.cancel()
        socketManager.leaveRoom(room.id, user.id)
        _currentRoom.value = null
        _spinState.value = SpinState()
        refreshActiveRooms()
    }

    fun shareLocalVoiceDraft(localDraft: VoiceDraft) {
        val room = _currentRoom.value ?: return
        val user = _currentUser.value ?: return
        val file = File(localDraft.filePath)
        if (!file.exists()) {
            _statusMessage.value = "Local draft audio file not found"
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            _statusMessage.value = "Uploading take to room..."
            val result = apiClient.uploadVoiceDraft(
                file = file,
                userId = user.id,
                title = localDraft.title,
                durationMs = localDraft.durationMs,
                effectApplied = localDraft.effectApplied
            )
            _isLoading.value = false
            result.onSuccess { uploadedDraft ->
                socketManager.shareDraft(room.id, user.id, uploadedDraft.id)
                _statusMessage.value = "Shared \"${uploadedDraft.title}\" with room!"
            }.onFailure { err ->
                _statusMessage.value = "Draft upload failed: ${err.message}"
            }
        }
    }

    fun startSpinWheel() {
        val room = _currentRoom.value ?: return
        val user = _currentUser.value ?: return
        socketManager.startSpin(room.id, user.id)
    }

    fun toggleSharedDraftPlayback(draft: SharedDraft) {
        if (_playingDraftId.value == draft.id) {
            stopRoomPlayback()
        } else {
            playSharedDraft(draft)
        }
    }

    private fun playSharedDraft(draft: SharedDraft) {
        stopRoomPlayback()
        try {
            val audioUrl = if (draft.audioUrl.startsWith("http")) {
                draft.audioUrl
            } else {
                "${_serverUrl.value}${draft.audioUrl}"
            }

            val player = MediaPlayer().apply {
                setDataSource(audioUrl)
                prepareAsync()
                setOnPreparedListener {
                    start()
                    _playingDraftId.value = draft.id
                }
                setOnCompletionListener {
                    stopRoomPlayback()
                }
                setOnErrorListener { _, _, _ ->
                    _statusMessage.value = "Error streaming audio draft"
                    stopRoomPlayback()
                    true
                }
            }
            roomAudioPlayer = player
        } catch (e: Exception) {
            Log.e(TAG, "Audio playback error for ${draft.audioUrl}", e)
            _statusMessage.value = "Failed to stream audio"
            stopRoomPlayback()
        }
    }

    private fun stopRoomPlayback() {
        roomAudioPlayer?.let {
            try {
                if (it.isPlaying) it.stop()
                it.release()
            } catch (e: Exception) {
                Log.w(TAG, "Error releasing audio player", e)
            }
        }
        roomAudioPlayer = null
        _playingDraftId.value = null
    }

    private fun handleSocketEvent(event: SocketEvent) {
        when (event) {
            is SocketEvent.RoomStateReceived -> {
                _currentRoom.value = event.room
            }

            is SocketEvent.UserJoined -> {
                val room = _currentRoom.value ?: return
                if (!event.participants.isNullOrEmpty()) {
                    _currentRoom.value = room.copy(
                        members = event.participants,
                        participantCount = event.participants.count { it.isOnline }
                    )
                } else {
                    val existing = room.members.toMutableList()
                    existing.removeAll { it.userId == event.user.userId }
                    existing.add(event.user)
                    _currentRoom.value = room.copy(
                        members = existing,
                        participantCount = existing.count { it.isOnline }
                    )
                }
            }

            is SocketEvent.UserLeft -> {
                val room = _currentRoom.value ?: return
                if (!event.participants.isNullOrEmpty()) {
                    _currentRoom.value = room.copy(
                        members = event.participants,
                        participantCount = event.participants.count { it.isOnline }
                    )
                } else {
                    val updated = room.members.map {
                        if (it.userId == event.userId) it.copy(isOnline = false) else it
                    }
                    _currentRoom.value = room.copy(
                        members = updated,
                        participantCount = updated.count { it.isOnline }
                    )
                }
            }

            is SocketEvent.DraftShared -> {
                val room = _currentRoom.value ?: return
                val drafts = room.sharedDrafts.toMutableList()
                drafts.removeAll { it.id == event.draft.id }
                drafts.add(0, event.draft)
                _currentRoom.value = room.copy(sharedDrafts = drafts)
            }

            is SocketEvent.SpinStarted -> {
                countdownJob?.cancel()
                _spinState.value = SpinState(
                    status = "RUNNING",
                    spinId = event.spinId,
                    activePlayers = event.participants,
                    eliminatedPlayers = emptyList(),
                    winner = null,
                    countdownSeconds = 5
                )
                startCountdownTicker()
            }

            is SocketEvent.UserEliminated -> {
                val current = _spinState.value
                val elim = current.eliminatedPlayers.toMutableList()
                if (elim.none { it.userId == event.eliminatedUser.userId }) {
                    elim.add(event.eliminatedUser)
                }
                _spinState.value = current.copy(
                    activePlayers = event.remainingPlayers,
                    eliminatedPlayers = elim,
                    countdownSeconds = 5
                )
                startCountdownTicker()
            }

            is SocketEvent.WinnerAnnounced -> {
                countdownJob?.cancel()
                val current = _spinState.value
                _spinState.value = current.copy(
                    status = "COMPLETED",
                    winner = event.winner,
                    countdownSeconds = 0
                )
                // If current user is winner, update points
                val user = _currentUser.value
                if (user?.id == event.winner.userId) {
                    _currentUser.value = user.copy(virtualPoints = event.winner.totalPoints)
                }
            }

            is SocketEvent.SpinAborted -> {
                countdownJob?.cancel()
                _spinState.value = _spinState.value.copy(
                    status = "ABORTED",
                    abortReason = event.reason,
                    countdownSeconds = 0
                )
            }

            is SocketEvent.SpinError -> {
                _statusMessage.value = "Spin Error: ${event.message}"
            }

            else -> {}
        }
    }

    private fun startCountdownTicker() {
        countdownJob?.cancel()
        countdownJob = viewModelScope.launch {
            var remaining = 5
            while (isActive && remaining > 0 && _spinState.value.status == "RUNNING") {
                _spinState.value = _spinState.value.copy(countdownSeconds = remaining)
                delay(1000)
                remaining -= 1
            }
            if (_spinState.value.status == "RUNNING") {
                _spinState.value = _spinState.value.copy(countdownSeconds = 0)
            }
        }
    }

    fun clearStatusMessage() {
        _statusMessage.value = null
    }

    override fun onCleared() {
        super.onCleared()
        stopRoomPlayback()
        countdownJob?.cancel()
        socketManager.disconnect()
    }
}
