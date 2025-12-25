/**
 * Notification Service - Desktop notifications with fallback
 * @module services/NotificationService
 */

const { Notification, app } = require('electron');

/**
 * Notification service with fallback mechanisms
 */
class NotificationService {
  constructor() {
    this.isSupported = false;
    this.hasPermission = false;
    this.isEnabled = true;
    this.fallbackCallback = null;
    this.soundCallback = null;
    
    this.initialize();
  }

  /**
   * Initialize notification system
   */
  initialize() {
    try {
      // Check if Notification API is available
      if (typeof Notification === 'undefined') {
        this.isSupported = false;
        return;
      }

      // Check if notifications are supported
      if (!Notification.isSupported()) {
        this.isSupported = false;
        return;
      }

      this.isSupported = true;
      
      // Wait for app ready to check permissions
      if (app.isReady()) {
        this.checkPermissions();
      } else {
        app.whenReady().then(() => this.checkPermissions());
      }
    } catch (error) {
      this.isSupported = false;
    }
  }

  /**
   * Check and request notification permissions
   */
  async checkPermissions() {
    try {
      // On Linux, permissions are usually granted by default
      // On Windows, no permission needed
      // On macOS, we need to check
      if (process.platform === 'darwin') {
        // Check current permission status (not all Electron versions support this)
        this.hasPermission = true; // Assume granted on macOS
      } else {
        this.hasPermission = true;
      }
    } catch (error) {
      this.hasPermission = true; // Assume granted
    }
  }

  /**
   * Set fallback callback for when notifications fail
   * @param {Function} callback - Callback(title, body, options)
   */
  setFallbackCallback(callback) {
    this.fallbackCallback = callback;
  }

  /**
   * Set sound callback
   * @param {Function} callback - Callback(soundType)
   */
  setSoundCallback(callback) {
    this.soundCallback = callback;
  }

  /**
   * Set whether notifications are enabled
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  /**
   * Show desktop notification with fallback
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} options - Additional options
   * @returns {boolean} Success status
   */
  show(title, body, options = {}) {
    try {
      const normalizedOptions = { ...options };
      // Check if notifications are enabled
      if (!this.isEnabled) {
        return false;
      }

      // Check support
      if (!this.isSupported) {
        this.useFallback(title, body, normalizedOptions);
        return false;
      }

      // Check permissions
      if (!this.hasPermission) {
        this.useFallback(title, body, normalizedOptions);
        return false;
      }

      // Get icon path
      const iconPath = options.icon || this.getIconPath();

      // Create and show notification
      const notification = new Notification({
        title,
        body,
        icon: iconPath,
        silent: normalizedOptions.silent || false,
        urgency: normalizedOptions.urgency || 'normal',
        timeoutType: normalizedOptions.timeoutType || 'default'
      });

      // Handle click event
      if (normalizedOptions.onClick) {
        notification.on('click', normalizedOptions.onClick);
      }

      // Handle close event
      notification.on('close', () => {
        // Silent close
      });

      // Handle show event
      notification.on('show', () => {
        // Silent show
      });

      // Handle failed event
      notification.on('failed', () => {
        this.useFallback(title, body, normalizedOptions);
      });

      notification.show();

      // Play sound if callback is set; allow explicit override when provided
      if (this.soundCallback && !normalizedOptions.silent) {
        const explicitType = (normalizedOptions.soundType || '').trim();
        const soundType = explicitType || this.determineSoundType(title, body);
        this.soundCallback(soundType);
      }

      return true;

    } catch (error) {
      this.useFallback(title, body, options || {});
      return false;
    }
  }

  /**
   * Use fallback method (send to renderer)
   * @private
   */
  useFallback(title, body, options = {}) {
    if (this.fallbackCallback) {
      try {
        this.fallbackCallback(title, body, options);
      } catch (error) {
        // Silent error - fallback failed
      }
    }
  }

  /**
   * Get icon path based on platform
   * @private
   */
  getIconPath() {
    const path = require('path');
    const fs = require('fs');

    try {
      const platform = process.platform;
      const isDev = !app.isPackaged;
      const appPath = app.getAppPath();
      const resources = process.resourcesPath;
      const buildDir = path.join(appPath, 'build');

      let iconPaths = [];

      if (platform === 'win32') {
        iconPaths = [
          path.join(resources, 'icon.ico'),
          path.join(buildDir, 'icon.ico'),
          path.join(appPath, 'build', 'icon.ico'),
          path.join(appPath, 'icon.ico')
        ];
      } else if (platform === 'darwin') {
        iconPaths = [
          path.join(resources, 'icon.icns'),
          path.join(buildDir, 'icon.icns'),
          path.join(appPath, 'build', 'icon.icns'),
          path.join(appPath, 'icon.icns')
        ];
      } else { // Linux
        iconPaths = [
          path.join(resources, 'icon.png'),
          path.join(buildDir, 'icon.png'),
          path.join(appPath, 'build', 'icon.png'),
          path.join(appPath, 'icon.png'),
          '/usr/share/pixmaps/server-launcher.png',
          path.join(app.getPath('home'), '.local/share/icons/server-launcher.png')
        ];
      }

      // Find first existing icon
      for (const iconPath of iconPaths) {
        if (fs.existsSync(iconPath)) {
          return iconPath;
        }
      }

      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Determine sound type based on notification content
   * @private
   */
  determineSoundType(title, body) {
    const text = `${title} ${body}`.toLowerCase();

    const errorKeywords = ['error', 'failed', 'fail', 'crash', 'stopped unexpectedly', 'not found'];
    const successKeywords = [
      'success',
      'ready',
      'started',
      'running',
      'completed',
      'installed',
      'stopped',
      'shutdown complete',
      'server stopped',
      'server shutdown',
      'server oprit'
    ];

    if (errorKeywords.some(keyword => text.includes(keyword))) {
      return 'error';
    }

    if (successKeywords.some(keyword => text.includes(keyword))) {
      return 'success';
    }

    return 'status';
  }

  /**
   * Show success notification
   */
  showSuccess(title, body, options = {}) {
    return this.show(title, body, { ...options, urgency: 'normal' });
  }

  /**
   * Show error notification
   */
  showError(title, body, options = {}) {
    return this.show(title, body, { ...options, urgency: 'critical' });
  }

  /**
   * Show info notification
   */
  showInfo(title, body, options = {}) {
    return this.show(title, body, { ...options, urgency: 'low' });
  }

  /**
   * Get notification status
   */
  getStatus() {
    return {
      supported: this.isSupported,
      hasPermission: this.hasPermission,
      enabled: this.isEnabled,
      platform: process.platform
    };
  }
}

module.exports = NotificationService;
