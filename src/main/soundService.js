const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SOUND_CANDIDATES = {
  error: ['error.mp3', 'error.wav'],
  startup: ['startup.mp3', 'startup.wav'],
  status: ['status.mp3', 'status.wav'],
  success: ['success.mp3', 'success.wav']
};
const SOUND_BASE_VOLUME = 0.32;
const SOUND_VOLUME_MAP = {
  startup: 0.35,
  success: 0.32,
  status: 0.32,
  error: 0.34
};
const DEFAULT_SOUND_TYPE = 'status';
const SOUND_SEARCH_DIRS = ['', 'sounds'];
const ERROR_SOUND_KEYWORDS = ['error', 'failed', 'fail', 'not found', 'crash', 'stopped unexpectedly', 'timed out', 'unavailable', 'unable'];
const SUCCESS_SOUND_KEYWORDS = ['success', 'successfully', 'ready', 'completed', 'installed', 'configured', 'downloaded', 'server started', 'server ready', 'done'];

function createSoundService({ getMainWindow, readLauncherSettings, safeSend }) {
  let lastStatusSoundSignature = null;
  let lastStatusSoundAt = 0;
  let lastPlaySoundAt = 0;
  let lastPlaySoundType = null;

  const resolveAssetFile = (relativePath) => {
    try {
      const resources = process.resourcesPath;
      const buildDir = path.join(__dirname, '..', 'build');
      const candidateFromResources = path.join(resources, relativePath);
      if (fs.existsSync(candidateFromResources)) return candidateFromResources;
      const candidateFromBuild = path.join(buildDir, relativePath);
      if (fs.existsSync(candidateFromBuild)) return candidateFromBuild;
    } catch (_) {}
    return null;
  };

  const getSoundFilePath = (type) => {
    const canonicalType = SOUND_CANDIDATES[type] ? type : DEFAULT_SOUND_TYPE;
    const candidates = SOUND_CANDIDATES[canonicalType] || [];
    for (const candidate of candidates) {
      for (const dir of SOUND_SEARCH_DIRS) {
        const relativePath = dir ? path.join(dir, candidate) : candidate;
        const resolved = resolveAssetFile(relativePath);
        if (resolved) return resolved;
      }
    }
    if (canonicalType !== DEFAULT_SOUND_TYPE) {
      return getSoundFilePath(DEFAULT_SOUND_TYPE);
    }
    return null;
  };

  const playSoundEffect = (requestedType = DEFAULT_SOUND_TYPE) => {
    const type = SOUND_CANDIDATES[requestedType] ? requestedType : DEFAULT_SOUND_TYPE;
    const now = Date.now();
    if (type === lastPlaySoundType && (now - lastPlaySoundAt) < 500) {
      return;
    }
    lastPlaySoundType = type;
    lastPlaySoundAt = now;
    let win = null;
    try {
      const settings = typeof readLauncherSettings === 'function' ? readLauncherSettings() : null;
      if (settings && settings.notificationsEnabled === false) return;
      const soundPath = getSoundFilePath(type);
      win = typeof getMainWindow === 'function' ? getMainWindow() : null;
      if (!win || win.isDestroyed()) return;
      const volume = Math.max(0, Math.min(1, SOUND_VOLUME_MAP[type] ?? SOUND_BASE_VOLUME));
      const payload = soundPath ? { url: pathToFileURL(soundPath).href, type, volume } : { url: null, type, volume };
      if (typeof safeSend === 'function') {
        safeSend(win, 'play-sound', payload);
      }
    } catch (_) {
      if (!win && typeof getMainWindow === 'function') win = getMainWindow();
      if (typeof safeSend === 'function') {
        safeSend(win, 'play-sound', { url: null, type: requestedType, volume: SOUND_BASE_VOLUME });
      }
    }
  };

  const stringContainsKeyword = (text, keywords) => {
    if (!text) return false;
    return keywords.some(keyword => text.includes(keyword));
  };

  const isProgressStatusMessage = (message, key) => {
    if (!message && !key) return false;
    if (message && /\d{1,3}%/.test(message)) return true;
    if (message && /\b\d+(\.\d+)?\s?(kb|mb|gb)(\/s)?\b/.test(message)) return true;
    if (message && message.includes('download speed')) return true;
    return false;
  };

  const handleStatusSound = (fallbackMessage, translationKey, pulse, soundType = null) => {
    try {
      if (soundType) {
        playSoundEffect(soundType);
        return;
      }

      const message = (fallbackMessage || '').toLowerCase();
      const key = (translationKey || '').toLowerCase();
      if (!message && !key) return;
      if (isProgressStatusMessage(message, key)) return;

      const signature = key || message;
      const now = Date.now();
      if (signature && signature === lastStatusSoundSignature && (now - lastStatusSoundAt) < 1500) {
        return;
      }

      const stopSuccess =
        key === 'serverstopped' ||
        key === 'servershutdowncomplete' ||
        message.includes('server stopped') ||
        message.includes('server oprit');
      const stopUnexpected = key === 'serverstoppedunexpectedly' || message.includes('unexpectedly');

      if (stopUnexpected) {
        playSoundEffect('error');
      } else if (stopSuccess) {
        playSoundEffect('success');
      } else if (stringContainsKeyword(key, ERROR_SOUND_KEYWORDS) || stringContainsKeyword(message, ERROR_SOUND_KEYWORDS)) {
        playSoundEffect('error');
      } else if (stringContainsKeyword(key, SUCCESS_SOUND_KEYWORDS) || stringContainsKeyword(message, SUCCESS_SOUND_KEYWORDS)) {
        playSoundEffect('success');
      } else {
        playSoundEffect('status');
      }

      if (signature) {
        lastStatusSoundSignature = signature;
        lastStatusSoundAt = now;
      }
    } catch (_) {}
  };

  return {
    DEFAULT_SOUND_TYPE,
    handleStatusSound,
    playSoundEffect,
  };
}

module.exports = {
  createSoundService,
};
