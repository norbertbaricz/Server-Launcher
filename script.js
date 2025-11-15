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

const pluginsFolderButton = document.getElementById('plugins-folder-button');
const pluginsFolderIcon = document.getElementById('plugins-folder-icon');
const settingsButton = document.getElementById('settings-button');

const statusAndOpenFolderArea = document.getElementById('status-and-open-folder-area');
const statusBarContent = document.getElementById('status-bar-content');
const setupActivePlaceholderTop = document.getElementById('setup-active-placeholder-top');

const setupPage = document.getElementById('setup-page');
const mcVersionModalSelect = document.getElementById('mc-version-modal');
const ramAllocationModalSelect = document.getElementById('ram-allocation-modal');
const languageModalSelect = document.getElementById('language-modal-select');
const downloadModalButton = document.getElementById('download-button-modal');
const downloadModalButtonIcon = downloadModalButton.querySelector('i');
const downloadModalButtonText = document.getElementById('download-button-text');
const serverTypeModalSelect = document.getElementById('server-type-modal');

const mainContentArea = document.getElementById('main-content-area');
const dashboardView = document.getElementById('dashboard-view');
const settingsPage = document.getElementById('settings-page');
const mcVersionSettingsSelect = document.getElementById('mc-version-settings');
const ramAllocationSettingsSelect = document.getElementById('ram-allocation-settings');
const javaArgumentsSettingsSelect = document.getElementById('java-arguments-settings');
const languageSettingsSelect = document.getElementById('language-settings-select');
const themeSelect = document.getElementById('theme-select');
const desktopNotificationsCheckbox = document.getElementById('notifications-checkbox');
const serverTypeSettingsSelect = document.getElementById('server-type-settings');
const startWithSystemCheckbox = document.getElementById('start-with-system-checkbox');
const saveSettingsButton = document.getElementById('save-settings-button');
const closeSettingsButton = document.getElementById('close-settings-button');
const serverPropertiesContainer = document.getElementById('server-properties-container');
const autoStartServerCheckbox = document.getElementById('auto-start-server-checkbox');
const autoStartDelayContainer = document.getElementById('auto-start-delay-container');
const autoStartDelaySlider = document.getElementById('auto-start-delay-slider');
const autoStartDelayValue = document.getElementById('auto-start-delay-value');
const serverPathDisplay = document.getElementById('server-path-display');
const chooseServerPathButton = document.getElementById('choose-server-path-button');
const lockServerPathButton = document.getElementById('lock-server-path-button');
const lockServerPathIcon = document.getElementById('lock-server-path-icon');
const lockServerPathText = document.getElementById('lock-server-path-text');

const javaInstallModal = document.getElementById('java-install-modal');
const javaInstallModalContent = document.getElementById('java-install-modal-content');
const javaInstallMessage = document.getElementById('java-install-message');
const javaInstallButton = document.getElementById('java-install-button');
const javaRestartButton = document.getElementById('java-restart-button');
const javaInstallProgressBarContainer = document.getElementById('java-install-progress-bar-container');
const javaInstallProgressBar = document.getElementById('java-install-progress-bar');

const pluginsPage = document.getElementById('plugins-page');
const pluginsModalTitleText = document.getElementById('plugins-modal-title-text');
const pluginsModalIcon = document.getElementById('plugins-modal-icon');
const pluginsSectionTitle = document.getElementById('plugins-section-title');
const pluginsSectionIcon = document.getElementById('plugins-section-icon');
const closePluginsPageButton = document.getElementById('close-plugins-page-button');
const pluginsRefreshButton = document.getElementById('plugins-refresh-button');
const pluginsSaveApplyButton = document.getElementById('plugins-save-apply-button');
const pluginsList = document.getElementById('plugins-list');
const uploadPluginButton = document.getElementById('upload-plugin-button');
const openPluginsFolderButton = document.getElementById('open-plugins-folder-button');

const minimizeBtn = document.getElementById('minimize-btn');
const maximizeBtn = document.getElementById('maximize-btn');
const closeBtn = document.getElementById('close-btn');
const maximizeBtnIcon = maximizeBtn.querySelector('i');

let localIsServerRunning = false;
let currentServerConfig = {};
let isModalAnimating = false;
let availableMcVersionsCache = {};
let allocatedRamCache = '-';
let autoStartIsActive = false; 
let countdownInterval = null;
let isDownloadingFromServer = false;
let currentTranslations = {};
let launcherSettingsCache = {};
let isSettingsViewOpen = false;
let isPluginsViewOpen = false;
let isSetupViewOpen = false;
let setupRequired = false;
let activeViewKey = dashboardView ? 'dashboard' : null;
let isStarting = false;
let isStopping = false;

const viewMap = {
    dashboard: dashboardView,
    setup: setupPage,
    settings: settingsPage,
    plugins: pluginsPage
};

