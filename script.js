// Selectoare DOM Standard
const loadingScreen = document.getElementById('loading-screen');
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
const localIpWidget = document.getElementById('local-ip-widget');
const publicIpWidget = document.getElementById('public-ip-widget');
const serverVersionWidget = document.getElementById('server-version-widget');

// Butoane de acțiune
const pluginsFolderButton = document.getElementById('plugins-folder-button');
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
const languageModalSelect = document.getElementById('language-modal-select');
const serverTypeModalSelect = document.getElementById('server-type-modal-select');
const downloadModalButton = document.getElementById('download-button-modal');
const downloadModalButtonIcon = downloadModalButton.querySelector('i');
const downloadModalButtonText = document.getElementById('download-button-text');

// Modal Settings
const settingsModal = document.getElementById('settings-modal');
const settingsModalContent = document.getElementById('settings-modal-content');
const mcVersionSettingsSelect = document.getElementById('mc-version-settings');
const ramAllocationSettingsSelect = document.getElementById('ram-allocation-settings');
const javaArgumentsSettingsSelect = document.getElementById('java-arguments-settings');
const languageSettingsSelect = document.getElementById('language-settings-select');
const serverTypeSettingsSelect = document.getElementById('server-type-settings-select');
const startWithSystemCheckbox = document.getElementById('start-with-system-checkbox');
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
let isDownloadingFromServer = false;
let currentTranslations = {};
let launcherSettingsCache = {};

async function setLanguage(lang) {
    try {
        const translations = await window.electronAPI.getTranslations(lang);
        if (!translations) {
            if (lang !== 'en') return setLanguage('en');
            throw new Error('Default English translations not found.');
        }
        currentTranslations = translations;
        
        document.querySelectorAll('[data-key]').forEach(element => {
            const key = element.getAttribute('data-key');
            if (translations[key]) {
                element.textContent = translations[key];
            }
        });

        document.querySelectorAll('[data-key-placeholder]').forEach(element => {
            const key = element.getAttribute('data-key-placeholder');
            if (translations[key]) {
                element.placeholder = translations[key];
            }
        });

        const currentStatusKey = statusMessageSpan.dataset.key;
        if(currentStatusKey && translations[currentStatusKey]) {
            statusMessageSpan.textContent = translations[currentStatusKey];
        }

    } catch (error) {
        console.error("Language Error:", error);
        addToConsole(`Could not apply language: ${error.message}`, 'ERROR');
    }
}

async function populateLanguageSelects() {
    const languages = await window.electronAPI.getAvailableLanguages();
    
    const createOption = (lang) => {
        const option = document.createElement('option');
        option.value = lang.code;
        let langName = lang.name;
        if (lang.code === 'en') {
            langName += ' (Default)';
        }
        option.textContent = langName;
        return option;
    };

    languageModalSelect.innerHTML = '';
    languageSettingsSelect.innerHTML = '';

    languages.forEach(lang => {
        languageModalSelect.appendChild(createOption(lang));
        languageSettingsSelect.appendChild(createOption(lang).cloneNode(true));
    });
}


