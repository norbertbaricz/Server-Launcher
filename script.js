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

// Container pentru Status Bar + Open Folder
const statusAndOpenFolderArea = document.getElementById('status-and-open-folder-area');
const statusBarContent = document.getElementById('status-bar-content');
const openFolderButtonMain = document.getElementById('open-folder-button-main');
const setupActivePlaceholderTop = document.getElementById('setup-active-placeholder-top');

// Selectoare pentru Modalul de Setup
const setupModal = document.getElementById('setup-modal');
const setupModalContent = document.getElementById('setup-modal-content');
const mcVersionModalSelect = document.getElementById('mc-version-modal');
const ramAllocationModalSelect = document.getElementById('ram-allocation-modal');
const downloadModalButton = document.getElementById('download-button-modal');

let localIsServerRunning = false;
let currentServerConfig = {};
let isModalAnimating = false;

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

function setStatus(text, pulse = false) {
    statusMessageSpan.textContent = text;
    const pulseTarget = statusBarContent;

    if (pulse) {
        pulseTarget.classList.add('status-bar-pulse'); statusMessageSpan.style.color = '#facc15';
    } else {
        pulseTarget.classList.remove('status-bar-pulse');
        if (text.toLowerCase().includes("running")) { statusMessageSpan.style.color = '#4ade80'; }
        else if (text.toLowerCase().includes("stopped") || text.toLowerCase().includes("ready") || text.toLowerCase().includes("initialized") || text.toLowerCase().includes("successfully") || text.toLowerCase().includes("saved")) {
            statusMessageSpan.style.color = (text.toLowerCase().includes("successfully") || text.toLowerCase().includes("saved")) ? '#4ade80' : '#9ca3af';
        } else if (text.toLowerCase().includes("failed") || text.toLowerCase().includes("error")) { statusMessageSpan.style.color = '#f87171'; }
        else { statusMessageSpan.style.color = '#facc15'; }
    }
}

function updateButtonStates(isRunning) {
    localIsServerRunning = isRunning;
    const setupComplete = setupModal.classList.contains('hidden');

    if (isRunning) {
        startButton.classList.add('btn-disabled'); startButton.disabled = true;
        stopButton.classList.remove('btn-disabled'); stopButton.disabled = false;
    } else {
        stopButton.classList.add('btn-disabled'); stopButton.disabled = true;
        startButton.disabled = !setupComplete;
        if (!startButton.disabled) startButton.classList.remove('btn-disabled');
        else startButton.classList.add('btn-disabled');
    }

    openFolderButtonMain.disabled = !setupComplete;
    if(setupComplete) {
        statusAndOpenFolderArea.classList.remove('hidden');
        statusAndOpenFolderArea.classList.add('flex');
        setupActivePlaceholderTop.classList.add('hidden');
    } else {
        statusAndOpenFolderArea.classList.add('hidden');
        statusAndOpenFolderArea.classList.remove('flex');
        setupActivePlaceholderTop.classList.remove('hidden');
    }

    sendCommandButton.disabled = !isRunning;
    commandInput.disabled = !isRunning;
    if (!isRunning) commandInput.value = "";
}

async function populateAndSetMCVersionModal() {
    mcVersionModalSelect.innerHTML = '<option value="" disabled>Loading versions...</option>';
    mcVersionModalSelect.disabled = true;

    try {
        const availableVersions = await window.electronAPI.getAvailablePaperMCVersions();
        mcVersionModalSelect.innerHTML = '';

        if (availableVersions && availableVersions.length > 0) {
            availableVersions.forEach((version, index) => {
                const option = document.createElement('option');
                option.value = version;
                option.textContent = version + (index === 0 ? ' (Latest)' : '');
                mcVersionModalSelect.appendChild(option);
            });

            if (currentServerConfig && typeof currentServerConfig.version === 'string' && availableVersions.includes(currentServerConfig.version)) {
                mcVersionModalSelect.value = currentServerConfig.version;
                addToConsole(`Modal: Loaded MC version from config: ${currentServerConfig.version}`, 'INFO');
            } else {
                mcVersionModalSelect.value = availableVersions[0];
                addToConsole(`Modal: Defaulted MC version to API latest: ${availableVersions[0]}`, 'INFO');
            }
        } else {
             mcVersionModalSelect.innerHTML = '<option value="" disabled selected>No versions found</option>';
             addToConsole("Modal: No PaperMC versions found from API.", 'WARN');
        }
    } catch (error) {
        mcVersionModalSelect.innerHTML = '<option value="" disabled selected>Error loading versions</option>';
        addToConsole(`Modal: Error populating MC versions: ${error.message}`, 'ERROR');
    } finally {
        mcVersionModalSelect.disabled = false;
    }
}