const ramAllocationModalContainer = ramAllocationModalSelect?.closest('div');
const ramAllocationSettingsContainer = ramAllocationSettingsSelect?.closest('div');
const javaArgumentsSettingsContainer = javaArgumentsSettingsSelect?.closest('div');

function getAddonLabel(type) {
    if (type === 'fabric') return currentTranslations['modsLabel'] || 'Mods';
    if (type === 'bedrock') return currentTranslations['addonsLabel'] || 'Add-ons';
    return currentTranslations['pluginsButton'] || 'Plugins';
}

function getAddonIcon(type) {
    if (type === 'fabric') return 'fa-flask';
    if (type === 'bedrock') return 'fa-cubes';
    return 'fa-puzzle-piece';
}

function getServerTypeSuffix(type) {
    if (type === 'fabric') return ' (Modded)';
    if (type === 'bedrock') return ' (Bedrock)';
    return '';
}

function applyServerTypeUiState(type) {
    const isBedrock = type === 'bedrock';
    const toggleHidden = (element, hidden) => {
        if (!element) return;
        element.classList.toggle('hidden', hidden);
    };
    toggleHidden(ramAllocationModalContainer, isBedrock);
    toggleHidden(ramAllocationSettingsContainer, isBedrock);
    toggleHidden(javaArgumentsSettingsContainer, isBedrock);

    if (isBedrock) {
        if (ramAllocationModalSelect) ramAllocationModalSelect.value = 'auto';
        if (ramAllocationSettingsSelect) ramAllocationSettingsSelect.value = 'auto';
        if (javaArgumentsSettingsSelect) javaArgumentsSettingsSelect.value = 'Default';
    }
}

function updatePluginsButtonAppearance(serverType) {
    const type = serverType || 'papermc';
    const label = getAddonLabel(type);
    const iconClass = getAddonIcon(type);
    const isFabric = type === 'fabric';
    const isBedrock = type === 'bedrock';
    if (pluginsFolderIcon) {
        pluginsFolderIcon.className = `fas ${iconClass}`;
    }
    if (pluginsFolderButton) {
        pluginsFolderButton.setAttribute('aria-label', label);
        if (!pluginsFolderButton.classList.contains('no-tooltip')) {
            pluginsFolderButton.title = label;
        } else {
            pluginsFolderButton.removeAttribute('title');
        }
        const textSpan = pluginsFolderButton.querySelector('span[data-key="pluginsButton"]');
        if (textSpan) {
            textSpan.textContent = label;
        }
    }
    const propsLabel = currentTranslations['serverPropsHeader'] || 'Server Properties';
    if (pluginsModalIcon) {
        pluginsModalIcon.className = `fas ${iconClass} accent-text text-xl`;
    }
    if (pluginsModalTitleText) {
        pluginsModalTitleText.textContent = `${label} & ${propsLabel}`;
    }
    if (pluginsSectionIcon) {
        pluginsSectionIcon.className = `fas ${iconClass} accent-text`;
    }
    if (pluginsSectionTitle) {
        pluginsSectionTitle.textContent = label;
    }
    if (uploadPluginButton) {
        if (isBedrock) {
            uploadPluginButton.disabled = true;
            uploadPluginButton.classList.add('btn-disabled');
            uploadPluginButton.innerHTML = `<i class="fas fa-ban mr-1"></i>${currentTranslations['uploadUnavailable'] || 'Uploads Unavailable'}`;
        } else {
            uploadPluginButton.disabled = false;
            uploadPluginButton.classList.remove('btn-disabled');
            const uploadLabel = isFabric ? (currentTranslations['uploadModsButton'] || 'Upload Mods') : (currentTranslations['uploadButton'] || 'Upload');
            uploadPluginButton.innerHTML = `<i class="fas fa-upload mr-1"></i>${uploadLabel}`;
            uploadPluginButton.title = uploadLabel;
        }
    }
    if (openPluginsFolderButton) {
        const openFolderLabel = isFabric
            ? (currentTranslations['openModsFolderButton'] || 'Open Mods Folder')
            : (isBedrock ? (currentTranslations['openBedrockFolderButton'] || 'Open Server Folder') : (currentTranslations['openFolderButton'] || 'Open Folder'));
        openPluginsFolderButton.innerHTML = `<i class="fas fa-folder-open mr-1"></i>${openFolderLabel}`;
        openPluginsFolderButton.title = openFolderLabel;
    }
}

