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
import com.vibrary.android.network.DiscoveryAnnouncement
import com.vibrary.android.network.LanDiscoveryClient
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
import com.vibrary.android.ui.toUploadQueueRow
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
    private val discoveredServers = linkedMapOf<String, DiscoveryAnnouncement>()

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

        observeActiveServer()
        observeUploadQueue()
        startLanDiscovery()

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
                    onForgetServer = ::forgetServer,
                ),
            )
        }
    }

    private fun observeActiveServer() {
        val database = (application as VibraryApplication).database
        lifecycleScope.launch {
            database.pairedServerDao().observeActiveServer().collect { server ->
                uiState.value = uiState.value.copy(
                    pairedServer = server?.baseUrl,
                    pairedServerName = server?.displayName,
                )
            }
        }
    }

    private fun observeUploadQueue() {
        val database = (application as VibraryApplication).database
        lifecycleScope.launch {
            database.uploadQueueDao().observeAll().collect { items ->
                val activeCount = items.count { item -> item.completedAt == null }
                uiState.value = uiState.value.copy(
                    queuedCount = activeCount,
                    uploadRows = items.map { item -> item.toUploadQueueRow() },
                )
            }
        }
    }

    private fun startLanDiscovery() {
        lifecycleScope.launch {
            runCatching {
                LanDiscoveryClient().listen { announcement ->
                    withContext(Dispatchers.Main) {
                        discoveredServers[announcement.instanceId] = announcement
                        uiState.value = uiState.value.copy(
                            discoveredServers = discoveredServers.values.toList(),
                            status = if (uiState.value.pairedServer == null) {
                                "已发现 ${discoveredServers.size} 台可加入电脑"
                            } else {
                                uiState.value.status
                            },
                        )
                    }
                }
            }.getOrElse { error ->
                uiState.value = uiState.value.copy(status = "局域网发现启动失败：${error.userMessage()}")
            }
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
                status = "已加入上传队列 ${documents.size} 项，队列页可查看传输进度",
            )
        }
    }

    private fun pairServer(serverUrl: String, pairingToken: String) {
        if (serverUrl.isBlank() || pairingToken.isBlank()) {
            uiState.value = uiState.value.copy(status = "请选择电脑并输入 6 位验证码")
            return
        }
        if (!Regex("^\\d{6}$").matches(pairingToken)) {
            uiState.value = uiState.value.copy(status = "验证码应为 6 位数字")
            return
        }
        lifecycleScope.launch {
            runCatching {
                val normalizedServerUrl = com.vibrary.android.network.normalizeRetrofitBaseUrl(serverUrl).trimEnd('/')
                val api = ApiClientFactory.create(normalizedServerUrl)
                val displayName = discoveredServers.values.firstOrNull { it.serverUrl == normalizedServerUrl }?.deviceName
                    ?: "Windows Vibrary"
                val response = api.claimPairing(
                    PairingClaimRequest(
                        deviceId = deviceId(),
                        deviceName = android.os.Build.MODEL ?: "Android",
                        pairingToken = pairingToken,
                    ),
                )
                val database = (application as VibraryApplication).database
                database.pairedServerDao().deactivateAll()
                database.pairedServerDao().upsert(
                    PairedServerEntity(
                        pairedServerId = UUID.randomUUID().toString(),
                        baseUrl = normalizedServerUrl,
                        deviceId = deviceId(),
                        pairingToken = response.deviceToken,
                        displayName = displayName,
                        isActive = true,
                        createdAt = Instant.now().toString(),
                        lastSeenAt = Instant.now().toString(),
                    ),
                )
                uiState.value = uiState.value.copy(
                    pairedServer = normalizedServerUrl,
                    pairedServerName = displayName,
                    status = "已连接 $displayName，之后会自动复用此连接",
                )
            }.getOrElse { error ->
                uiState.value = uiState.value.copy(status = "配对失败：${error.userMessage()}")
            }
        }
    }

    private fun forgetServer() {
        lifecycleScope.launch {
            runCatching {
                val database = (application as VibraryApplication).database
                val server = activeServerOrError()
                runCatching {
                    ApiClientFactory.create(server.baseUrl, server.pairingToken).deleteDevice(server.deviceId)
                }
                database.pairedServerDao().deactivate(server.pairedServerId)
                uiState.value = uiState.value.copy(
                    pairedServer = null,
                    pairedServerName = null,
                    status = "已移除此电脑，需要重新输入验证码才能加入",
                )
            }.getOrElse { error ->
                uiState.value = uiState.value.copy(status = "移除失败：${error.userMessage()}")
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