function addToConsole(message, type = 'INFO') {
    const line = document.createElement('div');
    line.classList.add('console-message');

    if (type === 'SERVER_LOG_HTML') {
        let finalHtml = message;
        const prefixRegex = /\[(\d{2}:\d{2}:\d{2}) (INFO|WARN|ERROR)\]:/g;
        finalHtml = finalHtml.replace(prefixRegex, (match, timestamp, level) => {
            let levelColor = '#82aaff';
            if (level === 'WARN') levelColor = '#ffb372';
            else if (level === 'ERROR') levelColor = '#ff757f';
            return `<span style="color: #9ca3af;">[${timestamp} <span style="color: ${levelColor}; font-weight: bold;">${level}</span>]:</span>`;
        });
        
        line.innerHTML = finalHtml;
    } else {
        let typeColor = '#82aaff';
        let typeText = type.toUpperCase();

        if (type === 'ERROR' || type === 'SERVER_ERROR') {
            typeColor = '#ff757f';
            typeText = type === 'SERVER_ERROR' ? 'STDERR' : 'ERROR';
        } else if (type === 'WARN') {
            typeColor = '#ffb372';
        } else if (type === 'SUCCESS') {
            typeColor = '#4ade80';
        } else if (type === 'CMD') {
            typeColor = '#60a5fa';
        }

        const sanitizedMessage = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        const now = new Date();
        const timestamp = [
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0')
        ].join(':');

        const timestampPrefix = `<span style="color: #9ca3af;">[${timestamp}]</span> `;
        const typePrefix = `<span style="color: ${typeColor}; font-weight: bold;">[${typeText}]</span> `;
        line.innerHTML = `${timestampPrefix}${typePrefix}${sanitizedMessage}`;
    }
    
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function getStatusColor(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes("running") || lowerText.includes("rulează") || lowerText.includes("läuft")) return '#22c55e';
    if (lowerText.includes("failed") || lowerText.includes("error") || lowerText.includes("eșuat") || lowerText.includes("fehler")) return '#ef4444';
    if (lowerText.includes("successfully") || lowerText.includes("saved") || lowerText.includes("ready") || lowerText.includes("succes") || lowerText.includes("pregătit") || lowerText.includes("bereit")) return '#4ade80';
    if (lowerText.includes("stopped") || lowerText.includes("initialized") || lowerText.includes("cancelled") || lowerText.includes("oprit") || lowerText.includes("inițializat") || lowerText.includes("anulat") || lowerText.includes("gestoppt")) return '#9ca3af';
    return '#3b82f6';
}

function setStatus(fallbackText, pulse = false, translationKey = null) {
    const key = translationKey || statusMessageSpan.dataset.key;
    let message = (key && currentTranslations[key]) ? currentTranslations[key] : fallbackText;

    statusMessageSpan.textContent = message;
    statusMessageSpan.dataset.key = key || '';
    
    const pulseTarget = statusBarContent;
    const statusColor = getStatusColor(statusMessageSpan.textContent);
    
    pulseTarget.classList.toggle('status-bar-pulse', pulse);
    statusMessageSpan.style.color = pulse ? '#3b82f6' : statusColor;
}

function showDownloadLoading() {
    downloadModalButton.disabled = true;
    mcVersionModalSelect.disabled = true;
    ramAllocationModalSelect.disabled = true;
    downloadModalButtonIcon.className = 'fas fa-spinner spinner mr-2';
    downloadModalButtonText.textContent = currentTranslations['downloadingButton'] || 'Downloading...';
}

function hideDownloadLoading() {
    downloadModalButton.disabled = false;
    mcVersionModalSelect.disabled = false;
    ramAllocationModalSelect.disabled = false;
    downloadModalButtonIcon.className = 'fas fa-download mr-2';
    downloadModalButtonText.textContent = currentTranslations['downloadButton'] || 'Download / Configure Server';
}

function updateButtonStates(isRunning) {
    localIsServerRunning = isRunning;
    const setupComplete = setupModal.classList.contains('hidden');
    
    startButton.disabled = isRunning || !setupComplete || autoStartIsActive || isDownloadingFromServer;
    
    stopButton.disabled = !isRunning;
    sendCommandButton.disabled = !isRunning;
    commandInput.disabled = !isRunning;
    pluginsFolderButton.disabled = !setupComplete;
    settingsButton.disabled = isRunning || !setupComplete;

    startButton.classList.toggle('btn-disabled', startButton.disabled);
    stopButton.classList.toggle('btn-disabled', stopButton.disabled);
    sendCommandButton.classList.toggle('btn-disabled', sendCommandButton.disabled);
    pluginsFolderButton.classList.toggle('btn-disabled', pluginsFolderButton.disabled);
    settingsButton.classList.toggle('btn-disabled', settingsButton.disabled);
    
    statusAndOpenFolderArea.classList.toggle('hidden', !setupComplete);
    statusAndOpenFolderArea.classList.toggle('flex', setupComplete);
    setupActivePlaceholderTop.classList.toggle('hidden', setupComplete);
    if (!isRunning) commandInput.value = "";

    if (currentServerConfig && currentServerConfig.version) {
        serverVersionSpan.textContent = currentServerConfig.version;
    } else {
        serverVersionSpan.textContent = 'N/A';
    }
}

