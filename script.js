// Selectoare DOM Standard
const statusMessageSpan = document.getElementById('status-message');
const localIpAddressSpan = document.getElementById('local-ip-address');
const publicIpAddressSpan = document.getElementById('public-ip-address');
const ipInfoBarDiv = document.getElementById('ip-info-bar');
const consoleOutput = document.getElementById('console-output');
const commandInput = document.getElementById('command-input');
const sendCommandButton = document.getElementById('send-command-button');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');

// Butoane de acțiune
const openFolderButtonMain = document.getElementById('open-folder-button-main');
const settingsButton = document.getElementById('settings-button');

// Container
const statusAndOpenFolderArea = document.getElementById('status-and-open-folder-area');
const statusBarContent = document.getElementById('status-bar-content');
const setupActivePlaceholderTop = document.getElementById('setup-active-placeholder-top');

// Modal Setup
const setupModal = document.getElementById('setup-modal');
const setupModalContent = document.getElementById('setup-modal-content');
const mcVersionModalSelect = document.getElementById('mc-version-modal');
const ramAllocationModalSelect = document.getElementById('ram-allocation-modal');
const downloadModalButton = document.getElementById('download-button-modal');
const downloadModalButtonIcon = downloadModalButton.querySelector('i');
const downloadModalButtonText = document.getElementById('download-button-text');

// Modal Settings
const settingsModal = document.getElementById('settings-modal');
const settingsModalContent = document.getElementById('settings-modal-content');
const mcVersionSettingsSelect = document.getElementById('mc-version-settings');
const ramAllocationSettingsSelect = document.getElementById('ram-allocation-settings');
const startWithWindowsCheckbox = document.getElementById('start-with-windows-checkbox');
const startMinimizedCheckbox = document.getElementById('start-minimized-checkbox');
const saveSettingsButton = document.getElementById('save-settings-button');
const closeSettingsButton = document.getElementById('close-settings-button');

// Title Bar
const minimizeBtn = document.getElementById('minimize-btn');
const maximizeBtn = document.getElementById('maximize-btn');
const closeBtn = document.getElementById('close-btn');
const maximizeBtnIcon = maximizeBtn.querySelector('i');

let localIsServerRunning = false;
let currentServerConfig = {};
let isModalAnimating = false;
let availableMcVersionsCache = [];

