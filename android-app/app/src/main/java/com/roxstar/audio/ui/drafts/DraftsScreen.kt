package com.roxstar.audio.ui.drafts

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.roxstar.audio.data.model.VoiceDraft
import com.roxstar.audio.ui.studio.StudioViewModel
import com.roxstar.audio.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun DraftsScreen(
    viewModel: StudioViewModel,
    modifier: Modifier = Modifier
) {
    val drafts by viewModel.draftsFlow.collectAsState()
    val playingDraftId by viewModel.playingDraftId.collectAsState()

    var draftToDelete by remember { mutableStateOf<VoiceDraft?>(null) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
    ) {
        // Header
        Text(
            text = "📁 My Voice Drafts",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = TextPrimary,
            modifier = Modifier.padding(bottom = 4.dp, top = 8.dp)
        )
        Text(
            text = "${drafts.size} saved voice takes (Section A2)",
            color = TextMuted,
            fontSize = 14.sp,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        if (drafts.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = 60.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "🎙️ No drafts recorded yet",
                        color = TextMuted,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Switch to Studio tab to record your first take!",
                        color = TextMuted,
                        fontSize = 14.sp
                    )
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(drafts, key = { it.id }) { draft ->
                    val isPlaying = playingDraftId == draft.id
                    DraftCard(
                        draft = draft,
                        isPlaying = isPlaying,
                        onTogglePlay = { viewModel.togglePlayback(draft) },
                        onDelete = { draftToDelete = draft }
                    )
                }
            }
        }
    }

    // Delete Confirmation Dialog
    draftToDelete?.let { draft ->
        AlertDialog(
            onDismissRequest = { draftToDelete = null },
            containerColor = CardBackground,
            title = {
                Text("Delete Voice Draft?", color = TextPrimary, fontWeight = FontWeight.Bold)
            },
            text = {
                Text(
                    "Are you sure you want to permanently delete \"${draft.title}\"?",
                    color = TextMuted
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deleteDraft(draft.id)
                        draftToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Danger)
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { draftToDelete = null }) {
                    Text("Cancel", color = TextPrimary)
                }
            }
        )
    }
}

@Composable
fun DraftCard(
    draft: VoiceDraft,
    isPlaying: Boolean,
    onTogglePlay: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val dateFormat = remember { SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()) }
    val dateStr = remember(draft.createdAt) { dateFormat.format(Date(draft.createdAt)) }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = CardBackground,
        border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Play / Pause Action Button
            IconButton(
                onClick = onTogglePlay,
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isPlaying) Accent else Primary)
            ) {
                Icon(
                    imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    tint = TextPrimary
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Draft Details
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = draft.title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "⏱️ ${draft.formattedDuration}",
                        fontSize = 12.sp,
                        color = TextMuted
                    )
                    Text(
                        text = "•",
                        fontSize = 12.sp,
                        color = TextMuted
                    )
                    Text(
                        text = dateStr,
                        fontSize = 12.sp,
                        color = TextMuted
                    )
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Effect Tag Badge
            Surface(
                shape = RoundedCornerShape(6.dp),
                color = if (draft.effectApplied == "ECHO") Accent.copy(alpha = 0.2f) else Primary.copy(alpha = 0.2f),
                modifier = Modifier.padding(end = 4.dp)
            ) {
                Text(
                    text = draft.effectApplied,
                    color = if (draft.effectApplied == "ECHO") Accent else Primary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }

            // Delete Action
            IconButton(onClick = onDelete) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Delete Draft",
                    tint = TextMuted
                )
            }
        }
    }
}