async function populateMcVersionSelect(selectElement, currentVersion) {
    selectElement.disabled = true;
    if (availableMcVersionsCache.length === 0) {
        selectElement.innerHTML = `<option value="" disabled>${currentTranslations['loadingVersions'] || 'Loading versions...'}</option>`;
        try {
            availableMcVersionsCache = await window.electronAPI.getAvailablePaperMCVersions();
        } catch (error) {
            selectElement.innerHTML = `<option value="" disabled selected>${currentTranslations['errorLoadingVersions'] || 'Error loading versions'}</option>`;
            return;
        }
    }

    selectElement.innerHTML = '';
    if (availableMcVersionsCache.length > 0) {
        availableMcVersionsCache.forEach((version, index) => {
            const option = document.createElement('option');
            option.value = version;
            option.textContent = version + (index === 0 ? ` (${currentTranslations['latestVersion'] || 'Latest'})` : '');
            selectElement.appendChild(option);
        });
        selectElement.value = (currentVersion && availableMcVersionsCache.includes(currentVersion)) ? currentVersion : availableMcVersionsCache[0];
    } else {
        selectElement.innerHTML = `<option value="" disabled selected>${currentTranslations['noVersionsFound'] || 'No versions found'}</option>`;
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
        setStatus("Launcher Error!", false, 'error');
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
        hideModal(setupModal, setupModalContent, async () => {
            if (!localIsServerRunning && !autoStartIsActive) {
                setStatus(currentTranslations['serverReady'] || "Server ready.", false, 'serverReady');
            }
            updateButtonStates(localIsServerRunning);
            await fetchAndDisplayIPs();
        });
    }
}