function addToConsole(message, type = 'INFO') {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = document.createElement('p');
    p.classList.add('console-message');
    let typeColor = '#9ca3af'; let typeText = type.toUpperCase();
    if (type === 'ERROR' || type === 'SERVER_ERROR') { typeColor = '#f87171'; typeText = type === 'SERVER_ERROR' ? 'STDERR' : 'ERROR'; }
    else if (type === 'WARN') { typeColor = '#facc15'; }
    else if (type === 'SUCCESS') { typeColor = '#4ade80'; }
    else if (type === 'CMD') { typeColor = '#60a5fa'; }
    else if (type === 'SERVER_LOG') {
        const sanitizedMessage = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        p.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> ${sanitizedMessage}`;
        consoleOutput.appendChild(p); consoleOutput.scrollTop = consoleOutput.scrollHeight; return;
    }
    const sanitizedMessage = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const typePrefix = `<span style="color: ${typeColor}; font-weight: bold;">[${typeText}]</span> `;
    p.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> ${typePrefix}${sanitizedMessage}`;
    consoleOutput.appendChild(p); consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function getStatusColor(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes("running")) return '#22c55e';
    if (lowerText.includes("failed") || lowerText.includes("error")) return '#ef4444';
    if (lowerText.includes("successfully") || lowerText.includes("saved") || lowerText.includes("ready")) return '#4ade80';
    if (lowerText.includes("stopped") || lowerText.includes("initialized")) return '#9ca3af';
    return '#3b82f6';
}

function setStatus(text, pulse = false) {
    statusMessageSpan.textContent = text;
    const pulseTarget = statusBarContent;
    const statusColor = getStatusColor(text);
    pulseTarget.classList.toggle('status-bar-pulse', pulse);
    statusMessageSpan.style.color = pulse ? '#3b82f6' : statusColor;
}

function showDownloadLoading() {
    downloadModalButton.disabled = true;
    mcVersionModalSelect.disabled = true;
    ramAllocationModalSelect.disabled = true;
    downloadModalButtonIcon.className = 'fas fa-spinner spinner mr-2';
    downloadModalButtonText.textContent = 'Downloading...';
}

function hideDownloadLoading() {
    downloadModalButton.disabled = false;
    mcVersionModalSelect.disabled = false;
    ramAllocationModalSelect.disabled = false;
    downloadModalButtonIcon.className = 'fas fa-download mr-2';
    downloadModalButtonText.textContent = 'Download / Configure Server';
}

function updateButtonStates(isRunning) {
    localIsServerRunning = isRunning;
    const setupComplete = setupModal.classList.contains('hidden');
    startButton.disabled = isRunning || !setupComplete;
    stopButton.disabled = !isRunning;
    sendCommandButton.disabled = !isRunning;
    commandInput.disabled = !isRunning;
    openFolderButtonMain.disabled = !setupComplete;
    settingsButton.disabled = isRunning || !setupComplete;
    startButton.classList.toggle('btn-disabled', startButton.disabled);
    stopButton.classList.toggle('btn-disabled', stopButton.disabled);
    sendCommandButton.classList.toggle('btn-disabled', sendCommandButton.disabled);
    openFolderButtonMain.classList.toggle('btn-disabled', openFolderButtonMain.disabled);
    settingsButton.classList.toggle('btn-disabled', settingsButton.disabled);
    statusAndOpenFolderArea.classList.toggle('hidden', !setupComplete);
    statusAndOpenFolderArea.classList.toggle('flex', setupComplete);
    setupActivePlaceholderTop.classList.toggle('hidden', setupComplete);
    if (!isRunning) commandInput.value = "";
}

async function populateMcVersionSelect(selectElement, currentVersion) {
    selectElement.disabled = true;
    if (availableMcVersionsCache.length === 0) {
        selectElement.innerHTML = '<option value="" disabled>Loading versions...</option>';
        try {
            availableMcVersionsCache = await window.electronAPI.getAvailablePaperMCVersions();
        } catch (error) {
            selectElement.innerHTML = '<option value="" disabled selected>Error loading versions</option>';
            return;
        }
    }

    selectElement.innerHTML = '';
    if (availableMcVersionsCache.length > 0) {
        availableMcVersionsCache.forEach((version, index) => {
            const option = document.createElement('option');
            option.value = version;
            option.textContent = version + (index === 0 ? ' (Latest)' : '');
            selectElement.appendChild(option);
        });
        selectElement.value = (currentVersion && availableMcVersionsCache.includes(currentVersion)) ? currentVersion : availableMcVersionsCache[0];
    } else {
        selectElement.innerHTML = '<option value="" disabled selected>No versions found</option>';
    }
    selectElement.disabled = false;
}

function showModal(modal, content) {
    if (isModalAnimating || !modal.classList.contains('hidden')) return;
    isModalAnimating = true;
    modal.classList.remove('hidden');
    modal.style.animation = 'fadeInModalBg 0.25s ease-out forwards';
    content.style.animation = 'fadeInModalContent 0.3s ease-out 0.05s forwards';
    content.addEventListener('animationend', () => isModalAnimating = false, { once: true });
}

function hideModal(modal, content, callback) {
    if (isModalAnimating || modal.classList.contains('hidden')) {
        if (callback) callback();
        return;
    }
    isModalAnimating = true;
    modal.style.animation = 'fadeOutModalBg 0.3s ease-in forwards';
    content.style.animation = 'fadeOutModalContent 0.25s ease-in forwards';
    content.addEventListener('animationend', () => {
        modal.classList.add('hidden');
        isModalAnimating = false;
        if (callback) callback();
    }, { once: true });
}

async function refreshUISetupState() {
    const { needsSetup, config, error } = await window.electronAPI.checkInitialSetup();
    if (error) {
        addToConsole(`Critical Error: ${error}.`, "ERROR");
        setStatus("Launcher Error!", false);
        updateButtonStates(localIsServerRunning);
        return;
    }
    currentServerConfig = config || {};
    if (needsSetup) {
        hideModal(settingsModal, settingsModalContent);
        showModal(setupModal, setupModalContent);
        await populateMcVersionSelect(mcVersionModalSelect, currentServerConfig.version);
        ramAllocationModalSelect.value = currentServerConfig.ram || 'auto';
        updateButtonStates(localIsServerRunning);
    } else {
        hideModal(setupModal, setupModalContent, () => {
            if (!localIsServerRunning) {
                setStatus("Server ready.", false);
            }
            updateButtonStates(localIsServerRunning);
        });
    }
}

// --- Event Listeners ---
downloadModalButton.addEventListener('click', () => {
    if (downloadModalButton.disabled) return;
    const version = mcVersionModalSelect.value;
    const ram = ramAllocationModalSelect.value;
    if (!version) {
        addToConsole("No Minecraft version selected.", "ERROR");
        return;
    }
    showDownloadLoading();
    window.electronAPI.downloadPaperMC({ mcVersion: version, ramAllocation: ram });
});

openFolderButtonMain.addEventListener('click', () => {
    if(!openFolderButtonMain.disabled) window.electronAPI.openServerFolder();
});

settingsButton.addEventListener('click', async () => {
    if (settingsButton.disabled) return;
    // Fetch and populate launcher settings
    const launcherSettings = await window.electronAPI.getSettings();
    startWithWindowsCheckbox.checked = launcherSettings.startWithWindows;
    startMinimizedCheckbox.checked = launcherSettings.startMinimized;
    // Fetch and populate server settings
    const serverConfig = await window.electronAPI.getServerConfig();
    await populateMcVersionSelect(mcVersionSettingsSelect, serverConfig.version);
    ramAllocationSettingsSelect.value = serverConfig.ram || 'auto';
    showModal(settingsModal, settingsModalContent);
});

closeSettingsButton.addEventListener('click', () => {
    hideModal(settingsModal, settingsModalContent);
});

saveSettingsButton.addEventListener('click', () => {
    // Save launcher settings
    const newLauncherSettings = {
        startWithWindows: startWithWindowsCheckbox.checked,
        startMinimized: startMinimizedCheckbox.checked,
    };
    window.electronAPI.setSettings(newLauncherSettings);
    // Save server settings and trigger download if needed
    const newMcVersion = mcVersionSettingsSelect.value;
    const newRam = ramAllocationSettingsSelect.value;
    window.electronAPI.downloadPaperMC({ mcVersion: newMcVersion, ramAllocation: newRam });
    addToConsole("Settings saved and applied.", "SUCCESS");
    hideModal(settingsModal, settingsModalContent);
});

startButton.addEventListener('click', () => {
    if (!startButton.disabled) window.electronAPI.startServer();
});

stopButton.addEventListener('click', () => {
    if (!stopButton.disabled) window.electronAPI.stopServer();
});

sendCommandButton.addEventListener('click', () => {
    const command = commandInput.value.trim();
    if (command && localIsServerRunning) {
        addToConsole(`> ${command}`, 'CMD');
        window.electronAPI.sendCommand(command);
        commandInput.value = '';
    }
});

commandInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') sendCommandButton.click();
});

minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

// --- Electron API Listeners ---
window.electronAPI.onWindowMaximized((isMaximized) => {
    maximizeBtnIcon.className = isMaximized ? 'far fa-window-restore' : 'far fa-square';
    maximizeBtn.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
});

window.electronAPI.onUpdateConsole((message, type) => addToConsole(message, type));

window.electronAPI.onUpdateStatus(async (message, pulse) => {
    setStatus(message, pulse);
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('downloaded successfully') || lowerMessage.includes('configuration saved')) {
        hideDownloadLoading();
        await refreshUISetupState();
    } else if ((lowerMessage.includes('failed') || lowerMessage.includes('error')) && !setupModal.classList.contains('hidden')) {
        hideDownloadLoading();
    }
});

window.electronAPI.onServerStateChange(async (isRunning) => {
    updateButtonStates(isRunning);
    if (isRunning) {
        setStatus('Server is running.', false);
        ipInfoBarDiv.classList.add('animate-green-attention');
        ipInfoBarDiv.addEventListener('animationend', () => ipInfoBarDiv.classList.remove('animate-green-attention'), { once: true });
    }
    await refreshUISetupState();
});

window.electronAPI.onRequestStatusCheckForFail(() => {
    if (statusMessageSpan.textContent.toLowerCase().includes('starting')) {
        setStatus('Server failed to stay running.', false);
    }
});

async function fetchAndDisplayIPs() {
    try {
        localIpAddressSpan.textContent = await window.electronAPI.getLocalIP() || 'N/A';
    } catch (error) { localIpAddressSpan.textContent = 'Error'; }
    try {
        publicIpAddressSpan.textContent = await window.electronAPI.getPublicIP() || 'N/A';
    } catch (error) { publicIpAddressSpan.textContent = 'Error'; }
}

async function initializeApp() {
    addToConsole("Launcher initializing...", "INFO");
    setStatus("Initializing...", true);
    await fetchAndDisplayIPs();
    await refreshUISetupState();
    addToConsole("Launcher initialized.", "INFO");
}

document.addEventListener('DOMContentLoaded', initializeApp);