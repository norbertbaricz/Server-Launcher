const mcVersionSelect = document.getElementById('mc-version');
const ramAllocationSelect = document.getElementById('ram-allocation');
const downloadButton = document.getElementById('download-button');
const openFolderButton = document.getElementById('open-folder-button');
const statusBarDiv = document.getElementById('status-bar'); 
const statusMessageSpan = document.getElementById('status-message');
const localIpAddressSpan = document.getElementById('local-ip-address');
const publicIpAddressSpan = document.getElementById('public-ip-address');
const ipInfoBarDiv = document.getElementById('ip-info-bar'); 
const consoleOutput = document.getElementById('console-output');
const commandInput = document.getElementById('command-input');
const sendCommandButton = document.getElementById('send-command-button');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');

let localIsServerRunning = false;

function addToConsole(message, type = 'INFO') {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = document.createElement('p');
    p.classList.add('console-message');
    let typeColor = '#9ca3af'; 
    let typeText = type.toUpperCase();

    if (type === 'ERROR' || type === 'SERVER_ERROR') { 
        typeColor = '#f87171'; 
        typeText = type === 'SERVER_ERROR' ? 'STDERR' : 'ERROR';
    } else if (type === 'WARN') { 
        typeColor = '#facc15';
    } else if (type === 'SUCCESS') { 
        typeColor = '#4ade80';
    } else if (type === 'CMD') { 
        typeColor = '#60a5fa';
    } else if (type === 'SERVER_LOG') { 
        const sanitizedMessage = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        p.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> ${sanitizedMessage}`;
        consoleOutput.appendChild(p);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        return;
    }

    const sanitizedMessage = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const typePrefix = `<span style="color: ${typeColor}; font-weight: bold;">[${typeText}]</span> `;
    
    p.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> ${typePrefix}${sanitizedMessage}`;
    consoleOutput.appendChild(p);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function setStatus(text, pulse = false) {
    statusMessageSpan.textContent = text;
    if (pulse) {
        statusBarDiv.classList.add('status-bar-pulse'); 
        statusMessageSpan.style.color = '#facc15'; 
    } else {
        statusBarDiv.classList.remove('status-bar-pulse'); 
        if (text.toLowerCase().includes("running")) { 
            statusMessageSpan.style.color = '#4ade80'; 
        } else if (text.toLowerCase().includes("stopped") || text.toLowerCase().includes("ready") || text.toLowerCase().includes("initialized")) { 
            statusMessageSpan.style.color = '#9ca3af'; 
        } else { 
            statusMessageSpan.style.color = '#facc15'; 
        }
    }
}

function updateButtonStates(isRunning) {
    localIsServerRunning = isRunning;
    if (isRunning) {
        startButton.classList.add('btn-disabled'); startButton.disabled = true;
        stopButton.classList.remove('btn-disabled'); stopButton.disabled = false;
        downloadButton.classList.add('btn-disabled'); downloadButton.disabled = true;
        mcVersionSelect.disabled = true; ramAllocationSelect.disabled = true;
    } else {
        startButton.classList.remove('btn-disabled'); startButton.disabled = false;
        stopButton.classList.add('btn-disabled'); stopButton.disabled = true;
        downloadButton.classList.remove('btn-disabled'); downloadButton.disabled = false;
        mcVersionSelect.disabled = false; ramAllocationSelect.disabled = false;
    }
}

downloadButton.addEventListener('click', () => {
    if (downloadButton.disabled) return;
    const version = mcVersionSelect.value;
    setStatus(`Requesting PaperMC download for ${version}...`, true);
    downloadButton.classList.add('btn-disabled');
    downloadButton.disabled = true;
    window.electronAPI.downloadPaperMC(version);
});

openFolderButton.addEventListener('click', () => {
    window.electronAPI.openServerFolder();
});

startButton.addEventListener('click', () => {
    if (startButton.disabled) return;
    const version = mcVersionSelect.value;
    let ram = ramAllocationSelect.value;
    setStatus('Requesting server start...', true);
    window.electronAPI.startServer(version, ram);
});

stopButton.addEventListener('click', () => {
    if (stopButton.disabled) return;
    setStatus('Requesting server stop...', true);
    window.electronAPI.stopServer();
});

sendCommandButton.addEventListener('click', () => {
    const command = commandInput.value.trim();
    if (command === '') return;
    if (!localIsServerRunning) {
        addToConsole(`Error: Server is not running. Command "${command}" was not sent.`, 'ERROR');
        commandInput.value = '';
        return;
    }
    addToConsole(`> ${command}`, 'CMD');
    window.electronAPI.sendCommand(command);
    commandInput.value = '';
});

commandInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); 
        sendCommandButton.click(); 
    }
});

window.electronAPI.onUpdateConsole((message, type) => { addToConsole(message, type); });
window.electronAPI.onUpdateStatus((message, pulse) => { setStatus(message, pulse); });

window.electronAPI.onServerStateChange((isRunning) => {
    updateButtonStates(isRunning);
    if (isRunning) {
        if (!statusMessageSpan.textContent.toLowerCase().includes("running")) { 
            setStatus('Server is running.'); 
        }
        if (ipInfoBarDiv) {
            ipInfoBarDiv.classList.add('animate-green-attention');
            ipInfoBarDiv.addEventListener('animationend', () => {
                ipInfoBarDiv.classList.remove('animate-green-attention');
            }, { once: true });
        }
    } else {
        const currentStatus = statusMessageSpan.textContent.toLowerCase();
        if (!currentStatus.includes("download") && !currentStatus.includes("fetching")) {
            if (currentStatus.includes("successfully") || currentStatus.includes("failed")) {} 
            else if (!currentStatus.includes("stopped")){ setStatus('Server is stopped.'); }
        } else if (currentStatus.includes("downloaded successfully")) {
             setStatus('Server is stopped. Ready to start.');
        }
    }
});

async function fetchAndDisplayIPs() {
    try {
        const localIP = await window.electronAPI.getLocalIP();
        localIpAddressSpan.textContent = localIP || 'N/A';
    } catch (error) {
        console.error('Failed to get local IP:', error); localIpAddressSpan.textContent = 'Error';
        addToConsole(`Failed to get Local IP: ${error.message}`, 'ERROR');
    }
    try {
        const publicIP = await window.electronAPI.getPublicIP();
        publicIpAddressSpan.textContent = publicIP || 'N/A';
    } catch (error) {
        console.error('Failed to get public IP:', error); publicIpAddressSpan.textContent = 'Error';
    }
}

function initializeApp() {
    updateButtonStates(false); 
    setStatus("Launcher initialized. Select version and RAM.", false);
    addToConsole("Launcher initialized. Ready for commands.", "INFO");
    fetchAndDisplayIPs();
}
document.addEventListener('DOMContentLoaded', initializeApp);