function populateServerTypeSelect(selectEl, currentType) {
    if (!selectEl) return;
    const options = [
        { value: 'papermc', label: currentTranslations['serverTypeJavaDefault'] || 'Java - PaperMC (Vanilla)' },
        { value: 'fabric', label: currentTranslations['serverTypeJavaModded'] || 'Java - Fabric (Modded)' },
        { value: 'bedrock', label: currentTranslations['serverTypeBedrock'] || 'Bedrock - Dedicated Server' }
    ];
    selectEl.innerHTML = '';
    for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        selectEl.appendChild(o);
    }
    selectEl.value = currentType && ['papermc','fabric','bedrock'].includes(currentType) ? currentType : 'papermc';
}

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

        document.querySelectorAll('[data-key-aria-label]').forEach(element => {
            const key = element.getAttribute('data-key-aria-label');
            if (translations[key]) {
                element.setAttribute('aria-label', translations[key]);
                if (!element.classList.contains('no-tooltip')) {
                    element.title = translations[key];
                } else {
                    element.removeAttribute('title');
                }
            }
        });

        const currentStatusKey = statusMessageSpan.dataset.key;
        if(currentStatusKey && translations[currentStatusKey]) {
            statusMessageSpan.textContent = translations[currentStatusKey];
        }

        updatePluginsButtonAppearance(currentServerConfig?.serverType);

    } catch (error) {
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
    const MAX_CONSOLE_LINES = 1000;
    while (consoleOutput.childElementCount > MAX_CONSOLE_LINES) {
        consoleOutput.removeChild(consoleOutput.firstElementChild);
    }
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function getStatusColor(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes("running") || lowerText.includes("rulează") || lowerText.includes("läuft")) return '#22c55e';
    if (lowerText.includes("failed") || lowerText.includes("error") || lowerText.includes("eșuat") || lowerText.includes("fehler")) return '#ef4444';
    if (lowerText.includes("successfully") || lowerText.includes("saved") || lowerText.includes("ready") || lowerText.includes("succes") || lowerText.includes("pregătit") || lowerText.includes("bereit")) return '#4ade80';
    if (lowerText.includes("stopped") || lowerText.includes("initialized") || lowerText.includes("cancelled") || lowerText.includes("oprit") || lowerText.includes("inițializat") || lowerText.includes("anulat") || lowerText.includes("gestoppt")) return '#9ca3af';
    return 'var(--color-primary)';
}

function setStatus(fallbackText, pulse = false, translationKey = null) {
    const key = translationKey || statusMessageSpan.dataset.key;
    let message = (key && currentTranslations[key]) ? currentTranslations[key] : fallbackText;

    if (key === 'downloading' && typeof fallbackText === 'string') {
        const m = fallbackText.match(/\(([^)]+)\)/);
        if (m && m[1]) {
            const base = currentTranslations['downloading'] || 'Downloading';
            message = `${base} (${m[1]})`;
        }
    }

    statusMessageSpan.textContent = message;
    statusMessageSpan.dataset.key = key || '';
    
    const pulseTarget = statusBarContent;
    const statusColor = getStatusColor(statusMessageSpan.textContent);
    
    pulseTarget.classList.toggle('status-bar-pulse', pulse);
    statusMessageSpan.style.color = pulse ? 'var(--color-primary)' : statusColor;
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
    updatePluginsButtonAppearance(currentServerConfig?.serverType);
    applyServerTypeUiState(currentServerConfig?.serverType || 'papermc');
    const setupComplete = !setupRequired;
    
    startButton.style.display = (isRunning || !setupComplete || autoStartIsActive || isDownloadingFromServer) ? 'none' : 'inline-flex';
    startButton.disabled = isRunning || !setupComplete || autoStartIsActive || isDownloadingFromServer || isStarting;
    
    stopButton.style.display = (!isRunning) ? 'none' : 'inline-flex';
    stopButton.disabled = !isRunning || isStopping;
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
        const suffix = getServerTypeSuffix(currentServerConfig.serverType);
        serverVersionSpan.textContent = currentServerConfig.version + suffix;
    } else {
        serverVersionSpan.textContent = 'N/A';
    }
}

async function populateMcVersionSelect(selectElement, currentVersion, serverType) {
    selectElement.disabled = true;
    if (!availableMcVersionsCache[serverType] || availableMcVersionsCache[serverType].length === 0) {
        selectElement.innerHTML = `<option value="" disabled>${currentTranslations['loadingVersions'] || 'Loading versions...'}</option>`;
        try {
            availableMcVersionsCache[serverType] = await window.electronAPI.getAvailableVersions(serverType);
        } catch (error) {
            selectElement.innerHTML = `<option value="" disabled selected>${currentTranslations['errorLoadingVersions'] || 'Error loading versions'}</option>`;
            return;
        }
    }

    const versions = availableMcVersionsCache[serverType];
    selectElement.innerHTML = '';
    if (versions.length > 0) {
        versions.forEach((version, index) => {
            const option = document.createElement('option');
            option.value = version;
            option.textContent = version + (index === 0 ? ` (${currentTranslations['latestVersion'] || 'Latest'})` : '');
            selectElement.appendChild(option);
        });
        selectElement.value = (currentVersion && versions.includes(currentVersion)) ? currentVersion : versions[0];
    } else {
        selectElement.innerHTML = `<option value="" disabled selected>${currentTranslations['noVersionsFound'] || 'No versions found'}</option>`;
    }
    selectElement.disabled = false;
}

