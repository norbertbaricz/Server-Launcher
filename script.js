// Selectoare DOM Standard
const statusMessageSpan = document.getElementById('status-message');
const localIpAddressSpan = document.getElementById('local-ip-address');
const publicIpAddressSpan = document.getElementById('public-ip-address');
const serverVersionSpan = document.getElementById('server-version');
const ipInfoBarDiv = document.getElementById('ip-info-bar');
const consoleOutput = document.getElementById('console-output');
const commandInput = document.getElementById('command-input');
const sendCommandButton = document.getElementById('send-command-button');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');
const memoryUsageSpan = document.getElementById('memory-usage');
const serverTpsSpan = document.getElementById('server-tps');

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
const javaArgumentsSettingsSelect = document.getElementById('java-arguments-settings');
const startWithWindowsCheckbox = document.getElementById('start-with-windows-checkbox');
const saveSettingsButton = document.getElementById('save-settings-button');
const closeSettingsButton = document.getElementById('close-settings-button');
const serverPropertiesContainer = document.getElementById('server-properties-container');
const autoStartServerCheckbox = document.getElementById('auto-start-server-checkbox');
const autoStartDelayContainer = document.getElementById('auto-start-delay-container');
const autoStartDelaySlider = document.getElementById('auto-start-delay-slider');
const autoStartDelayValue = document.getElementById('auto-start-delay-value');

// Modal Java Install
const javaInstallModal = document.getElementById('java-install-modal');
const javaInstallModalContent = document.getElementById('java-install-modal-content');
const javaInstallMessage = document.getElementById('java-install-message');
const javaInstallButton = document.getElementById('java-install-button');
const javaRestartButton = document.getElementById('java-restart-button');
const javaInstallProgressBarContainer = document.getElementById('java-install-progress-bar-container');
const javaInstallProgressBar = document.getElementById('java-install-progress-bar');

// Title Bar
const minimizeBtn = document.getElementById('minimize-btn');
const maximizeBtn = document.getElementById('maximize-btn');
const closeBtn = document.getElementById('close-btn');
const maximizeBtnIcon = maximizeBtn.querySelector('i');

let localIsServerRunning = false;
let currentServerConfig = {};
let isModalAnimating = false;
let availableMcVersionsCache = [];
let allocatedRamCache = '-';
let autoStartIsActive = false; 
let countdownInterval = null;

function addToConsole(message, type = 'INFO') {
    const p = document.createElement('p');
    p.classList.add('console-message');

    if (type === 'SERVER_LOG_HTML') {
        p.innerHTML = `${message}`;
        consoleOutput.appendChild(p);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        return;
    }
    
    let typeColor = '#9ca3af'; let typeText = type.toUpperCase();
    if (type === 'ERROR' || type === 'SERVER_ERROR') { typeColor = '#f87171'; typeText = type === 'SERVER_ERROR' ? 'STDERR' : 'ERROR'; }
    else if (type === 'WARN') { typeColor = '#facc15'; }
    else if (type === 'SUCCESS') { typeColor = '#4ade80'; }
    else if (type === 'CMD') { typeColor = '#60a5fa'; }

    const sanitizedMessage = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const typePrefix = `<span style="color: ${typeColor}; font-weight: bold;">[${typeText}]</span> `;
    p.innerHTML = `${typePrefix}${sanitizedMessage}`;
    consoleOutput.appendChild(p);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function getStatusColor(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes("running")) return '#22c55e';
    if (lowerText.includes("failed") || lowerText.includes("error")) return '#ef4444';
    if (lowerText.includes("successfully") || lowerText.includes("saved") || lowerText.includes("ready")) return '#4ade80';
    if (lowerText.includes("stopped") || lowerText.includes("initialized") || lowerText.includes("cancelled")) return '#9ca3af';
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
    
    startButton.disabled = isRunning || !setupComplete || autoStartIsActive;
    
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

    if (currentServerConfig && currentServerConfig.version) {
        serverVersionSpan.textContent = currentServerConfig.version;
    } else {
        serverVersionSpan.textContent = '-';
    }
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
    } else {
        hideModal(setupModal, setupModalContent, () => {
            if (!localIsServerRunning && !autoStartIsActive) {
                setStatus("Server ready.", false);
            }
        });
    }
    updateButtonStates(localIsServerRunning);
    await fetchAndDisplayIPs();
}

