function scheduleConsoleFlush() {
    if (consoleFlushScheduled) return;
    consoleFlushScheduled = true;
    requestAnimationFrame(flushConsoleLines);
}

function flushConsoleLines() {
    consoleFlushScheduled = false;
    if (!pendingConsoleLines.length || !consoleOutput) return;

    const fragment = document.createDocumentFragment();
    let processed = 0;
    while (pendingConsoleLines.length && processed < LINES_PER_FLUSH) {
        const html = pendingConsoleLines.shift();
        const line = document.createElement('div');
        line.classList.add('console-message');
        line.innerHTML = html;
        fragment.appendChild(line);
        processed += 1;
    }

    consoleOutput.appendChild(fragment);

    while (consoleOutput.childElementCount > MAX_CONSOLE_LINES) {
        consoleOutput.removeChild(consoleOutput.firstElementChild);
    }

    consoleOutput.scrollTop = consoleOutput.scrollHeight;

    if (pendingConsoleLines.length) {
        scheduleConsoleFlush();
    }
}

function enqueueConsoleLine(html) {
    pendingConsoleLines.push(html);
    if (pendingConsoleLines.length > MAX_CONSOLE_LINES * 2) {
        pendingConsoleLines.splice(0, pendingConsoleLines.length - MAX_CONSOLE_LINES * 2);
    }
    scheduleConsoleFlush();
}

function normalizeUiServerType(type) {
    if (!type) return 'paper';
    if (type === 'papermc' || type === 'paper') return 'paper';
    if (type === 'purpur') return 'paper';
    return type;
}

function getAddonLabel(type) {
    if (type === 'fabric') return currentTranslations['modsLabel'] || 'Mods';
    return currentTranslations['pluginsButton'] || 'Plugins';
}

function getAddonIcon(type) {
    if (type === 'fabric') return 'fa-flask';
    return 'fa-box-open';
}

function getServerTypeSuffix(type) {
    if (type === 'fabric') return ' (Modded)';
    return '';
}

function applyServerTypeUiState(type) {
    const toggleHidden = (element, hidden) => {
        if (!element) return;
        element.classList.toggle('hidden', hidden);
    };
    toggleHidden(ramAllocationModalContainer, false);
    toggleHidden(ramAllocationSettingsContainer, false);
    toggleHidden(javaArgumentsSettingsContainer, false);
}

function updatePluginsButtonAppearance(serverType) {
    const type = normalizeUiServerType(serverType);
    const label = getAddonLabel(type);
    const iconClass = getAddonIcon(type);
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
        uploadPluginButton.disabled = false;
        uploadPluginButton.classList.remove('btn-disabled');
        const uploadLabel = currentTranslations['uploadButton'] || 'Upload';
        uploadPluginButton.innerHTML = `<i class="fas fa-upload mr-1"></i>${uploadLabel}`;
        uploadPluginButton.title = uploadLabel;
    }
    if (openPluginsFolderButton) {
        const openFolderLabel = currentTranslations['openFolderButton'] || 'Open Folder';
        openPluginsFolderButton.innerHTML = `<i class="fas fa-folder-open mr-1"></i>${openFolderLabel}`;
        openPluginsFolderButton.title = openFolderLabel;
    }
}

function populateServerTypeSelect(selectEl, currentType) {
    if (!selectEl) return;
    const normalizedType = normalizeUiServerType(currentType);
    const options = [
        { value: 'paper', label: currentTranslations['serverTypeJavaDefault'] || 'Paper (Standard)' },
        { value: 'fabric', label: currentTranslations['serverTypeJavaModded'] || 'Fabric (Modded)' }
    ];
    selectEl.innerHTML = '';
    for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        selectEl.appendChild(o);
    }
    selectEl.value = normalizedType && ['paper','fabric'].includes(normalizedType) ? normalizedType : 'paper';
}