function showModal(modal, content) {
    if (isModalAnimating || !modal.classList.contains('hidden')) return;
    isModalAnimating = true;
    
    // Force layout recalculation for Linux
    modal.style.display = 'flex';
    void modal.offsetHeight;
    
    modal.classList.remove('hidden');
    modal.style.animation = 'fadeInModalBg 0.18s ease-out forwards';
    content.style.animation = 'fadeInModalContent 0.18s ease-out forwards';
    content.style.transform = 'translateZ(0)'; // Force GPU acceleration
    
    content.addEventListener('animationend', () => {
        isModalAnimating = false;
        content.style.transform = '';
    }, { once: true });
}

function hideModal(modal, content, callback) {
    if (isModalAnimating || modal.classList.contains('hidden')) {
        if (callback) callback();
        return;
    }
    isModalAnimating = true;
    content.style.transform = 'translateZ(0)'; // Force GPU acceleration
    modal.style.animation = 'fadeOutModalBg 0.18s ease-in forwards';
    content.style.animation = 'fadeOutModalContent 0.18s ease-in forwards';
    content.addEventListener('animationend', () => {
        modal.classList.add('hidden');
        modal.style.display = '';
        content.style.transform = '';
        isModalAnimating = false;
        if (callback) callback();
    }, { once: true });
}

function setActiveView(target, callback) {
    if (!viewMap[target]) {
        if (typeof callback === 'function') callback();
        return;
    }

    if (activeViewKey === target) {
        if (typeof callback === 'function') callback();
        return;
    }

    const incoming = viewMap[target];
    const outgoing = activeViewKey ? viewMap[activeViewKey] : null;

    if (incoming) {
        incoming.classList.add('active-view');
        incoming.setAttribute('aria-hidden', 'false');
        incoming.scrollTop = 0;
    }

    if (outgoing && outgoing !== incoming) {
        outgoing.classList.remove('active-view');
        outgoing.setAttribute('aria-hidden', 'true');
    }

    activeViewKey = target;
    isSettingsViewOpen = target === 'settings';
    isPluginsViewOpen = target === 'plugins';
    isSetupViewOpen = target === 'setup';

    if (mainContentArea) {
        mainContentArea.scrollTop = 0;
        mainContentArea.scrollLeft = 0;
    }

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof callback === 'function') {
        if (prefersReducedMotion) {
            callback();
        } else {
            setTimeout(callback, 300);
        }
    }
}

function openSettingsView(callback) {
    if (!settingsPage) return;
    if (setupRequired) {
        if (typeof callback === 'function') callback();
        return;
    }
    if (isSettingsViewOpen) {
        if (typeof callback === 'function') callback();
        return;
    }
    if (isSetupViewOpen) {
        closeSetupView(() => openSettingsView(callback));
        return;
    }
    if (isPluginsViewOpen) {
        closePluginsView(() => openSettingsView(callback));
        return;
    }
    setActiveView('settings', callback);
}

function closeSettingsView(callback) {
    if (!settingsPage) {
        if (typeof callback === 'function') callback();
        return;
    }
    if (!isSettingsViewOpen) {
        if (typeof callback === 'function') callback();
        return;
    }
    setActiveView('dashboard', callback);
}

function closePluginsView(callback) {
    if (!pluginsPage) {
        if (typeof callback === 'function') callback();
        return;
    }
    if (!isPluginsViewOpen) {
        if (typeof callback === 'function') callback();
        return;
    }
    setActiveView('dashboard', callback);
}

function openSetupView(callback) {
    if (!setupPage) return;
    if (isSetupViewOpen) {
        if (typeof callback === 'function') callback();
        return;
    }
    if (isSettingsViewOpen) {
        closeSettingsView(() => openSetupView(callback));
        return;
    }
    if (isPluginsViewOpen) {
        closePluginsView(() => openSetupView(callback));
        return;
    }
    setActiveView('setup', callback);
}

