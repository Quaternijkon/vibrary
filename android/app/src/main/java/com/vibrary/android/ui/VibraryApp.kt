package com.vibrary.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.vibrary.android.network.DiscoveryAnnouncement
import com.vibrary.android.network.SearchResultDto

data class VibraryUiState(
    val status: String = "就绪",
    val pairedServer: String? = null,
    val pairedServerName: String? = null,
    val selectedCount: Int = 0,
    val queuedCount: Int = 0,
    val discoveredServers: List<DiscoveryAnnouncement> = emptyList(),
    val uploadRows: List<UploadQueueRow> = emptyList(),
    val cleanedCacheCount: Int = 0,
    val searchResults: List<SearchResultDto> = emptyList(),
)

data class VibraryActions(
    val onPair: (serverUrl: String, pairingToken: String) -> Unit,
    val onPickFiles: () -> Unit,
    val onPickFolder: () -> Unit,
    val onSearch: (query: String) -> Unit,
    val onOpenResult: (SearchResultDto) -> Unit,
    val onClearCache: () -> Unit,
    val onForgetServer: () -> Unit,
)

private val VibraryColors = lightColorScheme(
    primary = Color(0xFF14786F),
    onPrimary = Color.White,
    secondary = Color(0xFF7B4E9D),
    surface = Color.White,
    surfaceVariant = Color(0xFFE8EFEA),
    background = Color(0xFFF5F6F3),
    onBackground = Color(0xFF1F2933),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VibraryApp(
    state: VibraryUiState,
    actions: VibraryActions,
) {
    MaterialTheme(colorScheme = VibraryColors) {
        var selectedTab by remember { mutableStateOf(AppTab.Pair) }
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("Vibrary 本地资料库", style = MaterialTheme.typography.titleLarge)
                            Text(state.pairedServerName ?: state.pairedServer ?: "正在发现附近电脑", style = MaterialTheme.typography.bodySmall)
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onBackground,
                    ),
                )
            },
            bottomBar = {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    AppTab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = tab == selectedTab,
                            onClick = { selectedTab = tab },
                            label = { Text(tab.label) },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                        )
                    }
                }
            },
        ) { paddingValues ->
            Surface(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(paddingValues),
                color = MaterialTheme.colorScheme.background,
            ) {
                when (selectedTab) {
                    AppTab.Pair -> PairingScreen(state, actions)
                    AppTab.Select -> SourceSelectionScreen(state, actions)
                    AppTab.Queue -> UploadQueueScreen(state)
                    AppTab.Search -> SearchScreen(state, actions)
                    AppTab.Cache -> CacheScreen(state, actions)
                }
            }
        }
    }
}

private enum class AppTab(val label: String, val icon: ImageVector) {
    Pair("配对", Icons.Filled.Link),
    Select("资料", Icons.Filled.Folder),
    Queue("队列", Icons.Filled.CloudUpload),
    Search("搜索", Icons.Filled.Search),
    Cache("缓存", Icons.Filled.Storage),
}

