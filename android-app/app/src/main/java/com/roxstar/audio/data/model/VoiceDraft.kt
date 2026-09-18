package com.roxstar.audio.data.model

import java.util.UUID

data class VoiceDraft(
    val id: String = UUID.randomUUID().toString(),
    val title: String,
    val filePath: String,
    val durationMs: Long,
    val effectApplied: String = "ECHO", // "ECHO" or "CLEAN"
    val createdAt: Long = System.currentTimeMillis()
) {
    val formattedDuration: String
        get() {
            val totalSeconds = durationMs / 1000
            val minutes = totalSeconds / 60
            val seconds = totalSeconds % 60
            val millis = (durationMs % 1000) / 100
            return String.format("%02d:%02d.%d", minutes, seconds, millis)
        }
}
