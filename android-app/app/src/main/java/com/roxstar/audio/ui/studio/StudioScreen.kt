package com.roxstar.audio.ui.studio

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.roxstar.audio.ui.theme.*

@Composable
fun StudioScreen(
    viewModel: StudioViewModel,
    hasRecordPermission: Boolean,
    onRequestPermission: () -> Unit,
    modifier: Modifier = Modifier
) {
    val recordingState by viewModel.recordingState.collectAsState()
    val isEchoEnabled by viewModel.isEchoEnabled.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    var showSaveDialog by remember { mutableStateOf(false) }
    var draftTitleInput by remember { mutableStateOf("") }

    // When recording enters Stopped state, open save dialog
    LaunchedEffect(recordingState) {
        if (recordingState is StudioRecordingState.Stopped) {
            draftTitleInput = "Take ${System.currentTimeMillis().toString().takeLast(4)}"
            showSaveDialog = true
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        // 1. Studio Header & Engine Status
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(top = 16.dp)
        ) {
            Text(
                text = "🎙️ ROXSTAR Audio Studio",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = CardBorder,
                    modifier = Modifier.padding(4.dp)
                ) {
                    Text(
                        text = "Native C++ Oboe (44.1kHz / 16-bit)",
                        color = Success,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }
        }

        // 2. Center Visualizer & Timer Area
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth()
        ) {
            when (val state = recordingState) {
                is StudioRecordingState.Idle -> {
                    Box(
                        modifier = Modifier
                            .size(160.dp)
                            .clip(CircleShape)
                            .background(CardBackground)
                            .border(2.dp, CardBorder, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = "Microphone",
                            tint = TextMuted,
                            modifier = Modifier.size(64.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(24.dp))
                    Text(
                        text = "Ready to record voice take",
                        color = TextMuted,
                        fontSize = 16.sp
                    )
                }

                is StudioRecordingState.Recording -> {
                    val scale by animateFloatAsState(
                        targetValue = 1.0f + (state.audioLevel * 0.45f),
                        animationSpec = spring(),
                        label = "pulse"
                    )

                    Box(
                        modifier = Modifier
                            .size(160.dp)
                            .scale(scale)
                            .clip(CircleShape)
                            .background(Danger.copy(alpha = 0.15f))
                            .border(2.dp, Danger, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.GraphicEq,
                            contentDescription = "Recording",
                            tint = Danger,
                            modifier = Modifier.size(64.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Formatted Timer Display
                    val totalSec = state.durationMs / 1000
                    val min = totalSec / 60
                    val sec = totalSec % 60
                    val tenths = (state.durationMs % 1000) / 100
                    val timerStr = String.format("%02d:%02d.%d", min, sec, tenths)

                    Text(
                        text = timerStr,
                        fontSize = 36.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "● LIVE RECORDING",
                        color = Danger,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                is StudioRecordingState.Stopped -> {
                    Text(
                        text = "Take finished. Enter title to save.",
                        color = Success,
                        fontSize = 16.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(30.dp))

            // 3. DSP Effect Mode Toggle (Clean vs Echo)
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = CardBackground,
                border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder)
            ) {
                Row(
                    modifier = Modifier.padding(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    FilterChip(
                        selected = !isEchoEnabled,
                        onClick = { if (isEchoEnabled) viewModel.toggleEcho() },
                        label = { Text("Clean Voice") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Primary,
                            selectedLabelColor = Color.White
                        )
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    FilterChip(
                        selected = isEchoEnabled,
                        onClick = { if (!isEchoEnabled) viewModel.toggleEcho() },
                        label = { Text("✨ Echo DSP (Native)") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Accent,
                            selectedLabelColor = Color.White
                        )
                    )
                }
            }
        }

        // 4. Action Controls (Record / Stop / Cancel)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 24.dp),
            contentAlignment = Alignment.Center
        ) {
            when (recordingState) {
                is StudioRecordingState.Idle -> {
                    Button(
                        onClick = {
                            if (!hasRecordPermission) {
                                onRequestPermission()
                            } else {
                                viewModel.startRecording()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Danger),
                        shape = CircleShape,
                        modifier = Modifier.size(80.dp),
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = "Start Recording",
                            tint = Color.White,
                            modifier = Modifier.size(36.dp)
                        )
                    }
                }

                is StudioRecordingState.Recording -> {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(32.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Cancel button
                        IconButton(
                            onClick = { viewModel.cancelRecording() },
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                                .background(CardBackground)
                                .border(1.dp, CardBorder, CircleShape)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Cancel Take",
                                tint = TextMuted
                            )
                        }

                        // Stop & Finish button
                        Button(
                            onClick = { viewModel.stopRecording() },
                            colors = ButtonDefaults.buttonColors(containerColor = Danger),
                            shape = CircleShape,
                            modifier = Modifier.size(80.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Stop,
                                contentDescription = "Stop Recording",
                                tint = Color.White,
                                modifier = Modifier.size(36.dp)
                            )
                        }
                    }
                }

                is StudioRecordingState.Stopped -> {
                    Button(
                        onClick = { showSaveDialog = true },
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) {
                        Text("Save Voice Draft")
                    }
                }
            }
        }
    }

    // Save Draft Dialog
    if (showSaveDialog && recordingState is StudioRecordingState.Stopped) {
        val stopped = recordingState as StudioRecordingState.Stopped
        AlertDialog(
            onDismissRequest = {
                showSaveDialog = false
                viewModel.discardStoppedTake()
            },
            containerColor = CardBackground,
            title = {
                Text(
                    text = "Save Voice Draft",
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column {
                    Text(
                        text = "Effect: ${stopped.effectApplied} | Duration: ${stopped.durationMs / 1000}s",
                        color = TextMuted,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = draftTitleInput,
                        onValueChange = { draftTitleInput = it },
                        label = { Text("Draft Title") },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            focusedBorderColor = Primary,
                            unfocusedBorderColor = CardBorder
                        )
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showSaveDialog = false
                        viewModel.saveDraft(draftTitleInput)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Success)
                ) {
                    Text("Save Draft")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showSaveDialog = false
                        viewModel.discardStoppedTake()
                    }
                ) {
                    Text("Discard", color = Danger)
                }
            }
        )
    }

    // Error Snackbar
    errorMessage?.let { err ->
        Snackbar(
            action = {
                TextButton(onClick = { viewModel.clearError() }) {
                    Text("Dismiss", color = Accent)
                }
            },
            modifier = Modifier.padding(16.dp)
        ) {
            Text(err)
        }
    }
}
