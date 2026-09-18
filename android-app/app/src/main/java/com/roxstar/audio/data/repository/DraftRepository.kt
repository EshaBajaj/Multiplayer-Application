package com.roxstar.audio.data.repository

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.roxstar.audio.data.model.VoiceDraft
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

class DraftRepository(private val context: Context) {
    private val TAG = "DraftRepository"
    private val gson = Gson()
    private val draftsDir = File(context.filesDir, "drafts").apply { mkdirs() }
    private val indexFile = File(draftsDir, "drafts_index.json")

    private val _draftsFlow = MutableStateFlow<List<VoiceDraft>>(emptyList())
    val draftsFlow: StateFlow<List<VoiceDraft>> = _draftsFlow.asStateFlow()

    init {
        loadDraftsFromDisk()
    }

    fun createOutputFile(): File {
        return File(draftsDir, "take_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}.wav")
    }

    private fun loadDraftsFromDisk() {
        if (!indexFile.exists()) {
            _draftsFlow.value = emptyList()
            return
        }
        try {
            val json = indexFile.readText()
            val type = object : TypeToken<List<VoiceDraft>>() {}.type
            val list: List<VoiceDraft> = gson.fromJson(json, type) ?: emptyList()
            _draftsFlow.value = list.sortedByDescending { it.createdAt }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load drafts index", e)
            _draftsFlow.value = emptyList()
        }
    }

    suspend fun saveDraft(draft: VoiceDraft): VoiceDraft = withContext(Dispatchers.IO) {
        val currentList = _draftsFlow.value.toMutableList()
        currentList.removeAll { it.id == draft.id }
        currentList.add(0, draft)

        try {
            val json = gson.toJson(currentList)
            indexFile.writeText(json)
            _draftsFlow.value = currentList
            Log.i(TAG, "Saved draft [${draft.title}], total drafts: ${currentList.size}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save draft index", e)
        }
        draft
    }

    suspend fun deleteDraft(draftId: String): Boolean = withContext(Dispatchers.IO) {
        val currentList = _draftsFlow.value.toMutableList()
        val draftToDelete = currentList.find { it.id == draftId } ?: return@withContext false

        // 1. Delete .wav file
        val file = File(draftToDelete.filePath)
        if (file.exists()) {
            file.delete()
        }

        // 2. Remove from index
        currentList.removeAll { it.id == draftId }
        try {
            val json = gson.toJson(currentList)
            indexFile.writeText(json)
            _draftsFlow.value = currentList
            Log.i(TAG, "Deleted draft [${draftToDelete.title}]")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete draft from index", e)
            false
        }
    }

    fun getDraftById(id: String): VoiceDraft? {
        return _draftsFlow.value.find { it.id == id }
    }
}
