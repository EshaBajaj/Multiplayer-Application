package com.roxstar.audio.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.roxstar.audio.data.model.Room
import com.roxstar.audio.data.model.SharedDraft
import com.roxstar.audio.data.model.VoiceDraft
import com.roxstar.audio.ui.theme.*

@Composable
fun RoomScreen(
    room: Room,
    viewModel: RoomViewModel,
    modifier: Modifier = Modifier
) {
    val currentUser by viewModel.currentUser.collectAsState()
    val spinState by viewModel.spinState.collectAsState()
    val playingDraftId by viewModel.playingDraftId.collectAsState()
    val localDrafts by viewModel.localDraftsFlow.collectAsState()
    val statusMessage by viewModel.statusMessage.collectAsState()

    var selectedSubTab by remember { mutableStateOf(0) } // 0: Room & Audio, 1: Spin Wheel
    var showShareDraftDialog by remember { mutableStateOf(false) }

    // If a spin is actively running, auto-switch to Spin tab
    LaunchedEffect(spinState.status) {
        if (spinState.status == "RUNNING") {
            selectedSubTab = 1
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
    ) {
        // Room Top Bar
        Surface(
            color = CardBackground,
            border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { viewModel.leaveRoom() }) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Leave Room",
                            tint = TextPrimary
                        )
                    }
                    Spacer(modifier = Modifier.width(6.dp))
                    Column {
                        Text(
                            text = room.name,
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            color = TextPrimary
                        )
                        Text(
                            text = "👥 ${room.participantCount} online members",
                            fontSize = 12.sp,
                            color = TextMuted
                        )
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { viewModel.refreshCurrentRoom() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh Room",
                            tint = TextMuted
                        )
                    }
                    if (room.hostId == currentUser?.id) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Accent.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = "⭐ YOU ARE HOST",
                                color = Accent,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }
        }

        // Sub-Tab Row (Audio Studio / Spin Wheel)
        TabRow(
            selectedTabIndex = selectedSubTab,
            containerColor = CardBackground,
            contentColor = Primary
        ) {
            Tab(
                selected = selectedSubTab == 0,
                onClick = { selectedSubTab = 0 },
                text = { Text("🎧 Room & Audio") },
                icon = { Icon(Icons.Default.Headphones, contentDescription = null) }
            )
            Tab(
                selected = selectedSubTab == 1,
                onClick = { selectedSubTab = 1 },
                text = { Text("🎡 Spin Wheel") },
                icon = { Icon(Icons.Default.Casino, contentDescription = null) }
            )
        }

        // Tab Content
        when (selectedSubTab) {
            0 -> RoomAudioSection(
                room = room,
                playingDraftId = playingDraftId,
                onTogglePlay = { viewModel.toggleSharedDraftPlayback(it) },
                onOpenShareDialog = { showShareDraftDialog = true }
            )

            1 -> SpinWheelArena(
                room = room,
                currentUser = currentUser,
                spinState = spinState,
                onStartSpin = { viewModel.startSpinWheel() }
            )
        }
    }

    // Share Local Draft Dialog
    if (showShareDraftDialog) {
        AlertDialog(
            onDismissRequest = { showShareDraftDialog = false },
            containerColor = CardBackground,
            title = {
                Text(
                    text = "Share Voice Take with Room",
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                if (localDrafts.isEmpty()) {
                    Text(
                        text = "You have no saved voice takes yet! Go to the Studio tab to record one with the Echo DSP.",
                        color = TextMuted
                    )
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(localDrafts, key = { it.id }) { draft ->
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = DarkBackground,
                                border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = draft.title,
                                            fontWeight = FontWeight.Bold,
                                            color = TextPrimary,
                                            fontSize = 14.sp
                                        )
                                        Text(
                                            text = "${draft.effectApplied} • ${draft.formattedDuration}",
                                            color = TextMuted,
                                            fontSize = 12.sp
                                        )
                                    }
                                    Button(
                                        onClick = {
                                            showShareDraftDialog = false
                                            viewModel.shareLocalVoiceDraft(draft)
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Primary),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Text("Share")
                                    }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showShareDraftDialog = false }) {
                    Text("Close", color = TextMuted)
                }
            }
        )
    }

    // Status snackbar
    statusMessage?.let { msg ->
        Snackbar(
            action = {
                TextButton(onClick = { viewModel.clearStatusMessage() }) {
                    Text("OK", color = Accent)
                }
            },
            modifier = Modifier.padding(16.dp)
        ) {
            Text(msg)
        }
    }
}

@Composable
fun RoomAudioSection(
    room: Room,
    playingDraftId: String?,
    onTogglePlay: (SharedDraft) -> Unit,
    onOpenShareDialog: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Online Participants Pills
        Text(
            text = "Participants (${room.members.count { it.isOnline }})",
            fontWeight = FontWeight.Bold,
            color = TextPrimary,
            fontSize = 14.sp,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            room.members.forEach { member ->
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = CardBackground,
                    border = androidx.compose.foundation.BorderStroke(
                        1.dp,
                        if (member.isOnline) Success else CardBorder
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(if (member.isOnline) Success else TextMuted)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = member.username,
                            color = TextPrimary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (member.userId == room.hostId) {
                            Text(
                                text = " (Host)",
                                color = Accent,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        Divider(color = CardBorder, modifier = Modifier.padding(bottom = 14.dp))

        // Shared Voice Drafts Header + Share Action
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Shared Audio Takes (${room.sharedDrafts.size})",
                fontWeight = FontWeight.Bold,
                color = TextPrimary,
                fontSize = 16.sp
            )

            Button(
                onClick = onOpenShareDialog,
                colors = ButtonDefaults.buttonColors(containerColor = Primary),
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Icon(Icons.Default.Upload, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Share Take")
            }
        }

        // Shared Drafts Playlist
        if (room.sharedDrafts.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.GraphicEq,
                        contentDescription = null,
                        tint = TextMuted,
                        modifier = Modifier.size(48.dp)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "No audio takes shared in this room yet.",
                        color = TextMuted,
                        fontSize = 14.sp
                    )
                    Text(
                        text = "Tap \"Share Take\" to broadcast your echo draft!",
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                itemsIndexed(
                    items = room.sharedDrafts,
                    key = { index, draft ->
                        if (draft.id.isNotBlank()) "${draft.id}_$index" else "${draft.audioUrl}_$index"
                    }
                ) { _, draft ->
                    val isPlaying = playingDraftId == draft.id
                    SharedDraftCard(
                        draft = draft,
                        isPlaying = isPlaying,
                        onTogglePlay = { onTogglePlay(draft) }
                    )
                }
            }
        }
    }
}

@Composable
fun SharedDraftCard(
    draft: SharedDraft,
    isPlaying: Boolean,
    onTogglePlay: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = CardBackground,
        border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            IconButton(
                onClick = onTogglePlay,
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isPlaying) Accent else Primary)
            ) {
                Icon(
                    imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    tint = Color.White
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = draft.title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "Shared by ${draft.username ?: "Player"} • ${draft.formattedDuration}",
                    color = TextMuted,
                    fontSize = 12.sp
                )
            }

            Surface(
                shape = RoundedCornerShape(6.dp),
                color = if (draft.effectApplied == "ECHO") Accent.copy(alpha = 0.2f) else Primary.copy(alpha = 0.2f)
            ) {
                Text(
                    text = draft.effectApplied,
                    color = if (draft.effectApplied == "ECHO") Accent else Primary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
        }
    }
}