async function populateServerProperties() {
    serverPropertiesContainer.innerHTML = '<p class="text-gray-400 text-center">Loading properties...</p>';
    const properties = await window.electronAPI.getServerProperties();
    serverPropertiesContainer.innerHTML = '';

    if (!properties || Object.keys(properties).length === 0) {
        serverPropertiesContainer.innerHTML = '<p class="text-gray-400 text-center">Could not load server.properties. Run the server once to generate it.</p>';
        return;
    }

    for (const key in properties) {
        const value = properties[key];
        const propDiv = document.createElement('div');
        propDiv.className = 'flex items-center justify-between';
        const label = document.createElement('label');
        label.textContent = key.replace(/-/g, ' ');
        label.className = 'text-sm text-gray-300 capitalize';
        label.htmlFor = `prop-${key}`;
        let input;
        if (value === 'true' || value === 'false') {
            input = document.createElement('select');
            input.className = 'w-1/2 bg-gray-600 border border-gray-500 text-gray-200 text-sm rounded-md p-1.5 focus:ring-blue-500 focus:border-blue-500';
            const trueOpt = document.createElement('option');
            trueOpt.value = 'true';
            trueOpt.textContent = 'True';
            const falseOpt = document.createElement('option');
            falseOpt.value = 'false';
            falseOpt.textContent = 'False';
            input.appendChild(trueOpt);
            input.appendChild(falseOpt);
            input.value = value;
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'w-1/2 bg-gray-600 border border-gray-500 text-gray-200 text-sm rounded-md p-1.5 focus:ring-blue-500 focus:border-blue-500';
            input.value = value;
        }
        input.id = `prop-${key}`;
        input.dataset.key = key;
        propDiv.appendChild(label);
        propDiv.appendChild(input);
        serverPropertiesContainer.appendChild(propDiv);
    }
}

downloadModalButton.addEventListener('click', () => {
    if (downloadModalButton.disabled) return;
    const version = mcVersionModalSelect.value;
    const ram = ramAllocationModalSelect.value;
    if (!version) {
        addToConsole("No Minecraft version selected.", "ERROR");
        return;
    }
    showDownloadLoading();
    window.electronAPI.downloadPaperMC({ mcVersion: version, ramAllocation: ram, javaArgs: 'Default' });
});

openFolderButtonMain.addEventListener('click', () => { if(!openFolderButtonMain.disabled) window.electronAPI.openServerFolder(); });

settingsButton.addEventListener('click', async () => {
    if (settingsButton.disabled) return;
    const launcherSettings = await window.electronAPI.getSettings();
    startWithWindowsCheckbox.checked = launcherSettings.openAtLogin;
    autoStartServerCheckbox.checked = launcherSettings.autoStartServer;
    
    const delay = launcherSettings.autoStartDelay || 5;
    autoStartDelaySlider.value = delay;
    autoStartDelayValue.textContent = `${delay}s`;
    autoStartDelayContainer.classList.toggle('hidden', !launcherSettings.autoStartServer);
    
    const serverConfig = await window.electronAPI.getServerConfig();
    await populateMcVersionSelect(mcVersionSettingsSelect, serverConfig.version);
    ramAllocationSettingsSelect.value = serverConfig.ram || 'auto';
    javaArgumentsSettingsSelect.value = serverConfig.javaArgs || 'Default';
    await populateServerProperties();
    showModal(settingsModal, settingsModalContent);
});

closeSettingsButton.addEventListener('click', () => hideModal(settingsModal, settingsModalContent));

saveSettingsButton.addEventListener('click', () => {
    const newLauncherSettings = { 
        openAtLogin: startWithWindowsCheckbox.checked, 
        autoStartServer: autoStartServerCheckbox.checked,
        autoStartDelay: parseInt(autoStartDelaySlider.value, 10)
    };
    window.electronAPI.setSettings(newLauncherSettings);
    
    const newProperties = {};
    serverPropertiesContainer.querySelectorAll('input, select').forEach(input => {
        newProperties[input.dataset.key] = input.value;
    });
    if (Object.keys(newProperties).length > 0) window.electronAPI.setServerProperties(newProperties);
    
    const newMcVersion = mcVersionSettingsSelect.value;
    const newRam = ramAllocationSettingsSelect.value;
    const newJavaArgs = javaArgumentsSettingsSelect.value;
    window.electronAPI.downloadPaperMC({ mcVersion: newMcVersion, ramAllocation: newRam, javaArgs: newJavaArgs });
    
    addToConsole("Settings saved and applied.", "SUCCESS");
    hideModal(settingsModal, settingsModalContent);
});

