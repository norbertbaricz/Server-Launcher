import { createViewManager } from './views/viewManager.js';
import { createLoadingView } from './views/loadingView.js';
import { createSettingsView } from './views/settingsView.js';
import { createSetupView } from './views/setupView.js';

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
const copyLocalIpButton = document.getElementById('copy-local-ip-btn');
const copyPublicIpButton = document.getElementById('copy-public-ip-btn');

const pluginsFolderButton = document.getElementById('plugins-folder-button');
const pluginsFolderIcon = document.getElementById('plugins-folder-icon');
const settingsButton = document.getElementById('settings-button');

const statusAndOpenFolderArea = document.getElementById('status-and-open-folder-area');
const statusBarContent = document.getElementById('status-bar-content');
const setupActivePlaceholderTop = document.getElementById('setup-active-placeholder-top');

const setupPage = document.getElementById('setup-page');
const javaPage = document.getElementById('java-page');
const mcVersionModalSelect = document.getElementById('mc-version-modal');
const ramAllocationModalSelect = document.getElementById('ram-allocation-modal');
const ramAutoModalToggle = document.getElementById('ram-auto-modal-toggle');
const ramAllocationModalWrapper = document.getElementById('ram-allocation-modal-wrapper');
const languageModalSelect = document.getElementById('language-modal-select');
const languageJavaSelect = document.getElementById('language-java-select');
const themeJavaSelect = document.getElementById('theme-java-select');
const downloadModalButton = document.getElementById('download-button-modal');
const downloadModalButtonIcon = downloadModalButton.querySelector('i');
const downloadModalButtonText = document.getElementById('download-button-text');
const serverTypeModalSelect = document.getElementById('server-type-modal');

const mainContentArea = document.getElementById('main-content-area');
const dashboardView = document.getElementById('dashboard-view');
const settingsPage = document.getElementById('settings-page');
const mcVersionSettingsSelect = document.getElementById('mc-version-settings');
const ramAllocationSettingsSelect = document.getElementById('ram-allocation-settings');
const ramAutoSettingsToggle = document.getElementById('ram-auto-settings-toggle');
const ramAllocationSettingsWrapper = document.getElementById('ram-allocation-settings-wrapper');
const ramAllocationModalValue = document.getElementById('ram-allocation-modal-value');
const ramAllocationSettingsValue = document.getElementById('ram-allocation-settings-value');
const languageSettingsSelect = document.getElementById('language-settings-select');
const themeSelect = document.getElementById('theme-select');
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
const updateStatusLabel = document.getElementById('update-status-label');
const updateStatusSubtext = document.getElementById('update-status-subtext');
const updateStatusPill = document.getElementById('update-status-pill');
const updateStatusIcon = document.getElementById('update-status-icon');
const updateStatusIconInner = updateStatusIcon ? updateStatusIcon.querySelector('i') : null;
const checkUpdatesButton = document.getElementById('check-updates-button');
const checkUpdatesButtonIcon = document.getElementById('check-updates-button-icon');
const checkUpdatesButtonText = document.getElementById('check-updates-button-text');
const updateProgressWrapper = document.getElementById('update-progress-wrapper');
const updateProgressBar = document.getElementById('update-progress-bar');
const updateProgressSpeed = document.getElementById('update-progress-speed');
const updateProgressPercent = document.getElementById('update-progress-percent');

let availableThemes = [];
let themeMap = {};
let defaultTranslations = {};
let currentTranslations = {};
const UPDATE_PILL_BASE_CLASS = 'text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap';
const UPDATE_BUTTON_BASE_CLASS = 'btn-secondary px-4 py-2 rounded-md font-semibold flex items-center gap-2';
const autoUpdateState = {
    status: 'idle',
    version: null,
    supported: true,
    hint: null,
    percent: 0,
    bytesPerSecond: 0,
    lastCheckedAt: null,
    errorMessage: null,
    conflict: false
};

function translate(key, fallback = '') {
    if (!key) return fallback;
    const value = currentTranslations[key];
    if (typeof value === 'string' && value.length) return value;
    const defaultValue = defaultTranslations[key];
    if (typeof defaultValue === 'string' && defaultValue.length) return defaultValue;
    return fallback;
}

function formatTranslation(key, params = {}, fallback = '') {
    const template = translate(key, fallback);
    if (!template) return template;
    return template.replace(/\{([^}]+)\}/g, (_, token) => {
        const replacement = params[token];
        return (replacement !== undefined && replacement !== null) ? replacement : '';
    });
}

function hasDefaultTranslations() {
    return defaultTranslations && Object.keys(defaultTranslations).length > 0;
}

async function ensureDefaultTranslations() {
    if (hasDefaultTranslations()) return defaultTranslations;
    try {
        const base = await window.electronAPI.getTranslations('en');
        if (base && typeof base === 'object') {
            defaultTranslations = base;
        }
    } catch (error) {
        addToConsole(`Could not load default translations: ${error.message}`, 'DEBUG');
    }
    return defaultTranslations;
}

// Default to locked state until IPC confirms otherwise
if (chooseServerPathButton) {
    chooseServerPathButton.disabled = true;
    chooseServerPathButton.classList.add('btn-disabled');
}

const javaInstallMessage = document.getElementById('java-install-message');
const javaInstallButton = document.getElementById('java-install-button');
const javaRestartButton = document.getElementById('java-restart-button');
const javaInstallProgressBarContainer = document.getElementById('java-install-progress-bar-container');
const javaInstallProgressBar = document.getElementById('java-install-progress-bar');

// Developer Tools removed

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
const serverPropertiesSearch = document.getElementById('server-properties-search');

const loadingLauncherText = document.querySelector('#loading-screen [data-key="loadingLauncher"]');
        renderAutoUpdateState();


const minimizeBtn = document.getElementById('minimize-btn');
const maximizeBtn = document.getElementById('maximize-btn');
const closeBtn = document.getElementById('close-btn');
const maximizeBtnIcon = maximizeBtn.querySelector('i');

const DEFAULT_MAX_CONSOLE_LINES = 1000;
const DEFAULT_LINES_PER_FLUSH = 400;
let MAX_CONSOLE_LINES = DEFAULT_MAX_CONSOLE_LINES;
let LINES_PER_FLUSH = DEFAULT_LINES_PER_FLUSH;
const pendingConsoleLines = [];
let consoleFlushScheduled = false;

const MIN_RAM_GB = 2;
const RAM_STEP_GB = 0.25;
const DEFAULT_MAX_RAM_GB = 16;
let maxSystemRamGB = DEFAULT_MAX_RAM_GB;

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

function formatDownloadSpeed(bytesPerSecond) {
    const speed = Number(bytesPerSecond) || 0;
    if (speed <= 0) return translate('downloadSpeedZero');
    const kb = speed / 1024;
    if (kb < 1024) {
        return formatTranslation('downloadSpeedKilobytes', { value: Math.max(0, kb).toFixed(0) });
    }
    return formatTranslation('downloadSpeedMegabytes', { value: (kb / 1024).toFixed(1) });
}

function renderUpdateLastChecked(timestamp) {
    if (!updateStatusSubtext) return;
    if (!timestamp) {
        updateStatusSubtext.textContent = translate('updaterNeverChecked');
        return;
    }
    const localeTime = new Date(timestamp).toLocaleString();
    updateStatusSubtext.textContent = formatTranslation('updaterLastChecked', { time: localeTime }) || localeTime;
}

function setUpdatePill(text, extraClasses) {
    if (!updateStatusPill) return;
    updateStatusPill.className = `${UPDATE_PILL_BASE_CLASS} ${extraClasses}`.trim();
    updateStatusPill.textContent = text;
}

function setUpdateIcon(iconClass, spinning = false) {
    if (!updateStatusIconInner) return;
    const spinClass = spinning ? ' fa-spin' : '';
    updateStatusIconInner.className = `fas ${iconClass}${spinClass}`.trim();
}

function setUpdateButtonState({ disabled = false, busy = false, mode = 'check' } = {}) {
    if (!checkUpdatesButton) return;
    let className = UPDATE_BUTTON_BASE_CLASS;
    if (disabled) className += ' btn-disabled';
    checkUpdatesButton.className = className;
    checkUpdatesButton.disabled = disabled;
    if (checkUpdatesButtonIcon) {
        let baseIcon = 'fa-sync-alt';
        switch (mode) {
            case 'download':
                baseIcon = 'fa-download';
                break;
            case 'restart':
                baseIcon = 'fa-power-off';
                break;
            case 'installing':
                baseIcon = 'fa-rocket';
                break;
            default:
                baseIcon = 'fa-sync-alt';
        }
        const spin = busy ? ' fa-spin' : '';
        checkUpdatesButtonIcon.className = `fas ${baseIcon} text-sm${spin}`.trim();
    }
    if (checkUpdatesButtonText) {
        let label;
        switch (mode) {
            case 'download':
                label = translate('downloadUpdateButton');
                break;
            case 'restart':
                label = translate('javaRestartButton');
                break;
            case 'installing':
                label = translate('updateInstallingLabel');
                break;
            default:
                label = translate('checkUpdatesButton');
        }
        checkUpdatesButtonText.textContent = label;
    }
}

