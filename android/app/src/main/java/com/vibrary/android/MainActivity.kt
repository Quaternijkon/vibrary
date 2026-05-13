package com.vibrary.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.lifecycleScope
import com.vibrary.android.cache.AndroidCacheManager
import com.vibrary.android.data.entities.PairedServerEntity
import com.vibrary.android.network.ApiClientFactory
import com.vibrary.android.network.PairingClaimRequest
import com.vibrary.android.network.ResolveRequest
import com.vibrary.android.network.SearchFilters
import com.vibrary.android.network.SearchRequest
import com.vibrary.android.network.SearchResultDto
import com.vibrary.android.repository.SearchResultHandler
import com.vibrary.android.repository.SelectionRepository
import com.vibrary.android.saf.SafDocumentRef
import com.vibrary.android.saf.SafPicker
import com.vibrary.android.ui.VibraryActions
import com.vibrary.android.ui.VibraryApp
import com.vibrary.android.ui.VibraryUiState
import com.vibrary.android.work.UploadWorkScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.time.Instant
import java.util.UUID

class MainActivity : ComponentActivity() {
    private lateinit var picker: SafPicker
    private lateinit var selectionRepository: SelectionRepository
    private lateinit var cacheManager: AndroidCacheManager
    private val uiState = mutableStateOf(VibraryUiState())