async function showSetupModal() {
    if (isModalAnimating || !setupModal.classList.contains('hidden')) return;
    isModalAnimating = true;

    setupModal.classList.remove('hidden');
    setupModal.style.animation = 'fadeInModalBg 0.25s ease-out forwards';
    setupModalContent.style.animation = 'fadeInModalContent 0.3s ease-out 0.05s forwards';

    await populateAndSetMCVersionModal();

    if (currentServerConfig && typeof currentServerConfig.ram !== 'undefined') {
        ramAllocationModalSelect.value = currentServerConfig.ram;
        addToConsole(`Modal: Loaded RAM allocation from config: ${currentServerConfig.ram}`, 'INFO');
    } else {
        ramAllocationModalSelect.value = 'auto';
        addToConsole(`Modal: Defaulted RAM allocation to 'auto'.`, 'INFO');
    }

    mcVersionModalSelect.disabled = false; // Asigură că e activ după populare
    ramAllocationModalSelect.disabled = false;
    downloadModalButton.disabled = false;

    setupActivePlaceholderTop.textContent = "Please complete server configuration in the popup.";
    updateButtonStates(localIsServerRunning); // Reflectă starea curentă

    const onAnimationEnd = () => {
        isModalAnimating = false;
        setupModalContent.removeEventListener('animationend', onAnimationEnd);
    };
    setupModalContent.addEventListener('animationend', onAnimationEnd, {once: true});
}

function hideSetupModal(callback) {
    if (isModalAnimating || setupModal.classList.contains('hidden')) {
        if(callback) callback();
        return;
    }
    isModalAnimating = true;

    setupModal.style.animation = 'fadeOutModalBg 0.3s ease-in forwards';
    setupModalContent.style.animation = 'fadeOutModalContent 0.25s ease-in forwards';

    const onAnimationEnd = () => {
        setupModal.classList.add('hidden');
        isModalAnimating = false;
        setupModal.style.animation = '';
        setupModalContent.style.animation = '';
        setupModalContent.removeEventListener('animationend', onAnimationEnd);
        if (callback) callback();
    };
    setupModalContent.addEventListener('animationend', onAnimationEnd, {once: true});
}

async function refreshUISetupState() {
    addToConsole("Refreshing UI state...", "INFO");
    await new Promise(resolve => setTimeout(resolve, 50));

    const { needsSetup, config, error } = await window.electronAPI.checkInitialSetup();

    if (error) {
        addToConsole(`Critical Error during setup check: ${error}.`, "ERROR");
        setStatus("Launcher Initialization Error!", false);
        hideSetupModal(() => {
            statusAndOpenFolderArea.classList.add('hidden');
            statusAndOpenFolderArea.classList.remove('flex');
            setupActivePlaceholderTop.classList.remove('hidden');
            setupActivePlaceholderTop.textContent = "Error initializing. Please restart.";
        });
        startButton.classList.add('btn-disabled'); startButton.disabled = true;
        openFolderButtonMain.disabled = true;
        updateButtonStates(localIsServerRunning);
        return;
    }

    currentServerConfig = config || {};

    if (needsSetup) {
        await showSetupModal();
    } else {
        hideSetupModal(() => {
            if (!localIsServerRunning) {
                setStatus("Server ready. Click Start Server.", false);
            }
            updateButtonStates(localIsServerRunning);
        });
    }
    updateButtonStates(localIsServerRunning); // Asigură o actualizare finală a stării butoanelor
}


downloadModalButton.addEventListener('click', () => {
    if (downloadModalButton.disabled || isModalAnimating) return;
    const version = mcVersionModalSelect.value;
    const ram = ramAllocationModalSelect.value;
    if (!version) {
        addToConsole("No Minecraft version selected in modal. Please select a version.", "ERROR");
        setStatus("Please select a Minecraft version.", false);
        return;
    }
    setStatus(`Processing: PaperMC ${version}, RAM ${ram}...`, true);
    addToConsole(`Action 'Download/Configure' (Modal) for MC ${version}, RAM: ${ram}`, 'INFO');

    downloadModalButton.disabled = true;
    mcVersionModalSelect.disabled = true;
    ramAllocationModalSelect.disabled = true;

    window.electronAPI.downloadPaperMC({ mcVersion: version, ramAllocation: ram });
});