async function setLanguage(lang) {
    try {
        const translations = await window.electronAPI.getTranslations(lang);
        if (!translations) {
            if (lang !== 'en') return setLanguage('en');
            throw new Error('Default English translations not found.');
        }
        currentTranslations = translations;
        
        // Update all elements with data-key attribute (including option elements)
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

        // Repopulate dropdowns with translated labels
        const serverType = normalizeUiServerType(currentServerConfig?.serverType);
        populateServerTypeSelect(serverTypeModalSelect, serverType);
        populateServerTypeSelect(serverTypeSettingsSelect, serverType);
        
        // Repopulate version dropdowns with translated labels (Latest, etc.)
        if (mcVersionModalSelect && availableMcVersionsCache[serverType]) {
            const currentModalVersion = mcVersionModalSelect.value;
            await populateMcVersionSelect(mcVersionModalSelect, currentModalVersion, serverType);
        }
        if (mcVersionSettingsSelect && availableMcVersionsCache[serverType]) {
            const currentSettingsVersion = mcVersionSettingsSelect.value;
            await populateMcVersionSelect(mcVersionSettingsSelect, currentSettingsVersion, serverType);
        }

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
    languageJavaSelect.innerHTML = '';
    languageSettingsSelect.innerHTML = '';

    languages.forEach(lang => {
        languageModalSelect.appendChild(createOption(lang));
        languageJavaSelect.appendChild(createOption(lang).cloneNode(true));
        languageSettingsSelect.appendChild(createOption(lang).cloneNode(true));
    });
}


function addToConsole(message, type = 'INFO') {
    let renderedLine = '';
    if (type === 'SERVER_LOG_HTML') {
        let finalHtml = message;
        const prefixRegex = /\[(\d{2}:\d{2}:\d{2}) (INFO|WARN|ERROR)\]:/g;
        finalHtml = finalHtml.replace(prefixRegex, (match, timestamp, level) => {
            let levelColor = '#82aaff';
            if (level === 'WARN') levelColor = '#ffb372';
            else if (level === 'ERROR') levelColor = '#ff757f';
            return `<span style="color: #9ca3af;">[${timestamp} <span style="color: ${levelColor}; font-weight: bold;">${level}</span>]:</span>`;
        });
        
        renderedLine = finalHtml;
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

        const unifiedPrefix = `<span style="color: #9ca3af;">[${timestamp} <span style="color: ${typeColor}; font-weight: bold;">${typeText}</span>]:</span>`;
        renderedLine = `${unifiedPrefix} ${sanitizedMessage}`;
    }
    enqueueConsoleLine(renderedLine);
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
    applyServerTypeUiState(normalizeUiServerType(currentServerConfig?.serverType));
    const setupComplete = !setupRequired;
    
    const shouldHideStart = isRunning || !setupComplete;
    startButton.style.display = shouldHideStart ? 'none' : 'inline-flex';
    startButton.disabled = shouldHideStart || autoStartIsActive || isDownloadingFromServer || isStarting;
    
    stopButton.style.display = (!isRunning) ? 'none' : 'inline-flex';
    stopButton.disabled = !isRunning || isStopping;
    sendCommandButton.disabled = !isRunning;
    commandInput.disabled = !isRunning;
    pluginsFolderButton.disabled = !setupComplete;
    settingsButton.disabled = false;

    // Lock server configuration while starting or running, and respect user lock
    const lockNow = isRunning || isStarting;
    const lockedByUser = (lockServerPathButton?.dataset.locked === 'true');
    const effectiveLocked = lockNow || lockedByUser;
    if (serverPathDisplay) serverPathDisplay.disabled = effectiveLocked;
    if (chooseServerPathButton) {
        chooseServerPathButton.disabled = effectiveLocked;
        chooseServerPathButton.classList.toggle('btn-disabled', effectiveLocked);
    }
    if (lockServerPathButton) {
        lockServerPathButton.disabled = lockNow;
        lockServerPathButton.classList.toggle('btn-disabled', lockNow);
    }

    // Lock critical settings inside modal when starting or running
    updateSettingsLockState(lockNow);

    startButton.classList.toggle('btn-disabled', startButton.disabled);
    stopButton.classList.toggle('btn-disabled', stopButton.disabled);
    sendCommandButton.classList.toggle('btn-disabled', sendCommandButton.disabled);
    pluginsFolderButton.classList.toggle('btn-disabled', pluginsFolderButton.disabled);
    settingsButton.classList.toggle('btn-disabled', settingsButton.disabled);
    
    if (statusAndOpenFolderArea) {
        statusAndOpenFolderArea.classList.remove('hidden');
        statusAndOpenFolderArea.classList.add('flex');
    }
    if (setupActivePlaceholderTop) {
        setupActivePlaceholderTop.classList.add('hidden');
    }
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
    isJavaViewOpen = target === 'java';
    isJavaViewOpen = target === 'java';

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
    const normalizedType = normalizeUiServerType(currentServerConfig?.serverType);
    updatePluginsButtonAppearance(normalizedType);
    applyServerTypeUiState(normalizedType);
    if (needsSetup) {
        if (isSettingsViewOpen) closeSettingsView();
        if (isPluginsViewOpen) closePluginsView();
        openSetupView();
        const serverType = normalizedType;
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

function updateServerPathLockState(locked) {
    if (!lockServerPathButton) return;
    lockServerPathButton.dataset.locked = locked ? 'true' : 'false';
    if (locked) {
        lockServerPathIcon.className = 'fas fa-lock';
        lockServerPathText.textContent = currentTranslations['unlockPathButton'] || 'Unlock';
        if (chooseServerPathButton) {
            const runtimeLocked = (localIsServerRunning || isStarting) || locked;
            chooseServerPathButton.disabled = runtimeLocked;
            chooseServerPathButton.classList.toggle('btn-disabled', runtimeLocked);
        }
        lockServerPathButton.title = currentTranslations['unlockPathButton'] || 'Unlock';
    } else {
        lockServerPathIcon.className = 'fas fa-lock-open';
        lockServerPathText.textContent = currentTranslations['lockPathButton'] || 'Lock';
        if (chooseServerPathButton) {
            const runtimeLocked = (localIsServerRunning || isStarting) || locked;
            chooseServerPathButton.disabled = runtimeLocked;
            chooseServerPathButton.classList.toggle('btn-disabled', runtimeLocked);
        }
        lockServerPathButton.title = currentTranslations['lockPathButton'] || 'Lock';
    }
    // Ensure the lock toggle itself respects runtime state
    lockServerPathButton.disabled = (localIsServerRunning || isStarting);
    lockServerPathButton.classList.toggle('btn-disabled', (localIsServerRunning || isStarting));
}

function updateSettingsLockState(locked) {
    // Lock critical settings that affect the running server or during starting
    if (serverTypeSettingsSelect) serverTypeSettingsSelect.disabled = locked;
    if (mcVersionSettingsSelect) mcVersionSettingsSelect.disabled = locked;
    if (ramAllocationSettingsSelect) ramAllocationSettingsSelect.disabled = locked;
    if (javaArgumentsSettingsSelect) javaArgumentsSettingsSelect.disabled = locked;
    // Keep non-critical settings enabled (autostart, notifications, theme, language, etc.)
}

async function fetchAndDisplayIPs(showPort = true) {
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

let loadingScreenActive = true;
const loadingLauncherText = document.querySelector('#loading-screen [data-key="loadingLauncher"]');

function setLoadingText(fallbackText, translationKey = null) {
    if (!loadingLauncherText) return;
    const key = translationKey || loadingLauncherText.dataset.key;
    const translated = key ? currentTranslations[key] : null;
    const text = (translated && typeof translated === 'string' && translated.trim())
        ? translated
        : (fallbackText || currentTranslations['loadingLauncher'] || 'Loading Launcher...');
    loadingLauncherText.textContent = text;
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
        // Initialize server path lock state early to avoid clickable window
        try {
            const pathInfo = await window.electronAPI.getServerPathInfo();
            if (serverPathDisplay && pathInfo?.path) serverPathDisplay.value = pathInfo.path;
            updateServerPathLockState(!!pathInfo?.locked);
        } catch (_) {}
        
        await populateLanguageSelects();
        const savedLang = launcherSettingsCache.language || 'en';
        
        languageModalSelect.value = savedLang;
        languageSettingsSelect.value = savedLang;
        languageJavaSelect.value = savedLang;
        
        // Set theme selector initial value for Java page
        themeJavaSelect.value = savedTheme === 'default' ? 'skypixel' : savedTheme;
        
        await setLanguage(savedLang);

        setLoadingText('Launcher initializing...', 'launcherInitializing');
        
        await refreshUISetupState();
        addToConsole("Launcher initialized.", "INFO");

    } catch (error) {
        addToConsole(`Initialization failed: ${error.message}`, 'ERROR');
        setStatus('Initialization Error!', false, 'error');
    } finally {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
            loadingScreenActive = false;
            window.electronAPI.appReadyToShow();
        }, 500);
    }
}

// Mirror status updates from main: show on loading screen; after load, ignore startup-only keys
const startupStatusKeys = new Set([
    'updater-unavailable',
    'updater-in-progress',
    'updater-check-failed',
    'updater-check-start-failed',
    'setup-ok'
]);

window.electronAPI.onUpdateStatus((message, pulse = false, key = null) => {
    if (loadingScreenActive) {
        setLoadingText(message || '', key);
        return;
    }
    if (key && startupStatusKeys.has(key)) {
        return; // keep startup-only messages off the status bar
    }
    setStatus(message || '', pulse, key);
});

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

function cancelAutoStartCountdown(reasonKey = null) {
    const wasActive = autoStartIsActive || !!countdownInterval;
    const hadPending = !!pendingAutoStartRequest;
    autoStartIsActive = false;
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    pendingAutoStartRequest = null;
    statusBarContent.classList.remove('status-bar-pulse');
    if ((wasActive || hadPending) && reasonKey) {
        const fallback = currentTranslations[reasonKey] || 'Auto-start cancelled.';
        setStatus(fallback, false, reasonKey);
    }
    if (wasActive || hadPending) {
        updateButtonStates(localIsServerRunning);
    }
    return wasActive || hadPending;
}

function beginAutoStartCountdown(delay, type = 'initial') {
    if (localIsServerRunning) {
        addToConsole('Auto-start countdown waiting for server to stop (server currently running).', 'INFO');
        return false;
    }
    if (isStarting) {
        addToConsole('Auto-start countdown skipped because the server is already starting.', 'INFO');
        return false;
    }
    if (isStopping) {
        addToConsole('Auto-start countdown delayed until the server fully stops.', 'INFO');
        return false;
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
    return true;
}

function queueAutoStartRequest(delay, type, message) {
    pendingAutoStartRequest = { delay, type };
    if (message) {
        addToConsole(message, 'INFO');
    }
}

function applyThemeClass(theme) {
    const classes = ['theme-skypixel','theme-nord','theme-aurora','theme-midnight','theme-emerald','theme-sunset','theme-crimson','theme-ocean','theme-grape','theme-neon', 'theme-forest', 'theme-fire', 'theme-amethyst', 'theme-coffee', 'theme-starry'];
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
        neon: 'theme-neon',
        forest: 'theme-forest',
        fire: 'theme-fire',
        amethyst: 'theme-amethyst',
        coffee: 'theme-coffee',
        starry: 'theme-starry'
    };
    const cls = classMap[theme];
    if (cls) document.body.classList.add(cls);
}