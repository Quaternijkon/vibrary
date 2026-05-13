package com.vibrary.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.vibrary.android.core.UploadQueueState
import com.vibrary.android.network.SearchResultDto

data class VibraryUiState(
    val status: String = "Ready",
    val pairedServer: String? = null,
    val selectedCount: Int = 0,
    val queuedCount: Int = 0,
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
)

@Composable
fun VibraryApp(
    state: VibraryUiState,
    actions: VibraryActions,
) {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            var selectedTab by remember { mutableStateOf(AppTab.Pair) }
            Scaffold(
                bottomBar = {
                    NavigationBar {
                        AppTab.entries.forEach { tab ->
                            NavigationBarItem(
                                selected = tab == selectedTab,
                                onClick = { selectedTab = tab },
                                label = { Text(tab.label) },
                                icon = {},
                            )
                        }
                    }
                },
            ) { paddingValues ->
                when (selectedTab) {
                    AppTab.Pair -> PairingScreen(state, actions, Modifier.padding(paddingValues))
                    AppTab.Select -> SourceSelectionScreen(state, actions, Modifier.padding(paddingValues))
                    AppTab.Queue -> UploadQueueScreen(state, Modifier.padding(paddingValues))
                    AppTab.Search -> SearchScreen(state, actions, Modifier.padding(paddingValues))
                    AppTab.Cache -> CacheScreen(state, actions, Modifier.padding(paddingValues))
                }
            }
        }
    }
}

private enum class AppTab(val label: String) {
    Pair("Pair"),
    Select("Select"),
    Queue("Queue"),
    Search("Search"),
    Cache("Cache"),
}

@Composable
private fun PairingScreen(
    state: VibraryUiState,
    actions: VibraryActions,
    modifier: Modifier = Modifier,
) {
    var serverUrl by remember { mutableStateOf(state.pairedServer ?: "http://") }
    var pairingToken by remember { mutableStateOf("") }
    ScreenColumn(modifier) {
        Text("Pair Server", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("Server URL") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = pairingToken,
            onValueChange = { pairingToken = it },
            label = { Text("Pairing token") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(onClick = { actions.onPair(serverUrl.trim(), pairingToken.trim()) }) {
            Text("Pair")
        }
        Text(state.pairedServer ?: "No paired server")
        StatusText(state.status)
    }
}

@Composable
private fun SourceSelectionScreen(
    state: VibraryUiState,
    actions: VibraryActions,
    modifier: Modifier = Modifier,
) {
    ScreenColumn(modifier) {
        Text("Sources", style = MaterialTheme.typography.headlineSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = actions.onPickFiles) { Text("Files") }
            Button(onClick = actions.onPickFolder) { Text("Folder") }
        }
        MetricRow("Selected", state.selectedCount.toString())
        MetricRow("Queued", state.queuedCount.toString())
        StatusText(state.status)
    }
}

@Composable
private fun UploadQueueScreen(
    state: VibraryUiState,
    modifier: Modifier = Modifier,
) {
    ScreenColumn(modifier) {
        Text("Upload Queue", style = MaterialTheme.typography.headlineSmall)
        UploadStateCard(UploadQueueState.QUEUED, "Waiting")
        UploadStateCard(UploadQueueState.PREFLIGHT, "Preflight")
        UploadStateCard(UploadQueueState.UPLOADING, "Uploading")
        UploadStateCard(UploadQueueState.SERVER_INDEXING, "Indexing")
        MetricRow("Queued", state.queuedCount.toString())
    }
}

@Composable
private fun SearchScreen(
    state: VibraryUiState,
    actions: VibraryActions,
    modifier: Modifier = Modifier,
) {
    var query by remember { mutableStateOf("") }
    ScreenColumn(modifier) {
        Text("Search", style = MaterialTheme.typography.headlineSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Query") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            Button(onClick = { actions.onSearch(query.trim()) }) { Text("Search") }
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
    modifier: Modifier = Modifier,
) {
    ScreenColumn(modifier) {
        Text("Cache", style = MaterialTheme.typography.headlineSmall)
        MetricRow("Cleaned entries", state.cleanedCacheCount.toString())
        Button(onClick = actions.onClearCache) { Text("Clean app cache") }
        StatusText(state.status)
    }
}

@Composable
private fun ScreenColumn(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        content()
    }
}

@Composable
private fun UploadStateCard(state: UploadQueueState, subtitle: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(state.wireValue, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(4.dp))
            Text(subtitle)
        }
    }
}

@Composable
private fun ResultCard(result: SearchResultDto, onOpen: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(result.title, style = MaterialTheme.typography.titleMedium)
            Text("${result.delivery.mode} / ${result.availability.requestingDevice.recommendedAction}")
            Button(onClick = onOpen) { Text("Open") }
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
    Text(status, style = MaterialTheme.typography.bodyMedium)
}