    private val filesLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        if (result.resultCode == RESULT_OK && data != null) {
            persistPermissions(data)
            persistSelectedDocuments { picker.documentsFromResult(data) }
        }
    }

    private val folderLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        val treeUri = data?.data
        if (result.resultCode == RESULT_OK && data != null && treeUri != null) {
            picker.persistReadPermission(treeUri, data.flags)
            persistSelectedDocuments { picker.enumerateTree(treeUri) { false }.toList() }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val database = (application as VibraryApplication).database
        picker = SafPicker(this)
        selectionRepository = SelectionRepository(
            database.localSourceDao(),
            database.uploadQueueDao(),
            UploadWorkScheduler(this),
        )
        cacheManager = AndroidCacheManager(this, database.cacheEntryDao())

        lifecycleScope.launch {
            val server = database.pairedServerDao().activeServer()
            uiState.value = uiState.value.copy(pairedServer = server?.baseUrl)
        }

        setContent {
            VibraryApp(
                state = uiState.value,
                actions = VibraryActions(
                    onPair = ::pairServer,
                    onPickFiles = { filesLauncher.launch(picker.openDocumentIntent()) },
                    onPickFolder = { folderLauncher.launch(picker.openTreeIntent()) },
                    onSearch = ::search,
                    onOpenResult = ::openResult,
                    onClearCache = ::clearCache,
                ),
            )
        }
    }

    private fun persistPermissions(data: Intent) {
        val clipData = data.clipData
        if (clipData != null) {
            for (index in 0 until clipData.itemCount) {
                runCatching { picker.persistReadPermission(clipData.getItemAt(index).uri, data.flags) }
            }
        }
        data.data?.let { uri ->
            runCatching { picker.persistReadPermission(uri, data.flags) }
        }
    }

    private fun persistSelectedDocuments(provider: () -> List<SafDocumentRef>) {
        lifecycleScope.launch {
            val documents = withContext(Dispatchers.IO) { provider() }
            withContext(Dispatchers.IO) {
                selectionRepository.persistSelection(documents)
            }
            uiState.value = uiState.value.copy(
                selectedCount = uiState.value.selectedCount + documents.size,
                queuedCount = uiState.value.queuedCount + documents.size,
                status = "已加入上传队列 ${documents.size} 项",
            )
        }
    }

    private fun pairServer(serverUrl: String, pairingToken: String) {
        if (serverUrl.isBlank() || pairingToken.isBlank()) {
            uiState.value = uiState.value.copy(status = "请输入服务器地址和配对 token")
            return
        }
        lifecycleScope.launch {
            runCatching {
                val normalizedServerUrl = com.vibrary.android.network.normalizeRetrofitBaseUrl(serverUrl).trimEnd('/')
                val api = ApiClientFactory.create(normalizedServerUrl)
                val response = api.claimPairing(
                    PairingClaimRequest(
                        deviceId = deviceId(),
                        deviceName = android.os.Build.MODEL ?: "Android",
                        pairingToken = pairingToken,
                    ),
                )
                val database = (application as VibraryApplication).database
                database.pairedServerDao().upsert(
                    PairedServerEntity(
                        pairedServerId = UUID.randomUUID().toString(),
                        baseUrl = normalizedServerUrl,
                        deviceId = deviceId(),
                        pairingToken = response.deviceToken,
                        displayName = "Windows Vibrary",
                        isActive = true,
                        createdAt = Instant.now().toString(),
                        lastSeenAt = Instant.now().toString(),
                    ),
                )
                uiState.value = uiState.value.copy(pairedServer = normalizedServerUrl, status = "已配对")
            }.getOrElse { error ->
                uiState.value = uiState.value.copy(status = "配对失败：${error.userMessage()}")
            }
        }
    }

    private fun search(query: String) {
        if (query.isBlank()) return
        lifecycleScope.launch {
            runCatching {
                val server = activeServerOrError()
                val api = ApiClientFactory.create(server.baseUrl, server.pairingToken)
                val response = api.search(
                    SearchRequest(
                        deviceId = server.deviceId,
                        query = query,
                        searchTypes = listOf("text", "image"),
                        limit = 20,
                        filters = SearchFilters(),
                    ),
                )
                uiState.value = uiState.value.copy(searchResults = response.results, status = "找到 ${response.results.size} 条结果")
            }.getOrElse { error ->
                uiState.value = uiState.value.copy(status = "搜索失败：${error.userMessage()}")
            }
        }
    }

    private fun openResult(result: SearchResultDto) {
        lifecycleScope.launch {
            runCatching {
                val database = (application as VibraryApplication).database
                val server = activeServerOrError()
                val api = ApiClientFactory.create(server.baseUrl, server.pairingToken)
                val resolved = api.resolveAsset(result.assetId, ResolveRequest(server.deviceId))
                val handler = SearchResultHandler(
                    context = this@MainActivity,
                    localAssetRefDao = database.localAssetRefDao(),
                    localSourceDao = database.localSourceDao(),
                    cacheEntryDao = database.cacheEntryDao(),
                    cacheManager = cacheManager,
                    api = api,
                    httpClient = OkHttpClient(),
                    deviceId = server.deviceId,
                    serverBaseUrl = server.baseUrl,
                    bearerToken = server.pairingToken,
                )
                handler.handle(result.copy(delivery = resolved.delivery, availability = resolved.availability))
                uiState.value = uiState.value.copy(status = "已打开 ${result.title}")
            }.getOrElse { error ->
                uiState.value = uiState.value.copy(status = "打开失败：${error.userMessage()}")
            }
        }
    }

    private fun clearCache() {
        lifecycleScope.launch {
            val report = withContext(Dispatchers.IO) { cacheManager.cleanupAppCacheOnly() }
            uiState.value = uiState.value.copy(
                cleanedCacheCount = uiState.value.cleanedCacheCount + report.deletedEntryIds.size,
                status = "已清理 ${report.deletedEntryIds.size} 个缓存条目",
            )
        }
    }

    private suspend fun activeServerOrError(): PairedServerEntity =
        (application as VibraryApplication).database.pairedServerDao().activeServer()
            ?: error("尚未配对 Windows")

    private fun deviceId(): String {
        val preferences = getSharedPreferences("vibrary", MODE_PRIVATE)
        val existing = preferences.getString("device_id", null)
        if (existing != null) return existing
        val created = "android-${UUID.randomUUID()}"
        preferences.edit().putString("device_id", created).apply()
        return created
    }

    private fun Throwable.userMessage(): String = localizedMessage ?: message ?: javaClass.simpleName
}