function toggleUpdateProgress(show, percent = 0, bytesPerSecond = 0) {
    if (!updateProgressWrapper || !updateProgressBar || !updateProgressSpeed || !updateProgressPercent) return;
    updateProgressWrapper.classList.toggle('hidden', !show);
    if (!show) return;
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    updateProgressBar.style.width = `${clamped}%`;
    updateProgressPercent.textContent = formatTranslation('downloadPercentLabel', { value: clamped.toFixed(0) });
    updateProgressSpeed.textContent = formatDownloadSpeed(bytesPerSecond);
}
function renderAutoUpdateState() {
    if (!updateStatusLabel) return;
    switch (autoUpdateState.status) {
        case 'unsupported':
            updateStatusLabel.textContent = autoUpdateState.hint || translate('updaterUnsupported');
            renderUpdateLastChecked(autoUpdateState.lastCheckedAt);
            setUpdatePill(translate('updateStateDisabled'), 'bg-gray-700 text-gray-200');
            setUpdateButtonState({ disabled: true, busy: false });
            toggleUpdateProgress(false);
            setUpdateIcon('fa-ban');
            break;
        case 'checking':
            updateStatusLabel.textContent = autoUpdateState.conflict
                ? translate('updaterInProgress')
                : translate('updaterChecking');
            renderUpdateLastChecked(autoUpdateState.lastCheckedAt);
            setUpdatePill(translate('updateStateChecking'), 'bg-blue-600 text-white');
            setUpdateButtonState({ disabled: true, busy: true });
            toggleUpdateProgress(false);
            setUpdateIcon('fa-spinner', true);
            break;
        case 'available':
            updateStatusLabel.textContent = formatTranslation('updaterAvailable', { version: autoUpdateState.version || '?' });
            updateStatusSubtext.textContent = translate('updateManualDownloadHint');
            setUpdatePill(translate('updateStateReady'), 'bg-amber-500 text-gray-900');
            setUpdateButtonState({ disabled: false, busy: false, mode: 'download' });
            toggleUpdateProgress(false);
            setUpdateIcon('fa-cloud-arrow-down');
            break;
        case 'up-to-date':
            updateStatusLabel.textContent = translate('updaterNoUpdates');
            renderUpdateLastChecked(autoUpdateState.lastCheckedAt);
            setUpdatePill(translate('updateStateUpToDate'), 'bg-emerald-600 text-white');
            setUpdateButtonState({ disabled: false, busy: false });
            toggleUpdateProgress(false);
            setUpdateIcon('fa-circle-check');
            break;
        case 'downloading':
            updateStatusLabel.textContent = formatTranslation('updaterDownloading', { version: autoUpdateState.version || '?' });
            updateStatusSubtext.textContent = `${Math.round(autoUpdateState.percent)}% — ${formatDownloadSpeed(autoUpdateState.bytesPerSecond)}`;
            setUpdatePill(translate('updateStateDownloading'), 'bg-blue-600 text-white');
            setUpdateButtonState({ disabled: true, busy: true, mode: 'download' });
            toggleUpdateProgress(true, autoUpdateState.percent, autoUpdateState.bytesPerSecond);
            setUpdateIcon('fa-cloud-arrow-down', true);
            break;
        case 'installing':
            updateStatusLabel.textContent = translate('updateInstallingLabel');
            updateStatusSubtext.textContent = translate('updateInstallingSubtext');
            setUpdatePill(translate('updateStateInstalling'), 'bg-purple-600 text-white');
            setUpdateButtonState({ disabled: true, busy: true, mode: 'installing' });
            toggleUpdateProgress(false);
            setUpdateIcon('fa-rocket', true);
            break;
        case 'error':
            updateStatusLabel.textContent = `${translate('notificationUpdateError')}${autoUpdateState.errorMessage ? `: ${autoUpdateState.errorMessage}` : ''}`;
            renderUpdateLastChecked(autoUpdateState.lastCheckedAt);
            setUpdatePill(translate('updateStateError'), 'bg-rose-600 text-white');
            setUpdateButtonState({ disabled: false, busy: false });
            toggleUpdateProgress(false);
            setUpdateIcon('fa-triangle-exclamation');
            break;
        default:
            updateStatusLabel.textContent = translate('updaterReady');
            renderUpdateLastChecked(autoUpdateState.lastCheckedAt);
            setUpdatePill(translate('updateStateIdle'), 'bg-gray-600 text-gray-100');
            setUpdateButtonState({ disabled: false, busy: false });
            toggleUpdateProgress(false);
            setUpdateIcon('fa-bolt');
            break;
    }
}

function handleUpdaterEvent(payload = {}) {
    if (!payload || typeof payload !== 'object') return;
    const { type } = payload;
    autoUpdateState.conflict = false;
    switch (type) {
        case 'unsupported':
            autoUpdateState.status = 'unsupported';
            autoUpdateState.supported = false;
            autoUpdateState.hint = payload.reason || null;
            if (payload.timestamp) autoUpdateState.lastCheckedAt = payload.timestamp;
            break;
        case 'checking':
            autoUpdateState.status = 'checking';
            autoUpdateState.supported = true;
            autoUpdateState.errorMessage = null;
            autoUpdateState.conflict = payload.reason === 'already-checking';
            break;
        case 'in-progress':
            if (payload.reason === 'download-in-progress') {
                autoUpdateState.status = 'downloading';
                autoUpdateState.conflict = false;
            } else {
                autoUpdateState.status = 'checking';
                autoUpdateState.conflict = true;
            }
            break;
        case 'download-started':
            autoUpdateState.status = 'downloading';
            autoUpdateState.percent = 0;
            autoUpdateState.bytesPerSecond = 0;
            autoUpdateState.version = payload.version || autoUpdateState.version;
            break;
        case 'available':
            autoUpdateState.status = 'available';
            autoUpdateState.version = payload.version || autoUpdateState.version;
            autoUpdateState.lastCheckedAt = payload.timestamp || Date.now();
            autoUpdateState.percent = 0;
            autoUpdateState.bytesPerSecond = 0;
            break;
        case 'not-available':
            autoUpdateState.status = 'up-to-date';
            autoUpdateState.lastCheckedAt = payload.timestamp || Date.now();
            autoUpdateState.version = null;
            autoUpdateState.percent = 0;
            autoUpdateState.bytesPerSecond = 0;
            break;
        case 'progress':
            autoUpdateState.status = 'downloading';
            autoUpdateState.percent = Number(payload.percent) || 0;
            autoUpdateState.bytesPerSecond = Number(payload.bytesPerSecond) || 0;
            autoUpdateState.version = payload.version || autoUpdateState.version;
            break;
        case 'downloaded':
            autoUpdateState.status = 'installing';
            autoUpdateState.version = payload.version || autoUpdateState.version;
            autoUpdateState.lastCheckedAt = payload.timestamp || Date.now();
            autoUpdateState.percent = 100;
            autoUpdateState.bytesPerSecond = 0;
            break;
        case 'error':
            autoUpdateState.status = 'error';
            autoUpdateState.errorMessage = payload.message || null;
            autoUpdateState.lastCheckedAt = payload.timestamp || Date.now();
            autoUpdateState.percent = 0;
            autoUpdateState.bytesPerSecond = 0;
            break;
        case 'idle':
            autoUpdateState.status = 'idle';
            autoUpdateState.supported = true;
            autoUpdateState.percent = 0;
            autoUpdateState.bytesPerSecond = 0;
            break;
        default:
            return;
    }
    renderAutoUpdateState();
}

renderAutoUpdateState();

// In-app toasts removed; rely on desktop notifications only

function renderMemoryUsage() {
    const allocated = parseFloat(allocatedRamCache);
    const hasAllocated = !Number.isNaN(allocated) && allocated > 0;
    const hasMemory = typeof lastMemoryGB === 'number' && !Number.isNaN(lastMemoryGB);

    if (hasMemory) {
        const finalMemUsage = Math.max(0, lastMemoryGB);
        if (hasAllocated) {
            memoryUsageSpan.textContent = formatTranslation('memoryUsageAllocatedFormat', {
                used: finalMemUsage.toFixed(2),
                allocated: allocatedRamCache
            });
            const usagePercent = (finalMemUsage / allocated) * 100;
            if (usagePercent >= 90) {
                memoryUsageSpan.style.color = '#ef4444';
            } else if (usagePercent >= 70) {
                memoryUsageSpan.style.color = '#facc15';
            } else {
                memoryUsageSpan.style.color = '#4ade80';
            }
        } else {
            memoryUsageSpan.textContent = formatTranslation('memoryUsageFormat', { value: finalMemUsage.toFixed(2) });
            memoryUsageSpan.style.color = '';
        }
    } else {
        memoryUsageSpan.textContent = hasAllocated
            ? formatTranslation('memoryUsageAllocatedPlaceholder', { allocated: allocatedRamCache })
            : translate('memoryUsagePlaceholder');
        memoryUsageSpan.style.color = '';
    }
}

let localIsServerRunning = false;
let currentServerConfig = {};
let isModalAnimating = false;
let availableMcVersionsCache = {};
let allocatedRamCache = '-';
let lastMemoryGB = null;
let autoStartIsActive = false; 
let countdownInterval = null;
let isDownloadingFromServer = false;
let launcherSettingsCache = {};
let setupRequired = false;
let ramModalUserValue = null;
let ramSettingsUserValue = null;
const viewState = {
    activeViewKey: dashboardView ? 'dashboard' : null,
    isSettingsViewOpen: false,
    isPluginsViewOpen: false,
    isSetupViewOpen: false,
    isJavaViewOpen: false
};
let isStarting = false;
let isStopping = false;
let pendingAutoStartRequest = null;