async function populateServerProperties() {
    serverPropertiesContainer.innerHTML = `<p class="text-gray-400 text-center" data-key="serverPropsLoading">${currentTranslations['serverPropsLoading'] || 'Loading properties...'}</p>`;
    const properties = await window.electronAPI.getServerProperties();
    serverPropertiesContainer.innerHTML = '';

    if (!properties || Object.keys(properties).length === 0) {
        serverPropertiesContainer.innerHTML = `<p class="text-gray-400 text-center" data-key="serverPropsUnavailable">${currentTranslations['serverPropsUnavailable'] || 'Could not load server.properties. Run the server once to generate it.'}</p>`;
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

pluginsFolderButton.addEventListener('click', () => { if(!pluginsFolderButton.disabled) window.electronAPI.openPluginsFolder(); });

settingsButton.addEventListener('click', async () => {
    if (settingsButton.disabled) return;
    launcherSettingsCache = await window.electronAPI.getSettings();
    startWithSystemCheckbox.checked = launcherSettingsCache.openAtLogin;
    autoStartServerCheckbox.checked = launcherSettingsCache.autoStartServer;
    
    const delay = launcherSettingsCache.autoStartDelay || 5;
    autoStartDelaySlider.value = delay;
    autoStartDelayValue.textContent = `${delay}s`;
    
    if (launcherSettingsCache.autoStartServer) {
        autoStartDelayContainer.classList.add('visible');
    } else {
        autoStartDelayContainer.classList.remove('visible');
    }
    
    languageSettingsSelect.value = launcherSettingsCache.language || 'en';

    const serverConfig = await window.electronAPI.getServerConfig();
    await populateMcVersionSelect(mcVersionSettingsSelect, serverConfig.version);
    ramAllocationSettingsSelect.value = serverConfig.ram || 'auto';
    javaArgumentsSettingsSelect.value = serverConfig.javaArgs || 'Default';
    await populateServerProperties();
    showModal(settingsModal, settingsModalContent);
});

closeSettingsButton.addEventListener('click', () => hideModal(settingsModal, settingsModalContent));

saveSettingsButton.addEventListener('click', () => {
    launcherSettingsCache.openAtLogin = startWithSystemCheckbox.checked;
    launcherSettingsCache.autoStartServer = autoStartServerCheckbox.checked;
    launcherSettingsCache.autoStartDelay = parseInt(autoStartDelaySlider.value, 10);
    launcherSettingsCache.language = languageSettingsSelect.value;
    
    window.electronAPI.setSettings(launcherSettingsCache);
    
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
        autoStartIsActive = false;
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        setStatus(currentTranslations['autoStartCancelled'] || "Auto-start cancelled.", false, 'autoStartCancelled');
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
    if (autoStartServerCheckbox.checked) {
        autoStartDelayContainer.classList.add('visible');
    } else {
        autoStartDelayContainer.classList.remove('visible');
    }
});

autoStartDelaySlider.addEventListener('input', () => {
    autoStartDelayValue.textContent = `${autoStartDelaySlider.value}s`;
});

commandInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') sendCommandButton.click(); });
minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

languageModalSelect.addEventListener('change', (event) => {
    const newLang = event.target.value;
    languageSettingsSelect.value = newLang;
    setLanguage(newLang);
    launcherSettingsCache.language = newLang;
    window.electronAPI.setSettings({ language: newLang });
});

languageSettingsSelect.addEventListener('change', (event) => {
    const newLang = event.target.value;
    languageModalSelect.value = newLang;
    setLanguage(newLang);
});


window.electronAPI.onWindowMaximized((isMaximized) => {
    maximizeBtnIcon.className = isMaximized ? 'far fa-window-restore' : 'far fa-square';
    maximizeBtn.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
});

window.electronAPI.onUpdateConsole((message, type) => addToConsole(message, type));

window.electronAPI.onUpdateStatus(async (fallbackMessage, pulse, translationKey) => {
    setStatus(fallbackMessage, pulse, translationKey);
    const lowerMessage = (currentTranslations[translationKey] || fallbackMessage).toLowerCase();

    if (lowerMessage.includes('downloading') || lowerMessage.includes('se descarcă')) {
        isDownloadingFromServer = true;
        updateButtonStates(localIsServerRunning);
    }

    if (lowerMessage.includes('starting') || lowerMessage.includes('se pornește')) {
        settingsButton.disabled = true;
        settingsButton.classList.add('btn-disabled');
    }

    if ((lowerMessage.includes('failed') || lowerMessage.includes('error')) && !setupModal.classList.contains('hidden')) {
        hideDownloadLoading();
    }
});

window.electronAPI.onSetupFinished(async () => {
    isDownloadingFromServer = false;
    hideDownloadLoading();
    await refreshUISetupState();
});

window.electronAPI.onServerStateChange(async (isRunning) => {
    if (isRunning) {
        autoStartIsActive = false;
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        setStatus(currentTranslations['serverRunning'] || 'Server is running.', false, 'serverRunning');
        await fetchAndDisplayIPs(true);
        
        localIpWidget.classList.add('animate-green-attention');
        publicIpWidget.classList.add('animate-green-attention');
        serverVersionWidget.classList.add('animate-green-attention');

        const removeAnimation = (widget) => {
            widget.classList.remove('animate-green-attention');
        };
        
        localIpWidget.addEventListener('animationend', () => removeAnimation(localIpWidget), { once: true });
        publicIpWidget.addEventListener('animationend', () => removeAnimation(publicIpWidget), { once: true });
        serverVersionWidget.addEventListener('animationend', () => removeAnimation(serverVersionWidget), { once: true });

        memoryUsageSpan.textContent = `— / ${allocatedRamCache !== '-' ? allocatedRamCache : '...'} GB`;
    } else {
        if (!autoStartIsActive) {
            setStatus(currentTranslations['serverStopped'] || "Server stopped.", false, 'serverStopped');
        }
        await fetchAndDisplayIPs(false);
        memoryUsageSpan.textContent = '0 / 0 GB';
        memoryUsageSpan.style.color = '';
        serverTpsSpan.textContent = '0 / 20.0';
        serverTpsSpan.style.color = '';
        allocatedRamCache = '-'; 
    }
    updateButtonStates(isRunning);
    if (!isRunning) {
        await refreshUISetupState();
    }
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
        setStatus('Server failed to stay running.', false, 'serverStartFailed');
    }
});

async function fetchAndDisplayIPs(showPort = false) {
    let port = '';
    if (showPort) {
        try {
            const properties = await window.electronAPI.getServerProperties();
            if (properties && properties['server-port']) {
                port = `:${properties['server-port']}`;
            }
        } catch (error) {
            console.warn("Could not fetch server port for display.", error);
        }
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
    try {
        const iconPath = await window.electronAPI.getIconPath();
        document.getElementById('app-icon').src = iconPath;
        const version = await window.electronAPI.getAppVersion();
        const titleText = `Server Launcher v${version}`;
        document.title = titleText;
        document.getElementById('app-title-version').textContent = titleText;
        
        await populateLanguageSelects();

        launcherSettingsCache = await window.electronAPI.getSettings();
        const savedLang = launcherSettingsCache.language || 'en';
        
        languageModalSelect.value = savedLang;
        languageSettingsSelect.value = savedLang;
        
        await setLanguage(savedLang);
        
        addToConsole("Launcher initializing...", "INFO");
        setStatus(currentTranslations['initializing'] || "Initializing...", true, 'initializing');
        
        await refreshUISetupState();
        addToConsole("Launcher initialized.", "INFO");

    } catch (error) {
        addToConsole(`Initialization failed: ${error.message}`, 'ERROR');
        setStatus('Initialization Error!', false, 'error');
    } finally {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
            window.electronAPI.appReadyToShow();
        }, 500);
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);

function startCountdown(seconds, messageKey, callback) {
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
            const message = (currentTranslations[messageKey] || "Auto-starting server") + ` in ${remaining}s...`;
            statusMessageSpan.textContent = message;
            statusMessageSpan.dataset.key = '';
            statusBarContent.classList.add('status-bar-pulse');
            statusMessageSpan.style.color = '#3b82f6';
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
    addToConsole(`Received 'start-countdown' event. Type: ${type}, Delay: ${delay}`, 'INFO');
    
    if (localIsServerRunning && type === 'initial') {
        addToConsole('Server is already running, cancelling initial countdown.', 'WARN');
        return;
    }

    autoStartIsActive = true;
    updateButtonStates(localIsServerRunning);

    const messageKey = type === 'initial' ? 'autoStartingServer' : 'autoRestartingServer';
    startCountdown(delay, messageKey, () => {
        if (autoStartIsActive && !localIsServerRunning) {
            addToConsole('Countdown finished, starting server.', 'INFO');
            window.electronAPI.startServer();
        } else {
            addToConsole('Countdown finished, but auto-start was cancelled or server is already running.', 'WARN');
            autoStartIsActive = false;
            updateButtonStates(localIsServerRunning);
        }
    });
});

