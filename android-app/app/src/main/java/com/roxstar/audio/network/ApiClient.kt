package com.roxstar.audio.network

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import com.roxstar.audio.data.model.Room
import com.roxstar.audio.data.model.SharedDraft
import com.roxstar.audio.data.model.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiClient {
    private val TAG = "ApiClient"
    private val gson = Gson()

    var baseUrl: String = "http://10.0.2.2:5000" // Default Android Emulator host

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun createUser(username: String): Result<User> = withContext(Dispatchers.IO) {
        try {
            val body = JsonObject().apply { addProperty("username", username) }.toString()
            val request = Request.Builder()
                .url("$baseUrl/api/users")
                .post(body.toRequestBody(jsonMediaType))
                .build()

            client.newCall(request).execute().use { response ->
                val resString = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    return@withContext Result.failure(IOException("Server error: ${response.code} $resString"))
                }
                val json = gson.fromJson(resString, JsonObject::class.java)
                val user = gson.fromJson(json.getAsJsonObject("user"), User::class.java)
                Result.success(user)
            }
        } catch (e: Exception) {
            Log.e(TAG, "createUser failed", e)
            Result.failure(e)
        }
    }

    suspend fun getActiveRooms(): Result<List<Room>> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$baseUrl/api/rooms")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val resString = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    return@withContext Result.failure(IOException("Server error: ${response.code}"))
                }
                val json = gson.fromJson(resString, JsonObject::class.java)
                val listType = object : TypeToken<List<Room>>() {}.type
                val rooms: List<Room> = gson.fromJson(json.getAsJsonArray("rooms"), listType) ?: emptyList()
                Result.success(rooms)
            }
        } catch (e: Exception) {
            Log.e(TAG, "getActiveRooms failed", e)
            Result.failure(e)
        }
    }

    suspend fun createRoom(name: String, hostUserId: String): Result<Room> = withContext(Dispatchers.IO) {
        try {
            val body = JsonObject().apply {
                addProperty("title", name)
                addProperty("name", name)
                addProperty("owner_id", hostUserId)
                addProperty("host_user_id", hostUserId)
                addProperty("max_participants", 20)
            }.toString()

            val request = Request.Builder()
                .url("$baseUrl/api/rooms")
                .post(body.toRequestBody(jsonMediaType))
                .build()

            client.newCall(request).execute().use { response ->
                val resString = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    return@withContext Result.failure(IOException("Server error: ${response.code} $resString"))
                }
                val json = gson.fromJson(resString, JsonObject::class.java)
                val roomObj = json.getAsJsonObject("room")
                val room = gson.fromJson(roomObj, Room::class.java)
                Result.success(room)
            }
        } catch (e: Exception) {
            Log.e(TAG, "createRoom failed", e)
            Result.failure(e)
        }
    }

    suspend fun getRoom(roomId: String): Result<Room> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$baseUrl/api/rooms/$roomId")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val resString = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    return@withContext Result.failure(IOException("Server error: ${response.code}"))
                }
                val json = gson.fromJson(resString, JsonObject::class.java)
                val roomObj = json.getAsJsonObject("room")
                if (json.has("participants") && !roomObj.has("members")) {
                    roomObj.add("members", json.get("participants"))
                }
                if (json.has("shared_drafts") && !roomObj.has("shared_drafts")) {
                    roomObj.add("shared_drafts", json.get("shared_drafts"))
                }
                val room = gson.fromJson(roomObj, Room::class.java)
                Result.success(room)
            }
        } catch (e: Exception) {
            Log.e(TAG, "getRoom failed", e)
            Result.failure(e)
        }
    }

    suspend fun uploadVoiceDraft(
        file: File,
        userId: String,
        title: String,
        durationMs: Long,
        effectApplied: String
    ): Result<SharedDraft> = withContext(Dispatchers.IO) {
        try {
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("user_id", userId)
                .addFormDataPart("title", title)
                .addFormDataPart("duration_ms", durationMs.toString())
                .addFormDataPart("effect_applied", effectApplied)
                .addFormDataPart(
                    "audio",
                    file.name,
                    file.asRequestBody("audio/wav".toMediaType())
                )
                .build()

            val request = Request.Builder()
                .url("$baseUrl/api/drafts/upload")
                .post(requestBody)
                .build()

            client.newCall(request).execute().use { response ->
                val resString = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    return@withContext Result.failure(IOException("Upload failed: ${response.code} $resString"))
                }
                val json = gson.fromJson(resString, JsonObject::class.java)
                val draft = gson.fromJson(json.getAsJsonObject("draft"), SharedDraft::class.java)
                Result.success(draft)
            }
        } catch (e: Exception) {
            Log.e(TAG, "uploadVoiceDraft failed", e)
            Result.failure(e)
        }
    }
}