const viewMap = {
    dashboard: dashboardView,
    setup: setupPage,
    java: javaPage,
    settings: settingsPage,
    plugins: pluginsPage
};

const { setActiveView } = createViewManager({
    viewMap,
    mainContentArea,
    viewState
});

const loadingView = createLoadingView({
    loadingScreen,
    loadingTextEl: loadingLauncherText
});

const settingsView = createSettingsView({ setActiveView, viewState });
const setupView = createSetupView({ setActiveView, viewState });

function normalizeUiServerType(type) {
    if (!type) return 'paper';
    if (type === 'papermc' || type === 'paper') return 'paper';
    if (type === 'purpur') return 'paper';
    return type;
}

const ramAllocationModalContainer = ramAllocationModalSelect?.closest('div');
const ramAllocationSettingsContainer = ramAllocationSettingsSelect?.closest('div');

function getAddonLabel(type) {
    if (type === 'fabric') return translate('modsLabel');
    return translate('pluginsButton');
}

function getAddonIcon(type) {
    if (type === 'fabric') return 'fa-flask';
    return 'fa-box-open';
}

function getServerTypeSuffix(type) {
    if (type === 'fabric') return translate('serverTypeModdedSuffix');
    return '';
}

function applyServerTypeUiState() {
    const toggleHidden = (element, hidden) => {
        if (!element) return;
        element.classList.toggle('hidden', hidden);
    };
    toggleHidden(ramAllocationModalContainer, false);
    toggleHidden(ramAllocationSettingsContainer, false);
}

function normalizeRamMax(rawGb) {
    const numeric = Number(rawGb);
    const rounded = Number.isFinite(numeric) ? Math.max(MIN_RAM_GB, numeric) : DEFAULT_MAX_RAM_GB;
    const stepped = Math.round(rounded / RAM_STEP_GB) * RAM_STEP_GB;
    return Math.max(MIN_RAM_GB, stepped);
}

function setRamSliderBounds(maxGb) {
    maxSystemRamGB = normalizeRamMax(maxGb);
    [
        { slider: ramAllocationModalSelect, label: ramAllocationModalValue, cache: ramModalUserValue },
        { slider: ramAllocationSettingsSelect, label: ramAllocationSettingsValue, cache: ramSettingsUserValue }
    ].forEach(({ slider, label, cache }) => {
        if (!slider) return;
        slider.min = MIN_RAM_GB;
        slider.max = maxSystemRamGB;
        slider.step = RAM_STEP_GB;
        const base = cache !== null && typeof cache !== 'undefined' ? cache : MIN_RAM_GB;
        slider.value = Math.min(maxSystemRamGB, Math.max(MIN_RAM_GB, base));
        slider.dataset.userDirty = cache !== null && typeof cache !== 'undefined' ? 'true' : 'false';
        renderRamSliderLabel(slider, label);
    });
    refreshRamSliderLabels();
}

function ramConfigToSliderValue(ramValue) {
    if (!ramValue || ramValue === 'auto') return MIN_RAM_GB;
    const lower = String(ramValue).toLowerCase();
    const numeric = parseFloat(lower.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(numeric)) return MIN_RAM_GB;
    const valueGb = lower.includes('g') ? numeric : (numeric / 1024);
    const clamped = Math.min(maxSystemRamGB, Math.max(MIN_RAM_GB, valueGb));
    const stepped = Math.round(clamped / RAM_STEP_GB) * RAM_STEP_GB;
    return Math.min(maxSystemRamGB, Math.max(MIN_RAM_GB, stepped));
}

function sliderValueToRamConfig(valueGb) {
    const effective = Number.isFinite(valueGb) ? valueGb : MIN_RAM_GB;
    if (effective <= MIN_RAM_GB) return `${Math.round(MIN_RAM_GB * 1024)}M`;
    const clamped = Math.max(MIN_RAM_GB, Math.min(effective, maxSystemRamGB));
    const mb = Math.round(clamped * 1024);
    return `${mb}M`;
}

function renderRamSliderLabel(slider, label) {
    if (!slider || !label) return;
    let value = parseFloat(slider.value);
    if (!Number.isFinite(value)) value = 0;

    if (value <= MIN_RAM_GB) {
        value = MIN_RAM_GB;
        slider.value = value;
    }
    if (value < MIN_RAM_GB) {
        value = MIN_RAM_GB;
        slider.value = value;
    }
    const display = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
    label.textContent = `${display} GB`;
}

function restoreRamSlider(slider, label, cachedValue, fallbackRam) {
    if (!slider || !label) return;
    const hasCache = cachedValue !== null && typeof cachedValue !== 'undefined';
    if (hasCache) {
        slider.value = cachedValue;
        slider.dataset.userDirty = 'true';
        renderRamSliderLabel(slider, label);
        return;
    }
    applyRamConfigToSlider(slider, label, fallbackRam, { force: true });
}

function applyRamConfigToSlider(slider, label, ramValue, { force = false } = {}) {
    if (!slider || !label) return;
    const isDirty = slider.dataset.userDirty === 'true';
    if (isDirty && !force) {
        renderRamSliderLabel(slider, label);
        return;
    }
    slider.dataset.userDirty = 'false';
    slider.value = ramConfigToSliderValue(ramValue);
    renderRamSliderLabel(slider, label);
}

function setRamAutoState({ isAuto, toggle, wrapper, slider, label, cacheSetter }) {
    if (toggle) toggle.checked = !!isAuto;
    if (wrapper) wrapper.classList.toggle('visible', !isAuto);
    if (isAuto) {
        if (slider) slider.dataset.userDirty = 'false';
        if (cacheSetter) cacheSetter(null);
        if (label) label.textContent = translate('ramAuto');
    } else if (slider && label) {
        renderRamSliderLabel(slider, label);
    }
}

function refreshRamSliderLabels() {
    if (ramAutoModalToggle?.checked) {
        if (ramAllocationModalValue) ramAllocationModalValue.textContent = translate('ramAuto');
    } else {
        renderRamSliderLabel(ramAllocationModalSelect, ramAllocationModalValue);
    }

    if (ramAutoSettingsToggle?.checked) {
        if (ramAllocationSettingsValue) ramAllocationSettingsValue.textContent = translate('ramAuto');
    } else {
        renderRamSliderLabel(ramAllocationSettingsSelect, ramAllocationSettingsValue);
    }
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
    const propsLabel = translate('serverPropsHeader');
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
        const uploadLabel = translate('uploadButton');
        uploadPluginButton.innerHTML = `<i class="fas fa-upload mr-1"></i>${uploadLabel}`;
        uploadPluginButton.title = uploadLabel;
    }
    if (openPluginsFolderButton) {
        const openFolderLabel = translate('openFolderButton');
        openPluginsFolderButton.innerHTML = `<i class="fas fa-folder-open mr-1"></i>${openFolderLabel}`;
        openPluginsFolderButton.title = openFolderLabel;
    }
}

function populateServerTypeSelect(selectEl, currentType) {
    if (!selectEl) return;
    const normalizedType = normalizeUiServerType(currentType);
    const options = [
        { value: 'paper', label: translate('serverTypeJavaDefault') },
        { value: 'fabric', label: translate('serverTypeJavaModded') }
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

        if (lang === 'en') {
            defaultTranslations = translations;
        } else if (!hasDefaultTranslations()) {
            await ensureDefaultTranslations();
        }

        currentTranslations = (lang === 'en')
            ? { ...defaultTranslations }
            : { ...defaultTranslations, ...translations };

        document.querySelectorAll('[data-key]').forEach(element => {
            const key = element.getAttribute('data-key');
            const localized = translate(key, element.textContent);
            if (localized) {
                element.textContent = localized;
            }
        });

        document.querySelectorAll('[data-key-placeholder]').forEach(element => {
            const key = element.getAttribute('data-key-placeholder');
            const localized = translate(key, element.placeholder);
            if (localized) {
                element.placeholder = localized;
            }
        });

        document.querySelectorAll('[data-key-aria-label]').forEach(element => {
            const key = element.getAttribute('data-key-aria-label');
            const localized = translate(key, element.getAttribute('aria-label') || '');
            if (localized) {
                element.setAttribute('aria-label', localized);
                if (!element.classList.contains('no-tooltip')) {
                    element.title = localized;
                } else {
                    element.removeAttribute('title');
                }
            }
        });

        const currentStatusKey = statusMessageSpan.dataset.key;
        if (currentStatusKey) {
            const localizedStatus = translate(currentStatusKey, statusMessageSpan.textContent);
            if (localizedStatus) {
                statusMessageSpan.textContent = localizedStatus;
            }
        }

        updatePluginsButtonAppearance(currentServerConfig?.serverType);

        const serverType = normalizeUiServerType(currentServerConfig?.serverType);
        populateServerTypeSelect(serverTypeModalSelect, serverType);
        populateServerTypeSelect(serverTypeSettingsSelect, serverType);
        
        if (mcVersionModalSelect && availableMcVersionsCache[serverType]) {
            const currentModalVersion = mcVersionModalSelect.value;
            await populateMcVersionSelect(mcVersionModalSelect, currentModalVersion, serverType);
        }
        if (mcVersionSettingsSelect && availableMcVersionsCache[serverType]) {
            const currentSettingsVersion = mcVersionSettingsSelect.value;
            await populateMcVersionSelect(mcVersionSettingsSelect, currentSettingsVersion, serverType);
        }

        renderAutoUpdateState();
        refreshRamSliderLabels();

    } catch (error) {
        addToConsole(`Could not apply language: ${error.message}`, 'ERROR');
    }
}

