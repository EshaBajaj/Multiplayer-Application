package com.roxstar.audio.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
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
import com.roxstar.audio.ui.theme.*

@Composable
fun LobbyScreen(
    viewModel: RoomViewModel,
    modifier: Modifier = Modifier
) {
    val currentUser by viewModel.currentUser.collectAsState()
    val activeRooms by viewModel.activeRooms.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val statusMessage by viewModel.statusMessage.collectAsState()

    var usernameInput by remember { mutableStateOf("") }
    var roomNameInput by remember { mutableStateOf("") }
    var showServerSettings by remember { mutableStateOf(false) }
    var serverUrlInput by remember { mutableStateOf(serverUrl) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
    ) {
        // Top Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp, bottom = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "👥 Multiplayer Rooms",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Text(
                    text = "Collaborate & Play Spin Wheel",
                    color = TextMuted,
                    fontSize = 13.sp
                )
            }

            IconButton(onClick = { showServerSettings = true }) {
                Icon(Icons.Default.Settings, contentDescription = "Server Settings", tint = TextMuted)
            }
        }

        // 1. User Profile / Login Card
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = CardBackground,
            border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                if (currentUser == null) {
                    Text(
                        text = "Enter your username to connect:",
                        color = TextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = usernameInput,
                            onValueChange = { usernameInput = it },
                            placeholder = { Text("e.g. Alice") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary,
                                focusedBorderColor = Primary,
                                unfocusedBorderColor = CardBorder
                            )
                        )
                        Button(
                            onClick = { viewModel.loginOrRegister(usernameInput) },
                            enabled = !isLoading && usernameInput.isNotBlank(),
                            colors = ButtonDefaults.buttonColors(containerColor = Primary)
                        ) {
                            Text("Connect")
                        }
                    }
                } else {
                    val user = currentUser
                    if (user != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(38.dp)
                                        .clip(CircleShape)
                                        .background(Primary),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = user.username.take(2).uppercase().ifEmpty { "U" },
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(
                                        text = user.username,
                                        fontWeight = FontWeight.Bold,
                                        color = TextPrimary,
                                        fontSize = 16.sp
                                    )
                                    Text(
                                        text = "🪙 ${user.virtualPoints} points",
                                        color = Warning,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Success.copy(alpha = 0.2f)
                            ) {
                                Text(
                                    text = "ONLINE",
                                    color = Success,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // 2. Create Room Card (Only when logged in)
        if (currentUser != null) {
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = CardBackground,
                border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "Create New Room",
                        color = TextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = roomNameInput,
                            onValueChange = { roomNameInput = it },
                            placeholder = { Text("Room name...") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary,
                                focusedBorderColor = Accent,
                                unfocusedBorderColor = CardBorder
                            )
                        )
                        Button(
                            onClick = {
                                viewModel.createRoom(roomNameInput)
                                roomNameInput = ""
                            },
                            enabled = !isLoading && roomNameInput.isNotBlank(),
                            colors = ButtonDefaults.buttonColors(containerColor = Accent)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Create")
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // 3. Active Rooms List
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Active Rooms (${activeRooms.size})",
                fontWeight = FontWeight.Bold,
                color = TextPrimary,
                fontSize = 16.sp
            )
            IconButton(onClick = { viewModel.refreshActiveRooms() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = TextMuted)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        if (activeRooms.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (currentUser == null) "Log in above to view rooms" else "No active rooms yet. Create one!",
                    color = TextMuted,
                    fontSize = 14.sp
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                items(activeRooms, key = { it.id.ifEmpty { "${it.name}_${it.hostId}" } }) { room ->
                    RoomItemCard(
                        room = room,
                        canJoin = currentUser != null,
                        onJoin = { viewModel.joinRoom(room.id) }
                    )
                }
            }
        }
    }

    // Server Settings Dialog
    if (showServerSettings) {
        AlertDialog(
            onDismissRequest = { showServerSettings = false },
            containerColor = CardBackground,
            title = {
                Text("Backend Server URL", color = TextPrimary, fontWeight = FontWeight.Bold)
            },
            text = {
                Column {
                    Text(
                        "Configure backend host URL:",
                        color = TextMuted,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = serverUrlInput,
                        onValueChange = { serverUrlInput = it },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        FilterChip(
                            selected = serverUrlInput.contains("127.0.0.1") || serverUrlInput.contains("localhost"),
                            onClick = { serverUrlInput = "http://127.0.0.1:5000" },
                            label = { Text("🔌 USB Cable") }
                        )
                        FilterChip(
                            selected = serverUrlInput.contains("10.0.2.2"),
                            onClick = { serverUrlInput = "http://10.0.2.2:5000" },
                            label = { Text("Emulator") }
                        )
                        FilterChip(
                            selected = serverUrlInput.contains("10.108.172.139"),
                            onClick = { serverUrlInput = "http://10.108.172.139:5000" },
                            label = { Text("Wi-Fi") }
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.setServerUrl(serverUrlInput)
                        showServerSettings = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showServerSettings = false }) {
                    Text("Cancel", color = TextMuted)
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
fun RoomItemCard(
    room: Room,
    canJoin: Boolean,
    onJoin: () -> Unit
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
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = room.name,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "👥 ${room.participantCount} online",
                    fontSize = 12.sp,
                    color = TextMuted
                )
            }

            Button(
                onClick = onJoin,
                enabled = canJoin,
                colors = ButtonDefaults.buttonColors(containerColor = Primary),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Join")
            }
        }
    }
}