openFolderButtonMain.addEventListener('click', () => {
    if(openFolderButtonMain.disabled) return;
    addToConsole("Requesting to open server folder...", "INFO");
    window.electronAPI.openServerFolder();
});

startButton.addEventListener('click', () => {
    if (startButton.disabled || !setupModal.classList.contains('hidden')) return;
    setStatus('Requesting server start...', true);
    addToConsole("Requesting server start (version/RAM from config.json).", "INFO");
    window.electronAPI.startServer();
});

stopButton.addEventListener('click', () => {
    if (stopButton.disabled) return;
    setStatus('Requesting server stop...', true);
    addToConsole("Requesting server stop...", "INFO");
    window.electronAPI.stopServer();
});

sendCommandButton.addEventListener('click', () => {
    const command = commandInput.value.trim();
    if (command === '') return;
    if (!localIsServerRunning) {
        addToConsole(`Error: Server is not running. Command "${command}" not sent.`, 'ERROR');
        commandInput.value = ''; return;
    }
    addToConsole(`> ${command}`, 'CMD');
    window.electronAPI.sendCommand(command);
    commandInput.value = '';
});

commandInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') { event.preventDefault(); sendCommandButton.click(); }
});

window.electronAPI.onUpdateConsole((message, type) => { addToConsole(message, type); });

window.electronAPI.onUpdateStatus(async (message, pulse) => {
    setStatus(message, pulse);
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('downloaded successfully') || lowerMessage.includes('configuration saved')) {
        await refreshUISetupState();
    } else if ( (lowerMessage.includes('failed') || lowerMessage.includes('error')) && !setupModal.classList.contains('hidden') ) {
        // Reactivează controalele din modal dacă a eșuat și modalul e încă vizibil
        mcVersionModalSelect.disabled = false;
        ramAllocationModalSelect.disabled = false;
        downloadModalButton.disabled = false;
    }
});

window.electronAPI.onServerStateChange(async (isRunning) => {
    updateButtonStates(isRunning);
    await refreshUISetupState();

    if (isRunning) {
        if (!statusMessageSpan.textContent.toLowerCase().includes("running")) { setStatus('Server is running.'); }
        if (ipInfoBarDiv) {
            ipInfoBarDiv.classList.add('animate-green-attention');
            ipInfoBarDiv.addEventListener('animationend', () => ipInfoBarDiv.classList.remove('animate-green-attention'), { once: true });
        }
    } else {
        if (setupModal.classList.contains('hidden')) { // Doar dacă setup-ul e complet
            const currentStatus = statusMessageSpan.textContent.toLowerCase();
            if (!currentStatus.includes("download") && !currentStatus.includes("fetching") &&
                !currentStatus.includes("failed") && !currentStatus.includes("error") &&
                !currentStatus.includes("successfully") && !currentStatus.includes("saved")) {
                if (!currentStatus.includes("stopped")) { setStatus('Server is stopped.'); }
            }
        }
    }
});

window.electronAPI.onRequestStatusCheckForFail(() => {
    if(statusMessageSpan.textContent.toLowerCase().includes('starting')) {
        setStatus('Server failed to stay running.', false);
    }
});

async function fetchAndDisplayIPs() {
    try {
        const localIP = await window.electronAPI.getLocalIP(); localIpAddressSpan.textContent = localIP || 'N/A';
    } catch (error) { console.error('Failed to get local IP:', error); localIpAddressSpan.textContent = 'Error'; addToConsole(`Failed to get Local IP: ${error.message || 'Unknown error'}`, 'ERROR'); }
    try {
        const publicIP = await window.electronAPI.getPublicIP(); publicIpAddressSpan.textContent = publicIP || 'N/A';
    } catch (error) { console.error('Failed to get public IP:', error); publicIpAddressSpan.textContent = 'Error'; }
}

async function initializeApp() {
    addToConsole("Launcher initializing...", "INFO");
    setStatus("Initializing launcher...", true);
    await fetchAndDisplayIPs();
    await refreshUISetupState();
    addToConsole("Launcher initialized.", "INFO");
}

document.addEventListener('DOMContentLoaded', initializeApp);