async function populateLanguageSelects() {
    let languages = [];
    try {
        languages = await window.electronAPI.getAvailableLanguages();
    } catch (error) {
        addToConsole(`Could not fetch languages: ${error.message}`, 'DEBUG');
    }
    if (!Array.isArray(languages) || !languages.length) {
        languages = [{ code: 'en', name: 'English' }];
    }
    
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

    if (languageModalSelect) languageModalSelect.innerHTML = '';
    if (languageJavaSelect) languageJavaSelect.innerHTML = '';
    if (languageSettingsSelect) languageSettingsSelect.innerHTML = '';

    languages.forEach(lang => {
        if (languageModalSelect) languageModalSelect.appendChild(createOption(lang));
        if (languageJavaSelect) languageJavaSelect.appendChild(createOption(lang).cloneNode(true));
        if (languageSettingsSelect) languageSettingsSelect.appendChild(createOption(lang).cloneNode(true));
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

function flashCopyFeedback(button) {
    if (!button) return;
    button.classList.add('copied');
    const icon = button.querySelector('i');
    if (icon) {
        icon.dataset.originalClass = icon.dataset.originalClass || icon.className;
        icon.className = 'fas fa-check';
    }
    setTimeout(() => {
        if (icon && icon.dataset.originalClass) icon.className = icon.dataset.originalClass;
        button.classList.remove('copied');
    }, 900);
}

async function copyTextToClipboardSafe(text) {
    if (!text) return false;
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch (_) { success = false; }
    textarea.remove();
    return success;
}

async function handleCopyIp(targetEl, button, labelKey) {
    if (!targetEl) return;
    const label = translate(labelKey);
    const resolvedLabel = label || labelKey || '';
    const value = (targetEl.textContent || '').trim();
    const invalid = !value || value === '-' || value.toLowerCase() === 'error' || value.toLowerCase().includes('fetching');
    if (invalid) {
        const notReady = formatTranslation('notReadyToCopy', { label: resolvedLabel }) || resolvedLabel;
        addToConsole(notReady, 'WARN');
        return;
    }
    const success = await copyTextToClipboardSafe(value);
    if (success) {
        flashCopyFeedback(button);
        const copiedMsg = formatTranslation('copiedToClipboard', { label: resolvedLabel }) || resolvedLabel;
        addToConsole(copiedMsg, 'SUCCESS');
    } else {
        const failureMsg = formatTranslation('copyFailed', { label: resolvedLabel }) || resolvedLabel;
        addToConsole(failureMsg, 'ERROR');
    }
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

    // Preserve version info on download success statuses without parentheses, e.g. "Purpur 1.21.11 downloaded successfully"
    if (key === 'downloadSuccess' && fallbackText) {
        const base = (key && currentTranslations[key]) ? currentTranslations[key] : '';
        const versionText = String(fallbackText).trim();
        if (base && versionText) {
            message = `${versionText} ${base}`;
        } else if (versionText) {
            message = versionText;
        } // if only base exists, message already set above
    }

    if (key === 'downloading' && typeof fallbackText === 'string') {
        const m = fallbackText.match(/\(([^)]+)\)/);
        if (m && m[1]) {
            const base = translate('downloading');
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
    downloadModalButtonIcon.className = 'fas fa-spinner spinner text-sm flex-shrink-0';
    downloadModalButtonText.textContent = currentTranslations['downloadingButton'] || 'Downloading...';
}

function hideDownloadLoading() {
    downloadModalButton.disabled = false;
    mcVersionModalSelect.disabled = false;
    ramAllocationModalSelect.disabled = false;
    downloadModalButtonIcon.className = 'fas fa-download text-sm flex-shrink-0';
    downloadModalButtonText.textContent = currentTranslations['downloadButton'] || 'Download Server';
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
        serverVersionSpan.textContent = translate('serverVersionPlaceholder');
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


function openSettingsView(callback) {
    return settingsView.open({ closeSetupView, closePluginsView }, callback);
}

function closeSettingsView(callback) {
    return settingsView.close(callback);
}

function closePluginsView(callback) {
    if (!pluginsPage) {
        if (typeof callback === 'function') callback();
        return;
    }
    if (!viewState.isPluginsViewOpen) {
        if (typeof callback === 'function') callback();
        return;
    }
    setActiveView('dashboard', callback);
}

function openSetupView(callback) {
    return setupView.open({ closeSettingsView, closePluginsView }, callback);
}

function closeSetupView(callback) {
    return setupView.close(callback);
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
        if (viewState.isSettingsViewOpen) closeSettingsView();
        if (viewState.isPluginsViewOpen) closePluginsView();
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
        restoreRamSlider(ramAllocationModalSelect, ramAllocationModalValue, ramModalUserValue, currentServerConfig.ram || 'auto');
        const modalIsAuto = !currentServerConfig.ram || currentServerConfig.ram === 'auto';
        setRamAutoState({ isAuto: modalIsAuto, toggle: ramAutoModalToggle, wrapper: ramAllocationModalWrapper, slider: ramAllocationModalSelect, label: ramAllocationModalValue, cacheSetter: (val) => { ramModalUserValue = val; } });
        updateButtonStates(localIsServerRunning);
    } else {
        if (viewState.isSettingsViewOpen) closeSettingsView();
        if (viewState.isPluginsViewOpen) closePluginsView();

        const afterClose = async () => {
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

    // Separate and sort properties: toggles first (alphabetical), then text inputs (alphabetical)
    const toggleProps = [];
    const textProps = [];
    
    for (const key in properties) {
        const value = properties[key];
        if (value === 'true' || value === 'false') {
            toggleProps.push({ key, value });
        } else {
            textProps.push({ key, value });
        }
    }
    
    toggleProps.sort((a, b) => a.key.localeCompare(b.key));
    textProps.sort((a, b) => a.key.localeCompare(b.key));
    
    const sortedProperties = [...toggleProps, ...textProps];

    for (const { key, value } of sortedProperties) {
        const propCard = document.createElement('div');
        propCard.className = 'bg-gray-700 rounded-md p-3';

        const label = document.createElement('label');
        label.textContent = key.replace(/-/g, ' ');
        label.className = 'block text-sm font-medium text-gray-300 capitalize mb-2';
        label.htmlFor = `prop-${key}`;

        let input;
        if (value === 'true' || value === 'false') {
            // Toggle switch for boolean values - keep on same line
            const propDiv = document.createElement('div');
            propDiv.className = 'flex items-center justify-between gap-3';
            
            label.className = 'text-sm text-gray-300 capitalize flex-1';
            label.classList.remove('block', 'mb-2', 'font-medium');
            
            const wrapper = document.createElement('label');
            wrapper.className = 'switch cursor-pointer';
            input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'sr-only';
            input.checked = value === 'true';
            input.id = `prop-${key}`;
            input.dataset.key = key;
            input.dataset.type = 'boolean';

            const track = document.createElement('div');
            track.className = 'switch-track';
            const thumb = document.createElement('div');
            thumb.className = 'switch-thumb';
            track.appendChild(thumb);
            wrapper.appendChild(input);
            wrapper.appendChild(track);

            propDiv.appendChild(label);
            propDiv.appendChild(wrapper);
            propCard.appendChild(propDiv);
            serverPropertiesContainer.appendChild(propCard);
            continue;
        }

        input = document.createElement('input');
        input.type = 'text';
        input.className = 'w-full bg-gray-600 border border-gray-500 text-gray-200 text-sm rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500';
        input.value = value;
        input.id = `prop-${key}`;
        input.dataset.key = key;
        
        propCard.appendChild(label);
        propCard.appendChild(input);
        serverPropertiesContainer.appendChild(propCard);
    }

    filterServerPropertiesCards(serverPropertiesSearch?.value || '');
}

function filterServerPropertiesCards(term = '') {
    if (!serverPropertiesContainer) return;
    const searchTerm = String(term || '').toLowerCase();
    const propCards = serverPropertiesContainer.querySelectorAll('.bg-gray-700');
    propCards.forEach(card => {
        const label = card.querySelector('label');
        if (!label) return;
        const propName = label.textContent.toLowerCase();
        card.style.display = (!searchTerm || propName.includes(searchTerm)) ? '' : 'none';
    });
}

// Server properties search functionality
if (serverPropertiesSearch) {
    serverPropertiesSearch.addEventListener('input', (e) => {
        filterServerPropertiesCards(e.target.value);
    });
}

downloadModalButton.addEventListener('click', () => {
    if (downloadModalButton.disabled) return;
    const version = mcVersionModalSelect.value;
    const isAuto = ramAutoModalToggle?.checked;
    const ram = isAuto ? 'auto' : sliderValueToRamConfig(parseFloat(ramAllocationModalSelect.value));
    const serverType = normalizeUiServerType(serverTypeModalSelect?.value);
    if (!version) {
        addToConsole(translate('noVersionSelected'), 'ERROR');
        return;
    }
    showDownloadLoading();
    window.electronAPI.configureServer({ serverType, mcVersion: version, ramAllocation: ram, javaArgs: 'Default' });
    if (ramAllocationModalSelect) {
        ramAllocationModalSelect.dataset.userDirty = 'false';
        ramModalUserValue = isAuto ? null : ramConfigToSliderValue(ram);
    }
});

pluginsFolderButton.addEventListener('click', async () => {
    if (pluginsFolderButton.disabled) return;
    await openPluginsView();
});

settingsButton.addEventListener('click', async () => {
    if (settingsButton.disabled) return;
    // Prevent interim clicks: pre-disable Choose until lock state is fetched
    if (chooseServerPathButton) {
        chooseServerPathButton.disabled = true;
        chooseServerPathButton.classList.add('btn-disabled');
    }
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
    const savedTheme = ensureThemeCode(launcherSettingsCache.theme || 'skypixel');
    applyThemeClass(savedTheme);
    if (themeSelect) themeSelect.value = savedTheme;

    const serverConfig = await window.electronAPI.getServerConfig();
    const currentType = normalizeUiServerType(serverConfig.serverType);
    // Load server path info
    try {
        const info = await window.electronAPI.getServerPathInfo();
        if (serverPathDisplay) serverPathDisplay.value = info.path || '';
        updateServerPathLockState(info.locked);
    } catch (e) { addToConsole(`Failed to load server path info: ${e.message}`, 'ERROR'); }
    populateServerTypeSelect(serverTypeSettingsSelect, currentType);
    serverTypeSettingsSelect.onchange = async () => {
        const selectedType = normalizeUiServerType(serverTypeSettingsSelect.value);
        await populateMcVersionSelect(mcVersionSettingsSelect, null, selectedType);
        applyServerTypeUiState(selectedType);
        updatePluginsButtonAppearance(selectedType);
    };
    await populateMcVersionSelect(mcVersionSettingsSelect, serverConfig.version, currentType);
    applyServerTypeUiState(currentType);
    restoreRamSlider(ramAllocationSettingsSelect, ramAllocationSettingsValue, ramSettingsUserValue, serverConfig.ram || 'auto');
    const settingsIsAuto = !serverConfig.ram || serverConfig.ram === 'auto';
    setRamAutoState({ isAuto: settingsIsAuto, toggle: ramAutoSettingsToggle, wrapper: ramAllocationSettingsWrapper, slider: ramAllocationSettingsSelect, label: ramAllocationSettingsValue, cacheSetter: (val) => { ramSettingsUserValue = val; } });
    updatePluginsButtonAppearance(serverConfig.serverType);
    // Ensure Server Configuration fields are locked during starting or running
    updateSettingsLockState(localIsServerRunning || isStarting);
    openSettingsView();
});

closeSettingsButton.addEventListener('click', () => closeSettingsView());

saveSettingsButton.addEventListener('click', async () => {
    const prevAutoStartEnabled = !!launcherSettingsCache.autoStartServer;
    const prevAutoStartDelay = launcherSettingsCache.autoStartDelay || 5;

    launcherSettingsCache.openAtLogin = startWithSystemCheckbox.checked;
    const autoStartEnabled = autoStartServerCheckbox.checked;
    const selectedAutoStartDelay = parseInt(autoStartDelaySlider.value, 10);
    launcherSettingsCache.autoStartServer = autoStartEnabled;
    launcherSettingsCache.autoStartDelay = selectedAutoStartDelay;
    const selectedLanguage = languageSettingsSelect.value;
    const prevLanguage = launcherSettingsCache.language || 'en';
    launcherSettingsCache.language = selectedLanguage;
    
    window.electronAPI.setSettings(launcherSettingsCache);
    // Performance mode is always on; no hardware detection or toggles remain.

    // Apply language only if it actually changed
    if (selectedLanguage !== prevLanguage) {
        try { await setLanguage(selectedLanguage); } catch (_) {}
    }
    
    const newProperties = {};
    serverPropertiesContainer.querySelectorAll('input, select').forEach(input => {
        const key = input.dataset.key;
        if (!key) return;
        if (input.type === 'checkbox' || input.dataset.type === 'boolean') {
            newProperties[key] = input.checked ? 'true' : 'false';
        } else {
            newProperties[key] = input.value;
        }
    });
    if (Object.keys(newProperties).length > 0) window.electronAPI.setServerProperties(newProperties);
    
    const newServerType = normalizeUiServerType(serverTypeSettingsSelect?.value);
    const newMcVersion = mcVersionSettingsSelect.value || '';
    const newRam = (ramAutoSettingsToggle?.checked) ? 'auto' : sliderValueToRamConfig(parseFloat(ramAllocationSettingsSelect?.value));
    const newJavaArgs = 'Default';
    const prevType = normalizeUiServerType(currentServerConfig?.serverType);
    const prevVersion = (currentServerConfig?.version) || '';
    const prevRam = (currentServerConfig?.ram) || 'auto';
    const prevJavaArgs = (currentServerConfig?.javaArgs) || 'Default';
    const requiresReconfigure = (
        newServerType !== prevType ||
        newMcVersion !== prevVersion ||
        newRam !== prevRam ||
        newJavaArgs !== prevJavaArgs
    );
    if (requiresReconfigure) {
        window.electronAPI.configureServer({ serverType: newServerType, mcVersion: newMcVersion, ramAllocation: newRam, javaArgs: newJavaArgs });
        if (ramAllocationSettingsSelect) {
            ramAllocationSettingsSelect.dataset.userDirty = 'false';
            ramSettingsUserValue = newRam === 'auto' ? null : ramConfigToSliderValue(newRam);
        }
    } else {
        // No reconfigure: refresh IPs so translated placeholders are replaced with actual values
        try { await fetchAndDisplayIPs(localIsServerRunning); } catch (_) {}
    }

    const shouldDeferAutoStart = requiresReconfigure || isDownloadingFromServer;
    const delayChanged = selectedAutoStartDelay !== prevAutoStartDelay;
    const countdownWasActive = autoStartIsActive || !!countdownInterval;
    const countdownNeedsRestart = !prevAutoStartEnabled || delayChanged || !countdownWasActive;
    if (autoStartEnabled) {
        if (shouldDeferAutoStart) {
            if (countdownWasActive) {
                cancelAutoStartCountdown('autoStartCancelled');
                addToConsole('Auto-start countdown cancelled while new server files download.', 'INFO');
            }
            if (countdownNeedsRestart || countdownWasActive) {
                queueAutoStartRequest(
                    selectedAutoStartDelay,
                    'initial',
                    'Auto-start countdown queued until server setup completes.',
                    'Server download complete. Restarting auto-start countdown.'
                );
            }
        } else if (!localIsServerRunning && !isStarting && !isStopping) {
            if (countdownNeedsRestart) {
                if (countdownWasActive) {
                    cancelAutoStartCountdown();
                }
                if (beginAutoStartCountdown(selectedAutoStartDelay, 'initial')) {
                    addToConsole(`Auto-start countdown scheduled in ${selectedAutoStartDelay}s.`, 'INFO');
                }
            }
        } else if (!prevAutoStartEnabled || delayChanged) {
            addToConsole('Auto-start enabled and will trigger after the current session ends.', 'INFO');
        }
    } else if (prevAutoStartEnabled || autoStartIsActive) {
        if (cancelAutoStartCountdown('autoStartCancelled')) {
            addToConsole('Auto-start countdown stopped via Settings.', 'INFO');
        }
    }
    
    addToConsole(requiresReconfigure ? "Settings saved and applied (reconfigured)." : "Settings saved.", "SUCCESS");
    closeSettingsView();
});

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
    // Keep non-critical settings enabled (autostart, notifications, theme, language, etc.)
}

ramAutoModalToggle?.addEventListener('change', () => {
    const isAuto = ramAutoModalToggle.checked;
    setRamAutoState({ isAuto, toggle: ramAutoModalToggle, wrapper: ramAllocationModalWrapper, slider: ramAllocationModalSelect, label: ramAllocationModalValue, cacheSetter: (val) => { ramModalUserValue = val; } });
});

ramAllocationModalSelect?.addEventListener('input', () => {
    if (ramAllocationModalSelect) {
        ramAllocationModalSelect.dataset.userDirty = 'true';
        let val = parseFloat(ramAllocationModalSelect.value);
        if (Number.isFinite(val) && val > 0 && val < MIN_RAM_GB) {
            val = MIN_RAM_GB;
            ramAllocationModalSelect.value = val;
        }
        ramModalUserValue = val;
    }
    renderRamSliderLabel(ramAllocationModalSelect, ramAllocationModalValue);
});

ramAutoSettingsToggle?.addEventListener('change', () => {
    const isAuto = ramAutoSettingsToggle.checked;
    setRamAutoState({ isAuto, toggle: ramAutoSettingsToggle, wrapper: ramAllocationSettingsWrapper, slider: ramAllocationSettingsSelect, label: ramAllocationSettingsValue, cacheSetter: (val) => { ramSettingsUserValue = val; } });
});

ramAllocationSettingsSelect?.addEventListener('input', () => {
    if (ramAllocationSettingsSelect) {
        ramAllocationSettingsSelect.dataset.userDirty = 'true';
        let val = parseFloat(ramAllocationSettingsSelect.value);
        if (Number.isFinite(val) && val > 0 && val < MIN_RAM_GB) {
            val = MIN_RAM_GB;
            ramAllocationSettingsSelect.value = val;
        }
        ramSettingsUserValue = val;
    }
    renderRamSliderLabel(ramAllocationSettingsSelect, ramAllocationSettingsValue);
});

chooseServerPathButton?.addEventListener('click', async () => {
    if (chooseServerPathButton.disabled || lockServerPathButton?.dataset.locked === 'true') return;
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

copyLocalIpButton?.addEventListener('click', () => handleCopyIp(localIpAddressSpan, copyLocalIpButton, 'localIpLabel'));
copyPublicIpButton?.addEventListener('click', () => handleCopyIp(publicIpAddressSpan, copyPublicIpButton, 'publicIpLabel'));


startButton.addEventListener('click', () => { 
    isStarting = true;
    startButton.disabled = true;
    startButton.classList.add('btn-disabled');
    // Immediately lock configuration while starting
    updateButtonStates(localIsServerRunning);
    window.electronAPI.startServer(); 
});

stopButton.addEventListener('click', () => { 
    isStopping = true;
    stopButton.disabled = true;
    stopButton.classList.add('btn-disabled');
    cancelAutoStartCountdown('autoStartCancelled');
    updateButtonStates(localIsServerRunning);
    window.electronAPI.stopServer(); 
});

// Command history management
let commandHistory = [];
let historyIndex = -1;

sendCommandButton.addEventListener('click', () => {
    const raw = commandInput.value.trim();
    if (raw && localIsServerRunning) {
        const sanitized = raw.startsWith('/') ? raw.slice(1) : raw;
        addToConsole(`> ${sanitized}`, 'CMD');
        window.electronAPI.sendCommand(sanitized);
        
        // Add to history (avoid duplicates of last command)
        if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== raw) {
            commandHistory.push(raw);
        }
        historyIndex = commandHistory.length;
        
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

checkUpdatesButton?.addEventListener('click', async () => {
    if (checkUpdatesButton.disabled) return;
    try {
        if (autoUpdateState.status === 'available') {
            setUpdateButtonState({ disabled: true, busy: true, mode: 'download' });
            autoUpdateState.status = 'downloading';
            autoUpdateState.percent = 0;
            autoUpdateState.bytesPerSecond = 0;
            renderAutoUpdateState();
            const response = await window.electronAPI.downloadUpdate();
            const responseReason = response?.reason;
            if (responseReason && responseReason !== 'started') {
                addToConsole(`Update download could not start: ${responseReason}`, 'WARN');
                if (responseReason === 'in-progress' || responseReason === 'download-in-progress') {
                    autoUpdateState.status = 'downloading';
                } else if (responseReason === 'no-update') {
                    autoUpdateState.status = 'up-to-date';
                } else if (responseReason === 'unsupported') {
                    autoUpdateState.status = 'unsupported';
                } else if (responseReason === 'error') {
                    autoUpdateState.status = 'error';
                    autoUpdateState.errorMessage = response?.error || responseReason;
                } else {
                    autoUpdateState.status = 'available';
                }
                renderAutoUpdateState();
            }
            return;
        }
        if (autoUpdateState.status === 'downloading' || autoUpdateState.status === 'installing') {
            return;
        }
        setUpdateButtonState({ disabled: true, busy: true, mode: 'check' });
        await window.electronAPI.checkForUpdates();
    } catch (error) {
        addToConsole(`Manual update action failed: ${error.message}`, 'ERROR');
        autoUpdateState.status = 'error';
        autoUpdateState.errorMessage = error.message;
        renderAutoUpdateState();
    }
});

commandInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (commandHistory.length > 0 && historyIndex > 0) {
            historyIndex--;
            commandInput.value = commandHistory[historyIndex];
        }
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            commandInput.value = commandHistory[historyIndex];
        } else if (historyIndex === commandHistory.length - 1) {
            historyIndex = commandHistory.length;
            commandInput.value = '';
        }
    }
});

commandInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') sendCommandButton.click(); });
minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

languageModalSelect.addEventListener('change', async (event) => {
    const newLang = event.target.value;
    // Apply immediately for Setup page so users can understand the interface
    launcherSettingsCache.language = newLang;
    window.electronAPI.setSettings(launcherSettingsCache);
    await setLanguage(newLang);
    // Mirror to other selectors
    if (languageSettingsSelect) languageSettingsSelect.value = newLang;
    if (languageJavaSelect) languageJavaSelect.value = newLang;
});

languageJavaSelect.addEventListener('change', async (event) => {
    const newLang = event.target.value;
    // Apply immediately for Java page since it's a standalone page
    launcherSettingsCache.language = newLang;
    window.electronAPI.setSettings(launcherSettingsCache);
    await setLanguage(newLang);
    // Mirror to other selectors
    if (languageModalSelect) languageModalSelect.value = newLang;
    if (languageSettingsSelect) languageSettingsSelect.value = newLang;
});

themeJavaSelect.addEventListener('change', (event) => {
    const newTheme = ensureThemeCode(event.target.value);
    // Apply immediately for Java page since it's a standalone page
    launcherSettingsCache.theme = newTheme;
    window.electronAPI.setSettings(launcherSettingsCache);
    applyThemeClass(newTheme);
    // Mirror to other selectors
    if (themeSelect) themeSelect.value = newTheme;
});

languageSettingsSelect.addEventListener('change', (event) => {
    const newLang = event.target.value;
    // Mirror selection only; do not apply or persist until Save & Apply
    if (languageModalSelect) languageModalSelect.value = newLang;
    if (languageJavaSelect) languageJavaSelect.value = newLang;
});

window.electronAPI.onWindowMaximized((isMaximized) => {
    maximizeBtnIcon.className = isMaximized ? 'far fa-window-restore' : 'far fa-square';
    const labelKey = isMaximized ? 'restoreButton' : 'maximizeButton';
    const label = translate(labelKey);
    maximizeBtn.setAttribute('data-key-aria-label', labelKey);
    maximizeBtn.setAttribute('aria-label', label);
    if (!maximizeBtn.classList.contains('no-tooltip')) {
        maximizeBtn.title = label;
    } else {
        maximizeBtn.removeAttribute('title');
    }
});

window.electronAPI.onUpdateConsole((message, type) => addToConsole(message, type));

window.electronAPI.onSetupFinished(async () => {
    isDownloadingFromServer = false;
    hideDownloadLoading();
    await refreshUISetupState();
    tryProcessPendingAutoStart();
});

window.electronAPI.onServerStateChange(async (isRunning) => {
    localIsServerRunning = isRunning;
    if (isRunning) {
        isStarting = false;
        autoStartIsActive = false;
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        pendingAutoStartRequest = null;
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

        renderMemoryUsage();
    } else {
        // Ensure starting/stopping flags reset so UI re-enables controls after crashes
        isStarting = false;
        isStopping = false;
        // Status și sunet sunt gestionate de main process prin sendStatus()
        await fetchAndDisplayIPs();
        lastMemoryGB = null;
        const allocated = parseFloat(allocatedRamCache);
        const hasAllocated = !Number.isNaN(allocated) && allocated > 0;
        memoryUsageSpan.textContent = hasAllocated
            ? formatTranslation('memoryUsageAllocatedPlaceholder', { allocated: allocatedRamCache })
            : translate('memoryUsagePlaceholder');
        memoryUsageSpan.style.color = '';
        serverTpsSpan.textContent = translate('latencyPlaceholder');
        serverTpsSpan.style.color = '';
        // NU resetăm allocatedRamCache aici - păstrăm valoarea pentru afișare
    }

    if (!isRunning) {
        tryProcessPendingAutoStart();
    }

    updateButtonStates(isRunning);
    if (!isRunning) {
        await refreshUISetupState();
    }
});

window.electronAPI.onUpdatePerformanceStats(({ memoryGB, allocatedRamGB, tps, latencyMs, mspt, cmdLatencyMs }) => {
    let shouldRenderMemory = false;
    if (typeof allocatedRamGB !== 'undefined' && allocatedRamGB !== null) {
        allocatedRamCache = allocatedRamGB;
        shouldRenderMemory = true;
    }

    if (typeof memoryGB !== 'undefined') {
        const memUsage = parseFloat(memoryGB);
        if (!Number.isNaN(memUsage)) {
            lastMemoryGB = memUsage;
            shouldRenderMemory = true;
        }
    }

    if (shouldRenderMemory) {
        renderMemoryUsage();
    }

    // Display command latency from /list response time (higher precision)
    if (typeof cmdLatencyMs !== 'undefined' && cmdLatencyMs !== null) {
        const ms = Math.max(0, parseFloat(cmdLatencyMs) || 0);
        const msText = ms >= 100 ? ms.toFixed(0) : ms.toFixed(1);
        serverTpsSpan.textContent = formatTranslation('latencyFormat', { value: msText });
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
        const safeLocal = (localIP !== '-' && localIP !== 'Error') ? localIP : 'localhost';
        localIpAddressSpan.textContent = showPort ? `${safeLocal}${port}` : safeLocal;
    } catch (error) { localIpAddressSpan.textContent = showPort ? `localhost${port}` : 'localhost'; }
    try {
        const publicIpResponse = await window.electronAPI.getPublicIP();
        let publicIP = publicIpResponse;
        let appendServerPort = true;
        let source = null;
        if (publicIpResponse && typeof publicIpResponse === 'object') {
            publicIP = publicIpResponse.address ?? '-';
            appendServerPort = publicIpResponse.includeServerPort !== false;
            source = publicIpResponse.source || null;
        }
        publicIP = publicIP || '-';
        if (source === 'offline' || publicIP === '-' || publicIP === 'Error') {
            publicIP = 'Offline';
            appendServerPort = false;
        }
        const shouldAppendPort = appendServerPort && publicIP !== 'Offline' && publicIP !== 'Error';
        publicIpAddressSpan.textContent = shouldAppendPort ? `${publicIP}${port}` : publicIP;
    } catch (error) { publicIpAddressSpan.textContent = 'Offline'; }
}

async function detectSystemMemoryGb() {
    try {
        const info = await window.electronAPI.getSystemMemory();
        const total = Number(info?.totalGB);
        if (Number.isFinite(total) && total > 0) return total;
    } catch (error) {
        addToConsole(`Could not read system memory: ${error.message}`, 'DEBUG');
    }
    const navMem = Number(navigator?.deviceMemory);
    if (Number.isFinite(navMem) && navMem > 0) return navMem;
    return DEFAULT_MAX_RAM_GB;
}

let loadingScreenActive = true;

const STARTUP_STAGE_DEFINITIONS = [
    {
        key: 'bootstrap',
        weight: 3,
        labelKey: 'loadingBootstrap',
        fallback: 'Preparing launcher services...',
        runner: bootstrapStartupStage
    },
    {
        key: 'preferences',
        weight: 2,
        labelKey: 'loadingApplyPreferences',
        fallback: 'Applying saved preferences...',
        runner: applyPreferencesStartupStage
    },
    {
        key: 'sync-state',
        weight: 3,
        labelKey: 'loadingSyncState',
        fallback: 'Loading server configuration...',
        runner: syncStateStartupStage
    },
    {
        key: 'finalize',
        weight: 1,
        labelKey: 'loadingFinalize',
        fallback: 'Finalizing dashboard...',
        runner: finalizeStartupStage
    }
];

const STARTUP_TOTAL_STAGE_WEIGHT = STARTUP_STAGE_DEFINITIONS.reduce((sum, stage) => sum + (stage.weight || 1), 0) || 1;
const startupDiagnostics = [];

function setLoadingText(fallbackText, translationKey = null, options = {}) {
    const preferFallback = Boolean(options?.preferFallback);
    const key = preferFallback ? null : (translationKey || loadingLauncherText?.dataset.key);
    const getter = () => {
        if (!key) return null;
        const localized = translate(key);
        return (localized && localized.trim()) ? localized : null;
    };
    loadingView.setText(
        fallbackText || translate('loadingLauncher'),
        preferFallback ? null : getter
    );
}

async function bootstrapStartupStage(state) {
    const iconPromise = window.electronAPI.getIconPath();
    const versionPromise = window.electronAPI.getAppVersion();
    const isDevPromise = (window.electronAPI.isDev ? window.electronAPI.isDev() : Promise.resolve(false)).catch(() => false);
    const settingsPromise = window.electronAPI.getSettings();
    const themesPromise = window.electronAPI.getAvailableThemes().catch(() => null);
    const pathInfoPromise = window.electronAPI.getServerPathInfo().catch(() => null);
    const systemMemoryPromise = detectSystemMemoryGb();

    const [iconPath, version, isDevRaw, settings, themes, pathInfo, systemMemoryGb] = await Promise.all([
        iconPromise,
        versionPromise,
        isDevPromise,
        settingsPromise,
        themesPromise,
        pathInfoPromise,
        systemMemoryPromise
    ]);

    state.bootstrap = {
        iconPath: iconPath || null,
        version: version || '?.?.?',
        isDev: !!isDevRaw,
        settings: settings || {},
        themes: Array.isArray(themes) ? themes : null,
        pathInfo: pathInfo || null,
        systemMemoryGb: systemMemoryGb || DEFAULT_MAX_RAM_GB
    };
}

async function applyPreferencesStartupStage(state) {
    const bootstrap = state.bootstrap || {};
    const iconTarget = document.getElementById('app-icon');
    if (iconTarget && bootstrap.iconPath) {
        iconTarget.src = bootstrap.iconPath;
    }

    setRamSliderBounds(bootstrap.systemMemoryGb || DEFAULT_MAX_RAM_GB);

    availableThemes = (bootstrap.themes && bootstrap.themes.length) ? bootstrap.themes : getFallbackThemes();
    rebuildThemeMap(availableThemes);
    populateThemeSelectors();

    launcherSettingsCache = bootstrap.settings || {};
    const savedTheme = ensureThemeCode(launcherSettingsCache.theme || 'skypixel');
    applyThemeClass(savedTheme);
    if (themeSelect) themeSelect.value = savedTheme;
    if (themeJavaSelect) themeJavaSelect.value = savedTheme;

    if (bootstrap.pathInfo) {
        if (serverPathDisplay && bootstrap.pathInfo.path) {
            serverPathDisplay.value = bootstrap.pathInfo.path;
        }
        updateServerPathLockState(!!bootstrap.pathInfo.locked);
    }

    await populateLanguageSelects();
    const savedLang = launcherSettingsCache.language || 'en';
    if (languageModalSelect) languageModalSelect.value = savedLang;
    if (languageSettingsSelect) languageSettingsSelect.value = savedLang;
    if (languageJavaSelect) languageJavaSelect.value = savedLang;
    await setLanguage(savedLang);

    const appName = translate('appTitle');
    const versionValue = bootstrap.version || '?.?.?';
    const versionText = formatTranslation('appVersionDisplay', { app: appName, version: versionValue }) || `${appName} v${versionValue}`;
    const devSuffix = bootstrap.isDev ? translate('appVersionDevSuffix') : '';
    const titleText = `${versionText}${devSuffix}`;
    document.title = titleText;
    const titleEl = document.getElementById('app-title-version');
    if (titleEl) {
        titleEl.textContent = titleText;
    }
}

async function syncStateStartupStage() {
    await refreshUISetupState();
}

async function finalizeStartupStage() {
    try {
        await fetchAndDisplayIPs(true);
    } catch (error) {
        addToConsole(`Could not refresh IP information during startup: ${error.message}`, 'DEBUG');
    }
}

async function runStartupStages(state) {
    const totalStages = STARTUP_STAGE_DEFINITIONS.length;
    for (let index = 0; index < totalStages; index++) {
        const stage = STARTUP_STAGE_DEFINITIONS[index];
        const startedAt = performance.now();
        const message = formatStartupStageMessage(stage, index, totalStages);
        setLoadingText(message, null, { preferFallback: true });
        try {
            await stage.runner(state);
            recordStartupDiagnostic(stage.key, 'success', performance.now() - startedAt);
        } catch (error) {
            recordStartupDiagnostic(stage.key, 'error', performance.now() - startedAt, error);
            addToConsole(`Startup stage "${stage.key}" failed: ${error.message}`, 'WARN');
        }
    }
}

function formatStartupStageMessage(stage, index, total) {
    const base = (stage.labelKey && currentTranslations[stage.labelKey])
        ? currentTranslations[stage.labelKey]
        : stage.fallback || 'Loading...';
    if (total <= 1) {
        return base;
    }
    return `[${index + 1}/${total}] ${base}`;
}

function recordStartupDiagnostic(stageKey, status, durationMs, error) {
    startupDiagnostics.push({
        key: stageKey,
        status,
        duration: Math.round(durationMs),
        error: error ? error.message : null
    });
}

function completeInitialLoading() {
    loadingView.hide();
    setTimeout(() => {
        loadingScreenActive = false;
        if (!localIsServerRunning) {
            setStatus(currentTranslations['launcherInitialized'] || 'Launcher initialized.', false, 'launcherInitialized');
        }
        window.electronAPI.appReadyToShow();
    }, 550);
}

async function initializeApp() {
    const startupState = {};
    try {
        loadingView.show();
        setLoadingText(currentTranslations['loadingLauncher'] || 'Loading Launcher...', 'loadingLauncher');
        await runStartupStages(startupState);
        setLoadingText(
            currentTranslations['launcherInitialized'] || 'Launcher initialized.',
            'launcherInitialized',
            { preferFallback: true }
        );
    } catch (error) {
        recordStartupDiagnostic('initializeApp', 'error', 0, error);
        addToConsole(`Initialization failed: ${error.message}`, 'ERROR');
        setStatus('Initialization Error!', false, 'error');
    } finally {
        completeInitialLoading();
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);

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

    const translatedOrFallback = (key && currentTranslations[key]) ? currentTranslations[key] : (message || '');
    const lowerMessage = String(translatedOrFallback).toLowerCase();

    if (lowerMessage.includes('downloading') || lowerMessage.includes('se descarcă')) {
        isDownloadingFromServer = true;
        updateButtonStates(localIsServerRunning);
    }

    if ((lowerMessage.includes('failed') || lowerMessage.includes('error')) && viewState.isSetupViewOpen) {
        hideDownloadLoading();
    }
});

window.electronAPI.onUpdaterEvent((payload) => {
    handleUpdaterEvent(payload || {});
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
            const messageKeyToUse = messageKey || 'autoStartingServer';
            const prefix = translate(messageKeyToUse);
            const suffix = formatTranslation('autoStartCountdownSuffix', { seconds: remaining });
            const message = `${prefix}${suffix}`;
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

function queueAutoStartRequest(delay, type, message, resumeMessage = null) {
    pendingAutoStartRequest = { delay, type, resumeMessage };
    if (message) {
        addToConsole(message, 'INFO');
    }
}

function tryProcessPendingAutoStart() {
    if (
        !pendingAutoStartRequest ||
        autoStartIsActive ||
        localIsServerRunning ||
        isStarting ||
        isStopping ||
        isDownloadingFromServer ||
        !(launcherSettingsCache?.autoStartServer)
    ) {
        return false;
    }
    const request = pendingAutoStartRequest;
    pendingAutoStartRequest = null;
    if (beginAutoStartCountdown(request.delay, request.type) && request.resumeMessage) {
        addToConsole(request.resumeMessage, 'INFO');
    }
    return true;
}

window.electronAPI.onStartCountdown((type, delay) => {
    addToConsole(`Received 'start-countdown' event. Type: ${type}, Delay: ${delay}`, 'INFO');
    if (!beginAutoStartCountdown(delay, type)) {
        queueAutoStartRequest(
            delay,
            type,
            'Auto-start countdown queued until the server is fully stopped.',
            'Server stopped. Resuming queued auto-start countdown.'
        );
    }
});

window.electronAPI.onJavaInstallRequired(() => {
    javaInstallMessage.textContent = currentTranslations['javaModalDescription'] || 'Java is not detected on your system. It is required to run the server.';
    javaInstallButton.classList.remove('hidden');
    javaInstallButton.disabled = false;
    javaInstallButton.classList.remove('btn-disabled');
    javaRestartButton.classList.add('hidden');
    javaInstallProgressBarContainer.classList.add('hidden');
    
    const existingSpinner = javaInstallButton.querySelector('.fa-spinner');
    if (existingSpinner) {
        existingSpinner.remove();
    }

    // Deschide pagina java în loc de modal
    setActiveView('java');
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
    
    const existingSpinner = javaPage?.querySelector('.fa-spinner');
    if (existingSpinner) {
        existingSpinner.remove();
    }

    if (lowerStatus.includes('downloading')) {
        javaInstallProgressBarContainer.classList.remove('hidden');
        javaInstallProgressBar.style.width = `${progress || 0}%`;
    } else if (lowerStatus.includes('installer has been launched')) {
        const spinner = document.createElement('i');
        spinner.className = 'fas fa-spinner fa-spin text-2xl accent-text mt-4';
        if (javaPage) javaPage.appendChild(spinner);
    } else if (lowerStatus.includes('error') || lowerStatus.includes('failed') || lowerStatus.includes('timed out')) {
        javaInstallButton.classList.remove('hidden');
        javaInstallButton.disabled = false;
        javaInstallButton.classList.remove('btn-disabled');
        javaRestartButton.classList.remove('hidden');
    }
});

// Prevent sound overlap - only one sound at a time
let currentAudio = null;

window.electronAPI.onPlaySound((payload) => {
    const normalizePayload = () => {
        if (!payload) return { url: null, volume: 0.32 };
        if (typeof payload === 'string') return { url: payload, volume: 0.32 };
        if (typeof payload === 'object') {
            const vol = Math.max(0, Math.min(1, Number(payload.volume ?? 0.32)));
            return { url: payload.url || null, volume: Number.isFinite(vol) ? vol : 0.32 };
        }
        return { url: null, volume: 0.32 };
    };

    const { url, volume } = normalizePayload();

    try {
        if (url) {
            // Stop current audio if playing
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
                currentAudio = null;
            }

            const audio = new Audio(url);
            audio.volume = volume;
            currentAudio = audio;

            // Clear reference when sound finishes
            audio.addEventListener('ended', () => {
                if (currentAudio === audio) {
                    currentAudio = null;
                }
            });

            audio.play().catch(() => {
                currentAudio = null;
                /* fallback below */
            });
            return;
        }
    } catch (_) {
        currentAudio = null;
    }
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
    if (viewState.isPluginsViewOpen) return;
    if (viewState.isSettingsViewOpen) {
        closeSettingsView(() => openPluginsView());
        return;
    }
    if (viewState.isSetupViewOpen) {
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
        const isModded = type === 'fabric';
        if (!plugins || plugins.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'text-gray-400 text-sm text-center py-4 font-medium';
            empty.textContent = isModded ? (currentTranslations['noModsFound'] || 'No mods found.') : (currentTranslations['noPluginsFound'] || 'No plugins found.');
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
            delBtn.addEventListener('click', async () => {
                if (localIsServerRunning) {
                    addToConsole(isModded ? (currentTranslations['stopBeforeDeletingMods'] || 'Stop the server before deleting mods.') : (currentTranslations['stopBeforeDeletingPlugins'] || 'Stop the server before deleting plugins.'), 'WARN');
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
    if (setupRequired) return;
    const isModded = currentServerConfig?.serverType === 'fabric';
    if (localIsServerRunning) {
        const warnMsg = isModded
            ? (currentTranslations['stopBeforeUploadingMods'] || 'Stop the server before uploading mods.')
            : (currentTranslations['stopBeforeUploadingPlugins'] || 'Stop the server before uploading plugins.');
        addToConsole(warnMsg, 'WARN');
        return;
    }

    try {
        loadingView.show(currentTranslations['uploadingLabel'] || 'Uploading...');
        const res = await window.electronAPI.uploadPlugins();
        if (!res.ok) {
            addToConsole(`Upload failed: ${res.error}`, 'ERROR');
        } else if (res.added?.length) {
            const label = getAddonLabel(currentServerConfig?.serverType).slice(0, -1).toLowerCase();
            addToConsole(`Uploaded ${label}: ${res.added.join(', ')}`, 'SUCCESS');
        }
        await refreshPluginsList();
        await populateServerProperties();
    } catch (error) {
        addToConsole(`Upload failed: ${error.message}`, 'ERROR');
    } finally {
        loadingView.hide();
        setTimeout(() => {
            loadingScreenActive = false;
            window.electronAPI.appReadyToShow();
        }, 300);
    }
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
                if (input.type === 'checkbox' || input.dataset.type === 'boolean') {
                    updatedProperties[input.dataset.key] = input.checked ? 'true' : 'false';
                } else {
                    updatedProperties[input.dataset.key] = input.value;
                }
            }
        });
        if (Object.keys(updatedProperties).length > 0) {
            window.electronAPI.setServerProperties(updatedProperties);
        }
    }
    closePluginsView();
});
function hexToRgbString(hexColor) {
    const hex = (hexColor || '').replace('#', '');
    if (hex.length !== 6) return '59, 130, 246';
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `${r}, ${g}, ${b}`;
}

function getFallbackThemes() {
    return [
        { code: 'skypixel', name: 'Skypixel Blue', colors: { primary: '#3b82f6', primaryHover: '#2563eb', accent: '#60a5fa' } },
        { code: 'nord', name: 'Nord', colors: { primary: '#88c0d0', primaryHover: '#81a1c1', accent: '#a3be8c' } },
        { code: 'aurora', name: 'Aurora', colors: { primary: '#06b6d4', primaryHover: '#0891b2', accent: '#a78bfa' } },
        { code: 'midnight', name: 'Midnight', colors: { primary: '#6366f1', primaryHover: '#4f46e5', accent: '#14b8a6' } },
        { code: 'emerald', name: 'Emerald', colors: { primary: '#22c55e', primaryHover: '#16a34a', accent: '#34d399' } },
        { code: 'sunset', name: 'Sunset', colors: { primary: '#f97316', primaryHover: '#ea580c', accent: '#fb7185' } },
        { code: 'crimson', name: 'Crimson', colors: { primary: '#ef4444', primaryHover: '#dc2626', accent: '#fca5a5' } },
        { code: 'ocean', name: 'Ocean', colors: { primary: '#0ea5e9', primaryHover: '#0284c7', accent: '#22d3ee' } },
        { code: 'grape', name: 'Grape', colors: { primary: '#8b5cf6', primaryHover: '#7c3aed', accent: '#d8b4fe' } },
        { code: 'neon', name: 'Neon', colors: { primary: '#22d3ee', primaryHover: '#06b6d4', accent: '#a3e635' } }
    ];
}

function rebuildThemeMap(themes) {
    themeMap = {};
    themes.forEach((t) => {
        if (t?.code) {
            themeMap[t.code] = {
                code: t.code,
                name: t.name || t.code,
                colors: {
                    primary: t.colors?.primary || '#3b82f6',
                    primaryHover: t.colors?.primaryHover || t.colors?.primary || '#2563eb',
                    accent: t.colors?.accent || t.colors?.primary || '#60a5fa'
                }
            };
        }
    });
}

function ensureThemeCode(code) {
    if (code && themeMap[code]) return code;
    if (themeMap['skypixel']) return 'skypixel';
    const first = availableThemes[0]?.code;
    return first || 'skypixel';
}

function populateThemeSelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    availableThemes.forEach((theme) => {
        const opt = document.createElement('option');
        opt.value = theme.code;
        opt.textContent = theme.name || theme.code;
        selectEl.appendChild(opt);
    });
}

function populateThemeSelectors() {
    populateThemeSelect(themeSelect);
    populateThemeSelect(themeJavaSelect);
}

function applyThemeClass(themeCode) {
    const code = ensureThemeCode(themeCode);
    const theme = themeMap[code] || getFallbackThemes()[0];
    const primary = theme.colors?.primary || '#3b82f6';
    const primaryHover = theme.colors?.primaryHover || primary;
    const accent = theme.colors?.accent || primary;
    const primaryRgb = hexToRgbString(primary);
    const root = document.documentElement;
    root.style.setProperty('--color-primary', primary);
    root.style.setProperty('--color-primary-hover', primaryHover);
    root.style.setProperty('--color-primary-rgb', primaryRgb);
    root.style.setProperty('--color-accent', accent);
    document.body.dataset.theme = code;
}

themeSelect.addEventListener('change', (e) => {
    const value = ensureThemeCode(e.target.value);
    applyThemeClass(value);
    launcherSettingsCache.theme = value;
    window.electronAPI.setSettings({ theme: value });
    if (themeJavaSelect) themeJavaSelect.value = value;
});