startButton.addEventListener('click', () => { 
    if (!startButton.disabled) {
        window.electronAPI.startServer(); 
    }
});

stopButton.addEventListener('click', () => { 
    if (!stopButton.disabled) {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        autoStartIsActive = false;
        setStatus("Auto-start cancelled.", false);
        updateButtonStates(localIsServerRunning);
        window.electronAPI.stopServer(); 
    }
});

sendCommandButton.addEventListener('click', () => {
    const command = commandInput.value.trim();
    if (command && localIsServerRunning) {
        addToConsole(`> ${command}`, 'CMD');
        window.electronAPI.sendCommand(command);
        commandInput.value = '';
    }
});

autoStartServerCheckbox.addEventListener('change', () => {
    autoStartDelayContainer.classList.toggle('hidden', !autoStartServerCheckbox.checked);
});

autoStartDelaySlider.addEventListener('input', () => {
    autoStartDelayValue.textContent = `${autoStartDelaySlider.value}s`;
});

commandInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') sendCommandButton.click(); });
minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

window.electronAPI.onWindowMaximized((isMaximized) => {
    maximizeBtnIcon.className = isMaximized ? 'far fa-window-restore' : 'far fa-square';
    maximizeBtn.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
});

window.electronAPI.onUpdateConsole((message, type) => addToConsole(message, type));

window.electronAPI.onUpdateStatus(async (message, pulse) => {
    setStatus(message, pulse);
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('starting')) {
        settingsButton.disabled = true;
        settingsButton.classList.add('btn-disabled');
    }

    if ((lowerMessage.includes('failed') || lowerMessage.includes('error')) && !setupModal.classList.contains('hidden')) {
        hideDownloadLoading();
    }
});

window.electronAPI.onSetupFinished(async () => {
    hideDownloadLoading();
    await refreshUISetupState();
});

window.electronAPI.onServerStateChange(async (isRunning) => {
    if (isRunning) {
        autoStartIsActive = false;
        if (countdownInterval) clearInterval(countdownInterval);
        setStatus('Server is running.', false);
        ipInfoBarDiv.classList.add('animate-green-attention');
        ipInfoBarDiv.addEventListener('animationend', () => ipInfoBarDiv.classList.remove('animate-green-attention'), { once: true });
        memoryUsageSpan.textContent = `— / ${allocatedRamCache !== '-' ? allocatedRamCache : '...'} GB`;
    } else {
        if (!autoStartIsActive) {
            setStatus("Server stopped.", false);
        }
        memoryUsageSpan.textContent = '— / — GB';
        memoryUsageSpan.style.color = '';
        serverTpsSpan.textContent = '— / 20.0';
        serverTpsSpan.style.color = '';
        allocatedRamCache = '-'; 
    }
    updateButtonStates(isRunning);
    await refreshUISetupState();
});

window.electronAPI.onUpdatePerformanceStats(({ tps, memoryGB, allocatedRamGB }) => {
    if (allocatedRamGB) {
        allocatedRamCache = allocatedRamGB;
    }
    
    if (typeof memoryGB !== 'undefined') {
        const memUsage = parseFloat(memoryGB);
        const allocatedRam = parseFloat(allocatedRamCache);

        if (!isNaN(memUsage) && !isNaN(allocatedRam) && allocatedRam > 0) {
            const finalMemUsage = Math.max(0, memUsage);
            memoryUsageSpan.textContent = `${finalMemUsage.toFixed(2)} / ${allocatedRamCache} GB`;

            const usagePercent = (finalMemUsage / allocatedRam) * 100;

            if (usagePercent >= 90) {
                memoryUsageSpan.style.color = '#ef4444';
            } else if (usagePercent >= 70) {
                memoryUsageSpan.style.color = '#facc15';
            } else {
                memoryUsageSpan.style.color = '#4ade80';
            }
        }
    }

    if (tps) {
        const tpsValue = parseFloat(tps);
        serverTpsSpan.textContent = `${tpsValue.toFixed(1)} / 20.0`;
        if (tpsValue < 15) serverTpsSpan.style.color = '#ef4444';
        else if (tpsValue < 18) serverTpsSpan.style.color = '#facc15';
        else serverTpsSpan.style.color = '#4ade80';
    }
});