window.electronAPI.onJavaInstallRequired(() => {
    javaInstallMessage.textContent = currentTranslations['javaModalDescription'] || 'Java is not detected on your system. It is required to run the server.';
    javaInstallButton.classList.remove('hidden');
    javaInstallButton.disabled = false;
    javaInstallButton.classList.remove('btn-disabled');
    javaRestartButton.classList.add('hidden');
    javaInstallProgressBarContainer.classList.add('hidden');
    
    const existingSpinner = javaInstallModalContent.querySelector('.fa-spinner');
    if (existingSpinner) {
        existingSpinner.remove();
    }

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
    const lowerStatus = status.toLowerCase();

    javaInstallButton.classList.add('hidden');
    javaRestartButton.classList.add('hidden');
    javaInstallProgressBarContainer.classList.add('hidden');
    
    const existingSpinner = javaInstallModalContent.querySelector('.fa-spinner');
    if (existingSpinner) {
        existingSpinner.remove();
    }

    if (lowerStatus.includes('downloading')) {
        javaInstallProgressBarContainer.classList.remove('hidden');
        javaInstallProgressBar.style.width = `${progress || 0}%`;
    } else if (lowerStatus.includes('installer has been launched')) {
        const spinner = document.createElement('i');
        spinner.className = 'fas fa-spinner fa-spin text-2xl text-blue-400 mt-4';
        javaInstallModalContent.appendChild(spinner);
    } else if (lowerStatus.includes('error') || lowerStatus.includes('failed') || lowerStatus.includes('timed out')) {
        javaInstallButton.classList.remove('hidden');
        javaInstallButton.disabled = false;
        javaInstallButton.classList.remove('btn-disabled');
        javaRestartButton.classList.remove('hidden');
    }
});