function closeSetupView(callback) {
    if (!setupPage) {
        if (typeof callback === 'function') callback();
        return;
    }
    if (!isSetupViewOpen) {
        if (typeof callback === 'function') callback();
        return;
    }
    setActiveView('dashboard', callback);
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
    setupRequired = !!needsSetup;
    updatePluginsButtonAppearance(currentServerConfig?.serverType);
    applyServerTypeUiState(currentServerConfig?.serverType || 'papermc');
    if (needsSetup) {
        if (isSettingsViewOpen) closeSettingsView();
        if (isPluginsViewOpen) closePluginsView();
        openSetupView();
        const serverType = currentServerConfig.serverType || 'papermc';
        populateServerTypeSelect(serverTypeModalSelect, serverType);
        applyServerTypeUiState(serverType);
        serverTypeModalSelect.onchange = async () => {
            await populateMcVersionSelect(mcVersionModalSelect, null, serverTypeModalSelect.value);
            applyServerTypeUiState(serverTypeModalSelect.value);
            updatePluginsButtonAppearance(serverTypeModalSelect.value);
        };
        await populateMcVersionSelect(mcVersionModalSelect, currentServerConfig.version, serverType);
        ramAllocationModalSelect.value = currentServerConfig.ram || 'auto';
        updateButtonStates(localIsServerRunning);
    } else {
        if (isSettingsViewOpen) closeSettingsView();
        if (isPluginsViewOpen) closePluginsView();

        const afterClose = async () => {
            if (!localIsServerRunning && !autoStartIsActive) {
                setStatus(currentTranslations['serverReady'] || "Server ready.", false, 'serverReady');
            }
            updateButtonStates(localIsServerRunning);
            await fetchAndDisplayIPs();
            updatePluginsButtonAppearance(currentServerConfig?.serverType);
        };

        closeSetupView(async () => {
            await afterClose();
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
    const serverType = serverTypeModalSelect?.value || 'papermc';
    if (!version) {
        addToConsole("No Minecraft version selected.", "ERROR");
        return;
    }
    showDownloadLoading();
    window.electronAPI.configureServer({ serverType, mcVersion: version, ramAllocation: ram, javaArgs: 'Default' });
});

pluginsFolderButton.addEventListener('click', async () => {
    if (pluginsFolderButton.disabled) return;
    await openPluginsView();
});

settingsButton.addEventListener('click', async () => {
    if (settingsButton.disabled) return;
    launcherSettingsCache = await window.electronAPI.getSettings();
    startWithSystemCheckbox.checked = launcherSettingsCache.openAtLogin;
    autoStartServerCheckbox.checked = launcherSettingsCache.autoStartServer;
    desktopNotificationsCheckbox.checked = (launcherSettingsCache.notificationsEnabled !== false);
    
    const delay = launcherSettingsCache.autoStartDelay || 5;
    autoStartDelaySlider.value = delay;
    autoStartDelayValue.textContent = `${delay}s`;
    
    if (launcherSettingsCache.autoStartServer) {
        autoStartDelayContainer.classList.add('visible');
    } else {
        autoStartDelayContainer.classList.remove('visible');
    }
    
    languageSettingsSelect.value = launcherSettingsCache.language || 'en';
    const savedTheme = launcherSettingsCache.theme || 'skypixel';
    applyThemeClass(savedTheme);
    themeSelect.value = savedTheme === 'default' ? 'skypixel' : savedTheme;

    const serverConfig = await window.electronAPI.getServerConfig();
    const currentType = serverConfig.serverType || 'papermc';
    // Load server path info
    try {
        const info = await window.electronAPI.getServerPathInfo();
        if (serverPathDisplay) serverPathDisplay.value = info.path || '';
        updateServerPathLockState(info.locked);
    } catch (e) { addToConsole(`Failed to load server path info: ${e.message}`, 'ERROR'); }
    populateServerTypeSelect(serverTypeSettingsSelect, currentType);
    serverTypeSettingsSelect.onchange = async () => {
        const selectedType = serverTypeSettingsSelect.value;
        await populateMcVersionSelect(mcVersionSettingsSelect, null, selectedType);
        applyServerTypeUiState(selectedType);
        updatePluginsButtonAppearance(selectedType);
    };
    await populateMcVersionSelect(mcVersionSettingsSelect, serverConfig.version, currentType);
    applyServerTypeUiState(currentType);
    ramAllocationSettingsSelect.value = serverConfig.ram || 'auto';
    javaArgumentsSettingsSelect.value = serverConfig.javaArgs || 'Default';
    updatePluginsButtonAppearance(serverConfig.serverType);
    openSettingsView();
});

closeSettingsButton.addEventListener('click', () => closeSettingsView());

saveSettingsButton.addEventListener('click', () => {
    launcherSettingsCache.openAtLogin = startWithSystemCheckbox.checked;
    launcherSettingsCache.autoStartServer = autoStartServerCheckbox.checked;
    launcherSettingsCache.autoStartDelay = parseInt(autoStartDelaySlider.value, 10);
    launcherSettingsCache.language = languageSettingsSelect.value;
    launcherSettingsCache.notificationsEnabled = desktopNotificationsCheckbox.checked;
    
    window.electronAPI.setSettings(launcherSettingsCache);
    
    const newProperties = {};
    serverPropertiesContainer.querySelectorAll('input, select').forEach(input => {
        newProperties[input.dataset.key] = input.value;
    });
    if (Object.keys(newProperties).length > 0) window.electronAPI.setServerProperties(newProperties);
    
    const newServerType = serverTypeSettingsSelect?.value || 'papermc';
    const newMcVersion = mcVersionSettingsSelect.value;
    const newRam = ramAllocationSettingsSelect.value;
    const newJavaArgs = javaArgumentsSettingsSelect.value;
    window.electronAPI.configureServer({ serverType: newServerType, mcVersion: newMcVersion, ramAllocation: newRam, javaArgs: newJavaArgs });
    
    addToConsole("Settings saved and applied.", "SUCCESS");
    closeSettingsView();
});

function updateServerPathLockState(locked) {
    if (!lockServerPathButton) return;
    lockServerPathButton.dataset.locked = locked ? 'true' : 'false';
    if (locked) {
        lockServerPathIcon.className = 'fas fa-lock';
        lockServerPathText.textContent = currentTranslations['unlockPathButton'] || 'Unlock';
        chooseServerPathButton.disabled = true;
        chooseServerPathButton.classList.add('btn-disabled');
        lockServerPathButton.title = currentTranslations['unlockPathButton'] || 'Unlock';
    } else {
        lockServerPathIcon.className = 'fas fa-lock-open';
        lockServerPathText.textContent = currentTranslations['lockPathButton'] || 'Lock';
        chooseServerPathButton.disabled = false;
        chooseServerPathButton.classList.remove('btn-disabled');
        lockServerPathButton.title = currentTranslations['lockPathButton'] || 'Lock';
    }
}

chooseServerPathButton?.addEventListener('click', async () => {
    if (chooseServerPathButton.disabled) return;
    const res = await window.electronAPI.selectServerLocation();
    if (!res.ok) {
        if (!res.cancelled) addToConsole(`Could not change path: ${res.error}`, 'ERROR');
        return;
    }
    serverPathDisplay.value = res.path;
    addToConsole(`Server path changed to ${res.path}`, 'SUCCESS');
});

lockServerPathButton?.addEventListener('click', async () => {
    const currentlyLocked = lockServerPathButton.dataset.locked === 'true';
    const newLocked = !currentlyLocked;
    window.electronAPI.setServerPathLock(newLocked);
    updateServerPathLockState(newLocked);
    addToConsole(newLocked ? 'Server path locked.' : 'Server path unlocked.', 'INFO');
});


startButton.addEventListener('click', () => { 
    isStarting = true;
    startButton.disabled = true;
    startButton.classList.add('btn-disabled');
    window.electronAPI.startServer(); 
});

stopButton.addEventListener('click', () => { 
    isStopping = true;
    stopButton.disabled = true;
    stopButton.classList.add('btn-disabled');
    autoStartIsActive = false;
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    setStatus(currentTranslations['autoStartCancelled'] || "Auto-start cancelled.", false, 'autoStartCancelled');
    updateButtonStates(localIsServerRunning);
    window.electronAPI.stopServer(); 
});

sendCommandButton.addEventListener('click', () => {
    const raw = commandInput.value.trim();
    if (raw && localIsServerRunning) {
        const sanitized = raw.startsWith('/') ? raw.slice(1) : raw;
        addToConsole(`> ${sanitized}`, 'CMD');
        window.electronAPI.sendCommand(sanitized);
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
    launcherSettingsCache.language = newLang;
    window.electronAPI.setSettings({ language: newLang });
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

    if ((lowerMessage.includes('failed') || lowerMessage.includes('error')) && isSetupViewOpen) {
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
        isStarting = false;
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

        const allocatedNumeric = !Number.isNaN(parseFloat(allocatedRamCache)) && parseFloat(allocatedRamCache) > 0;
        memoryUsageSpan.textContent = allocatedNumeric
            ? `— / ${allocatedRamCache} GB`
            : '— GB';
        memoryUsageSpan.style.color = '';
    } else {
        isStopping = false;
        if (!autoStartIsActive) {
            setStatus(currentTranslations['serverStopped'] || "Server stopped.", false, 'serverStopped');
        }
        await fetchAndDisplayIPs(false);
        memoryUsageSpan.textContent = '0 GB';
        memoryUsageSpan.style.color = '';
        serverTpsSpan.textContent = '0 ms';
        serverTpsSpan.style.color = '';
        allocatedRamCache = '0'; 
    }
    updateButtonStates(isRunning);
    if (!isRunning) {
        await refreshUISetupState();
    }
});

window.electronAPI.onUpdatePerformanceStats(({ memoryGB, allocatedRamGB, tps, latencyMs, mspt, cmdLatencyMs }) => {
    if (allocatedRamGB) {
        allocatedRamCache = allocatedRamGB;
    }
    
    if (typeof memoryGB !== 'undefined') {
        const memUsage = parseFloat(memoryGB);
        if (!Number.isNaN(memUsage)) {
            const finalMemUsage = Math.max(0, memUsage);
            const allocatedRam = parseFloat(allocatedRamCache);
            if (!Number.isNaN(allocatedRam) && allocatedRam > 0) {
                memoryUsageSpan.textContent = `${finalMemUsage.toFixed(1)} / ${allocatedRamCache} GB`;

                const usagePercent = (finalMemUsage / allocatedRam) * 100;

                if (usagePercent >= 90) {
                    memoryUsageSpan.style.color = '#ef4444';
                } else if (usagePercent >= 70) {
                    memoryUsageSpan.style.color = '#facc15';
                } else {
                    memoryUsageSpan.style.color = '#4ade80';
                }
            } else {
                memoryUsageSpan.textContent = `${finalMemUsage.toFixed(1)} GB`;
                memoryUsageSpan.style.color = '';
            }
        }
    }

    // Display command latency from /list response time
    if (typeof cmdLatencyMs !== 'undefined' && cmdLatencyMs !== null) {
        const ms = Math.max(0, parseInt(cmdLatencyMs, 10) || 0);
        serverTpsSpan.textContent = `${ms} ms`;
        if (ms >= 300) {
            serverTpsSpan.style.color = '#ef4444';
        } else if (ms >= 150) {
            serverTpsSpan.style.color = '#facc15';
        } else {
            serverTpsSpan.style.color = '#4ade80';
        }
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
            addToConsole(`Could not fetch server port: ${error.message}`, 'DEBUG');
        }
    }
    try {
        const localIP = await window.electronAPI.getLocalIP() || '-';
        localIpAddressSpan.textContent = (localIP !== '-' && localIP !== 'Error') ? `${localIP}${port}` : localIP;
    } catch (error) { localIpAddressSpan.textContent = 'Error'; }
    try {
        const publicIpResponse = await window.electronAPI.getPublicIP();
        let publicIP = publicIpResponse;
        let appendServerPort = true;
        if (publicIpResponse && typeof publicIpResponse === 'object') {
            publicIP = publicIpResponse.address ?? '-';
            appendServerPort = publicIpResponse.includeServerPort !== false;
        }
        publicIP = publicIP || '-';
        const shouldAppendPort = appendServerPort && publicIP !== '-' && publicIP !== 'Error';
        publicIpAddressSpan.textContent = shouldAppendPort ? `${publicIP}${port}` : publicIP;
    } catch (error) { publicIpAddressSpan.textContent = 'Error'; }
}

async function initializeApp() {
    try {
        const iconPath = await window.electronAPI.getIconPath();
        document.getElementById('app-icon').src = iconPath;
        const version = await window.electronAPI.getAppVersion();
        let isDev = false;
        try {
            isDev = await (window.electronAPI.isDev ? window.electronAPI.isDev() : Promise.resolve(false));
        } catch (_) { isDev = false; }
        const titleText = `Server Launcher v${version}${isDev ? ' — Development Version' : ''}`;
        document.title = titleText;
        document.getElementById('app-title-version').textContent = titleText;

        launcherSettingsCache = await window.electronAPI.getSettings();
        const savedTheme = launcherSettingsCache.theme || 'skypixel';
        applyThemeClass(savedTheme);
        themeSelect.value = savedTheme === 'default' ? 'skypixel' : savedTheme;
        
        await populateLanguageSelects();
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
            statusMessageSpan.style.color = 'var(--color-primary)';
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
        spinner.className = 'fas fa-spinner fa-spin text-2xl accent-text mt-4';
        javaInstallModalContent.appendChild(spinner);
    } else if (lowerStatus.includes('error') || lowerStatus.includes('failed') || lowerStatus.includes('timed out')) {
        javaInstallButton.classList.remove('hidden');
        javaInstallButton.disabled = false;
        javaInstallButton.classList.remove('btn-disabled');
        javaRestartButton.classList.remove('hidden');
    }
});

window.electronAPI.onPlaySound((soundPath) => {
    try {
        if (soundPath) {
            const audio = new Audio(soundPath);
            audio.volume = 1.0;
            audio.play().catch(() => { /* fallback below */ });
            return;
        }
    } catch (_) {}
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
    } catch (_) {}
});

async function openPluginsView() {
    if (!pluginsPage) return;
    if (setupRequired) return;
    if (isPluginsViewOpen) return;
    if (isSettingsViewOpen) {
        closeSettingsView(() => openPluginsView());
        return;
    }
    if (isSetupViewOpen) {
        closeSetupView(() => openPluginsView());
        return;
    }

    updatePluginsButtonAppearance(currentServerConfig?.serverType);
    await refreshPluginsList();
    await populateServerProperties();

    setActiveView('plugins');
}

async function refreshPluginsList() {
    pluginsList.innerHTML = '';
    try {
        const plugins = await window.electronAPI.getPlugins();
        const type = currentServerConfig?.serverType;
        const isFabric = type === 'fabric';
        const isBedrock = type === 'bedrock';
        if (!plugins || plugins.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'text-gray-400 text-sm text-center py-4 font-medium';
            if (isBedrock) {
                empty.textContent = currentTranslations['addonsManagedManually'] || 'Manage Bedrock add-ons directly from the server folder.';
            } else {
                empty.textContent = isFabric ? (currentTranslations['noModsFound'] || 'No mods found.') : (currentTranslations['noPluginsFound'] || 'No plugins found.');
            }
            pluginsList.appendChild(empty);
            return;
        }
        const deleteLabel = currentTranslations['deleteButton'] || 'Delete';
        plugins.forEach(p => {
            const row = document.createElement('div');
            row.className = 'addon-list-row flex items-center gap-3 rounded-xl px-3 py-3 transition-colors shadow-sm';

            const iconWrap = document.createElement('div');
            iconWrap.className = 'addon-icon-wrap flex items-center justify-center w-10 h-10 rounded-lg';
            const icon = document.createElement('i');
            icon.className = `fas ${getAddonIcon(type)} accent-text`;
            iconWrap.appendChild(icon);

            const info = document.createElement('div');
            info.className = 'flex-1 min-w-0';
            const name = document.createElement('div');
            name.className = 'text-sm text-gray-200 truncate';
            name.textContent = p.name;
            const meta = document.createElement('div');
            meta.className = 'text-xs text-gray-400';
            meta.textContent = `${(p.size/1024/1024).toFixed(2)} MB`;
            info.appendChild(name);
            info.appendChild(meta);

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-danger px-5 py-2 text-sm font-semibold flex items-center gap-2 rounded-md flex-shrink-0';
            delBtn.innerHTML = `<i class="fas fa-trash"></i><span>${deleteLabel}</span>`;
            if (isBedrock) {
                delBtn.disabled = true;
                delBtn.classList.add('btn-disabled');
            }
            delBtn.addEventListener('click', async () => {
                if (isBedrock) {
                    addToConsole(currentTranslations['addonsDeleteUnavailable'] || 'Launcher cannot delete Bedrock add-ons automatically.', 'WARN');
                    return;
                }
                if (localIsServerRunning) {
                    addToConsole(isFabric ? (currentTranslations['stopBeforeDeletingMods'] || 'Stop the server before deleting mods.') : (currentTranslations['stopBeforeDeletingPlugins'] || 'Stop the server before deleting plugins.'), 'WARN');
                    return;
                }
                const res = await window.electronAPI.deletePlugin(p.name);
                if (!res.ok) addToConsole(`Delete failed: ${res.error}`, 'ERROR');
                else {
                    const label = getAddonLabel(currentServerConfig?.serverType).slice(0, -1).toLowerCase();
                    addToConsole(`Deleted ${label} ${p.name}`, 'SUCCESS');
                }
                await refreshPluginsList();
            });

            row.appendChild(iconWrap);
            row.appendChild(info);
            row.appendChild(delBtn);
            pluginsList.appendChild(row);
        });
    } catch (e) {
        addToConsole(`Failed to load plugins: ${e.message}`, 'ERROR');
    }
}

uploadPluginButton?.addEventListener('click', async () => {
    if (currentServerConfig?.serverType === 'bedrock') {
        addToConsole(currentTranslations['addonsUploadUnavailable'] || 'Bedrock add-ons must be managed manually.', 'WARN');
        return;
    }
    const res = await window.electronAPI.uploadPlugins();
    if (!res.ok) addToConsole(`Upload failed: ${res.error}`, 'ERROR');
    else if (res.added?.length) addToConsole(`Uploaded: ${res.added.join(', ')}`, 'SUCCESS');
    await refreshPluginsList();
});

openPluginsFolderButton?.addEventListener('click', () => window.electronAPI.openPluginsFolder());

pluginsRefreshButton?.addEventListener('click', async () => {
    await refreshPluginsList();
    await populateServerProperties();
});

closePluginsPageButton?.addEventListener('click', () => closePluginsView());
pluginsSaveApplyButton?.addEventListener('click', () => {
    const inputs = serverPropertiesContainer?.querySelectorAll('input, select');
    if (inputs && inputs.length > 0) {
        const updatedProperties = {};
        inputs.forEach(input => {
            if (input.dataset?.key) {
                updatedProperties[input.dataset.key] = input.value;
            }
        });
        if (Object.keys(updatedProperties).length > 0) {
            window.electronAPI.setServerProperties(updatedProperties);
        }
    }
    closePluginsView();
});
javaInstallModal.addEventListener('click', (e) => {
    if (!javaInstallModalContent.contains(e.target)) {
        hideModal(javaInstallModal, javaInstallModalContent);
    }
});
function applyThemeClass(theme) {
    const classes = ['theme-skypixel','theme-nord','theme-aurora','theme-midnight','theme-emerald','theme-sunset','theme-crimson','theme-ocean','theme-grape','theme-neon'];
    document.body.classList.remove(...classes);
    if (theme === 'default') theme = 'skypixel';
    const classMap = {
        skypixel: null,
        nord: 'theme-nord',
        aurora: 'theme-aurora',
        midnight: 'theme-midnight',
        emerald: 'theme-emerald',
        sunset: 'theme-sunset',
        crimson: 'theme-crimson',
        ocean: 'theme-ocean',
        grape: 'theme-grape',
        neon: 'theme-neon'
    };
    const cls = classMap[theme];
    if (cls) document.body.classList.add(cls);
}

themeSelect.addEventListener('change', (e) => {
    const value = e.target.value;
    applyThemeClass(value);
    launcherSettingsCache.theme = value;
    window.electronAPI.setSettings({ theme: value });
});