@Composable
private fun PairingScreen(
    state: VibraryUiState,
    actions: VibraryActions,
) {
    var pairingCode by remember { mutableStateOf("") }
    var manualServerUrl by remember { mutableStateOf("") }
    LaunchedEffect(state.pairedServer) {
        if (state.pairedServer != null) {
            manualServerUrl = state.pairedServer
        }
    }
    ScreenColumn {
        SectionTitle("连接电脑")
        Panel {
            if (state.pairedServer != null) {
                MetricRow("当前电脑", state.pairedServerName ?: state.pairedServer)
                OutlinedButton(onClick = actions.onForgetServer) {
                    Text("移除此电脑")
                }
            } else {
                Text("在电脑端打开 Vibrary，输入电脑上显示的 6 位验证码加入。", style = MaterialTheme.typography.bodyMedium)
            }
            OutlinedTextField(
                value = pairingCode,
                onValueChange = { value -> pairingCode = value.filter(Char::isDigit).take(6) },
                label = { Text("验证码") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        SectionTitle("附近可加入设备")
        if (state.discoveredServers.isEmpty()) {
            Panel {
                Text("正在搜索同一局域网中的 Vibrary 电脑端。", style = MaterialTheme.typography.bodyMedium)
            }
        } else {
            state.discoveredServers.forEach { server ->
                Panel {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(server.deviceName, style = MaterialTheme.typography.titleMedium)
                            Text(server.serverUrl, style = MaterialTheme.typography.bodySmall)
                        }
                        Button(onClick = { actions.onPair(server.serverUrl, pairingCode.trim()) }) {
                            Text("加入")
                        }
                    }
                }
            }
        }
        SectionTitle("手动连接")
        Panel {
            OutlinedTextField(
                value = manualServerUrl,
                onValueChange = { manualServerUrl = it },
                label = { Text("电脑地址") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(onClick = { actions.onPair(manualServerUrl.trim(), pairingCode.trim()) }) {
                Icon(Icons.Filled.Link, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("用验证码加入")
            }
        }
        StatusText(state.status)
    }
}

@Composable
private fun SourceSelectionScreen(
    state: VibraryUiState,
    actions: VibraryActions,
) {
    ScreenColumn {
        SectionTitle("选择资料")
        Panel {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                Button(onClick = actions.onPickFiles, modifier = Modifier.weight(1f)) {
                    Icon(Icons.AutoMirrored.Filled.InsertDriveFile, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("选择文件")
                }
                OutlinedButton(onClick = actions.onPickFolder, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.Folder, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("选择文件夹")
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                MetricCard("已选择", state.selectedCount.toString(), Modifier.weight(1f))
                MetricCard("待上传", state.queuedCount.toString(), Modifier.weight(1f))
            }
        }
        StatusText(state.status)
    }
}

@Composable
private fun UploadQueueScreen(
    state: VibraryUiState,
) {
    ScreenColumn {
        SectionTitle("上传队列")
        if (state.uploadRows.isEmpty()) {
            Panel {
                Text("还没有上传任务。选择文件后会在这里显示哈希、传输和电脑索引状态。")
            }
        } else {
            state.uploadRows.forEach { row ->
                UploadQueueRowCard(row)
            }
        }
        MetricCard("队列数量", state.queuedCount.toString(), Modifier.fillMaxWidth())
    }
}

@Composable
private fun SearchScreen(
    state: VibraryUiState,
    actions: VibraryActions,
) {
    var query by remember { mutableStateOf("") }
    ScreenColumn {
        SectionTitle("搜索")
        Panel {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("关键词") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Button(onClick = { actions.onSearch(query.trim()) }) {
                    Icon(Icons.Filled.Search, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("搜索")
                }
            }
        }
        state.searchResults.forEach { result ->
            ResultCard(result = result, onOpen = { actions.onOpenResult(result) })
        }
        StatusText(state.status)
    }
}

@Composable
private fun CacheScreen(
    state: VibraryUiState,
    actions: VibraryActions,
) {
    ScreenColumn {
        SectionTitle("缓存")
        Panel {
            MetricCard("已清理条目", state.cleanedCacheCount.toString(), Modifier.fillMaxWidth())
            Button(onClick = actions.onClearCache) {
                Icon(Icons.Filled.Delete, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("清理应用缓存")
            }
        }
        StatusText(state.status)
    }
}

@Composable
private fun ScreenColumn(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        content()
    }
}

@Composable
private fun Panel(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            content()
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.headlineSmall)
}

@Composable
private fun MetricCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(value, style = MaterialTheme.typography.headlineSmall)
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun UploadQueueRowCard(row: UploadQueueRow) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(row.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text(row.stateLabel, color = MaterialTheme.colorScheme.secondary)
            }
            LinearProgressIndicator(
                progress = { row.progressFraction },
                modifier = Modifier.fillMaxWidth(),
            )
            Text(row.progressLabel, style = MaterialTheme.typography.bodySmall)
            row.detail?.let { detail ->
                Text(detail, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(modifier = Modifier.height(4.dp))
        }
    }
}

@Composable
private fun ResultCard(result: SearchResultDto, onOpen: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(result.title, style = MaterialTheme.typography.titleMedium)
            Text("${deliveryLabel(result.delivery.mode)} / ${actionLabel(result.availability.requestingDevice.recommendedAction)}")
            Button(onClick = onOpen) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("打开")
            }
        }
    }
}

@Composable
private fun MetricRow(label: String, value: String) {
    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
        Text(label)
        Text(value)
    }
}

@Composable
private fun StatusText(status: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Text(status, modifier = Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium)
    }
}

private fun deliveryLabel(mode: String): String = when (mode) {
    "local_reference" -> "本地副本"
    "download_to_cache" -> "下载缓存"
    "stream_or_download" -> "预览或下载"
    else -> mode
}

private fun actionLabel(action: String): String = when (action) {
    "open_local" -> "打开原文件"
    "open_cache" -> "打开缓存"
    "open_library" -> "打开资料库"
    "download_to_cache" -> "下载到缓存"
    "stream_or_download" -> "预览或下载"
    "unavailable" -> "不可用"
    else -> action
}