window.electronAPI.onRequestStatusCheckForFail(() => {
    if (statusMessageSpan.textContent.toLowerCase().includes('starting')) {
        setStatus('Server failed to stay running.', false);
    }
});

async function fetchAndDisplayIPs() {
    let port = '';
    try {
        const properties = await window.electronAPI.getServerProperties();
        if (properties && properties['server-port']) {
            port = `:${properties['server-port']}`;
        }
    } catch (error) {
        console.warn("Could not fetch server port for display.", error);
    }
    try {
        const localIP = await window.electronAPI.getLocalIP() || '-';
        localIpAddressSpan.textContent = (localIP !== '-' && localIP !== 'Error') ? `${localIP}${port}` : localIP;
    } catch (error) { localIpAddressSpan.textContent = 'Error'; }
    try {
        const publicIP = await window.electronAPI.getPublicIP() || '-';
        publicIpAddressSpan.textContent = (publicIP !== '-' && publicIP !== 'Error') ? `${publicIP}${port}` : publicIP;
    } catch (error) { publicIpAddressSpan.textContent = 'Error'; }
}

async function initializeApp() {
    const iconPath = await window.electronAPI.getIconPath();
    document.getElementById('app-icon').src = iconPath;
    addToConsole("Launcher initializing...", "INFO");
    setStatus("Initializing...", true);
    const version = await window.electronAPI.getAppVersion();
    const titleText = `Server Launcher v${version}`;
    document.title = titleText;
    document.getElementById('app-title-version').textContent = titleText;
    await refreshUISetupState();
    addToConsole("Launcher initialized.", "INFO");
}

document.addEventListener('DOMContentLoaded', initializeApp);

function startCountdown(seconds, message, callback) {
    if (countdownInterval) clearInterval(countdownInterval);

    let remaining = seconds;
    const updateStatus = () => {
        if (!autoStartIsActive) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            updateButtonStates(localIsServerRunning);
            return;
        }

        if (remaining > 0) {
            setStatus(`${message} in ${remaining}s...`, true);
            remaining--;
        } else {
            clearInterval(countdownInterval);
            countdownInterval = null;
            if (autoStartIsActive) {
                callback();
            }
        }
    };

    updateStatus();
    countdownInterval = setInterval(updateStatus, 1000);
}

window.electronAPI.onStartCountdown((type, delay) => {
    if (localIsServerRunning) return;
    
    autoStartIsActive = true;
    updateButtonStates(localIsServerRunning);

    const message = type === 'initial' ? 'Auto-starting server' : 'Auto-restarting server';
    startCountdown(delay, message, () => {
        if (autoStartIsActive && !localIsServerRunning) {
            window.electronAPI.startServer();
        } else {
            autoStartIsActive = false;
            updateButtonStates(localIsServerRunning);
        }
    });
});

// ===== JAVA INSTALL LISTENERS =====
window.electronAPI.onJavaInstallRequired(() => {
    showModal(javaInstallModal, javaInstallModalContent);
});

javaInstallButton.addEventListener('click', () => {
    window.electronAPI.startJavaInstall();
});

javaRestartButton.addEventListener('click', () => {
    window.electronAPI.restartApp();
});

window.electronAPI.onJavaInstallStatus((status, progress) => {
    javaInstallMessage.textContent = status;

    if (progress !== undefined) {
        javaInstallProgressBarContainer.classList.remove('hidden');
        javaInstallProgressBar.style.width = `${progress}%`;
    }

    if (status.toLowerCase().includes('downloading')) {
        javaInstallButton.disabled = true;
        javaInstallButton.classList.add('btn-disabled');
    }

    if (status.toLowerCase().includes('installation complete')) {
        javaInstallButton.classList.add('hidden');
        javaRestartButton.classList.remove('hidden');
        javaInstallProgressBarContainer.classList.add('hidden');
    }

     if (status.toLowerCase().includes('error') || status.toLowerCase().includes('failed')) {
        javaInstallButton.disabled = false;
        javaInstallButton.classList.remove('btn-disabled');
        javaInstallProgressBarContainer.classList.add('hidden');
    }
});