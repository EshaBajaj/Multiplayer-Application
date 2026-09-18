package com.roxstar.audio.ui.room

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.roxstar.audio.data.model.Room
import com.roxstar.audio.data.model.RoomMember
import com.roxstar.audio.data.model.SpinState
import com.roxstar.audio.data.model.User
import com.roxstar.audio.ui.theme.*

@Composable
fun SpinWheelArena(
    room: Room,
    currentUser: User?,
    spinState: SpinState,
    onStartSpin: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isHost = room.hostId == currentUser?.id
    val onlineCount = room.members.count { it.isOnline }
    val canStartSpin = isHost && onlineCount >= 3 && spinState.status != "RUNNING"

    var showWinnerDialog by remember { mutableStateOf(false) }

    LaunchedEffect(spinState.status) {
        if (spinState.status == "COMPLETED" && spinState.winner != null) {
            showWinnerDialog = true
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Status & Countdown Header
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = CardBackground,
            border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "🎡 Spin Wheel Arena",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )

                    // Status Pill
                    val statusColor = when (spinState.status) {
                        "RUNNING" -> Danger
                        "COMPLETED" -> Success
                        "ABORTED" -> Warning
                        else -> Primary
                    }
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = statusColor.copy(alpha = 0.2f)
                    ) {
                        Text(
                            text = spinState.status,
                            color = statusColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Countdown Timer when Running
                if (spinState.status == "RUNNING") {
                    val progress = spinState.countdownSeconds / 5f
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = Accent,
                        trackColor = CardBorder
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "⏱️ Next elimination in ${spinState.countdownSeconds}s",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = Accent
                    )
                } else if (spinState.status == "ABORTED") {
                    Text(
                        text = "⚠️ Spin Aborted: ${spinState.abortReason ?: "Insufficient Players"}",
                        color = Warning,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                } else {
                    Text(
                        text = "Elimination game: Last remaining player wins +50 virtual points!",
                        color = TextMuted,
                        fontSize = 13.sp
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Players Grid / Seat Cards
        val allParticipants = if (spinState.status == "RUNNING" || spinState.status == "COMPLETED") {
            spinState.activePlayers + spinState.eliminatedPlayers
        } else {
            room.members
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            items(allParticipants, key = { it.userId }) { player ->
                val isEliminated = spinState.eliminatedPlayers.any { it.userId == player.userId }
                val isWinner = spinState.winner?.userId == player.userId
                PlayerSeatCard(
                    player = player,
                    isEliminated = isEliminated,
                    isWinner = isWinner,
                    isHost = player.userId == room.hostId
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Start Spin Controls (Host Only)
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (isHost) {
                Button(
                    onClick = onStartSpin,
                    enabled = canStartSpin,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Accent,
                        disabledContainerColor = CardBorder
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                ) {
                    Icon(Icons.Default.Casino, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (spinState.status == "RUNNING") "Spin in Progress..." else "🚀 Start Spin Wheel",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                }

                if (onlineCount < 3) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Requires at least 3 online players to start (Currently: $onlineCount)",
                        color = Warning,
                        fontSize = 12.sp
                    )
                }
            } else {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = CardBackground,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Waiting for room host to start the spin...",
                        color = TextMuted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(14.dp)
                    )
                }
            }
        }
    }

    // Winner Announcement Dialog
    if (showWinnerDialog && spinState.winner != null) {
        val winner = spinState.winner
        AlertDialog(
            onDismissRequest = { showWinnerDialog = false },
            containerColor = CardBackground,
            icon = {
                Icon(
                    Icons.Default.EmojiEvents,
                    contentDescription = "Trophy",
                    tint = Warning,
                    modifier = Modifier.size(48.dp)
                )
            },
            title = {
                Text(
                    text = "👑 WINNER CROWNED!",
                    color = Warning,
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp
                )
            },
            text = {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = winner.username,
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 22.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Awarded +${winner.prizePoints} Virtual Points!",
                        color = Success,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 16.sp
                    )
                    Text(
                        text = "New Balance: ${winner.totalPoints} pts",
                        color = TextMuted,
                        fontSize = 13.sp
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = { showWinnerDialog = false },
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    Text("Awesome!")
                }
            }
        )
    }
}

@Composable
fun PlayerSeatCard(
    player: RoomMember,
    isEliminated: Boolean,
    isWinner: Boolean,
    isHost: Boolean
) {
    val cardColor = when {
        isWinner -> Warning.copy(alpha = 0.15f)
        isEliminated -> Danger.copy(alpha = 0.1f)
        else -> CardBackground
    }
    val borderColor = when {
        isWinner -> Warning
        isEliminated -> Danger.copy(alpha = 0.4f)
        else -> CardBorder
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = cardColor,
        border = androidx.compose.foundation.BorderStroke(1.dp, borderColor)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(if (isWinner) Warning else if (isEliminated) Danger else Primary),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = player.username.take(2).uppercase().ifEmpty { "P" },
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = player.username,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = if (isEliminated) TextMuted else TextPrimary,
                textDecoration = if (isEliminated) TextDecoration.LineThrough else TextDecoration.None
            )

            Spacer(modifier = Modifier.height(4.dp))

            when {
                isWinner -> {
                    Text(
                        text = "👑 WINNER",
                        color = Warning,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                isEliminated -> {
                    Text(
                        text = "💥 ELIMINATED",
                        color = Danger,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                isHost -> {
                    Text(
                        text = "⭐ HOST",
                        color = Accent,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                else -> {
                    Text(
                        text = if (player.isOnline) "🟢 ONLINE" else "⚪ OFFLINE",
                        color = if (player.isOnline) Success else TextMuted,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}
