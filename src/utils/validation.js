/**
 * Input validation utilities
 * @module utils/validation
 */

/**
 * Sanitize and validate server command
 * @param {string} command - Raw command input
 * @returns {{valid: boolean, sanitized: string, error?: string}}
 */
function validateServerCommand(command) {
  if (typeof command !== 'string') {
    return { valid: false, sanitized: '', error: 'Command must be a string' };
  }

  const trimmed = command.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, sanitized: '', error: 'Command cannot be empty' };
  }

  if (trimmed.length > 1000) {
    return { valid: false, sanitized: '', error: 'Command too long (max 1000 chars)' };
  }

  // Remove dangerous characters for shell injection
  const sanitized = trimmed.replace(/[;&|`$()]/g, '');
  
  // Remove leading slash if present
  const finalCommand = sanitized.startsWith('/') ? sanitized.slice(1) : sanitized;

  return { valid: true, sanitized: finalCommand };
}

/**
 * Validate file path to prevent directory traversal
 * @param {string} filePath - File path to validate
 * @param {string} baseDir - Base directory
 * @returns {{valid: boolean, error?: string}}
 */
function validateFilePath(filePath, baseDir) {
  const path = require('path');
  
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'Invalid file path' };
  }

  // Check for path traversal attempts
  if (filePath.includes('..') || filePath.includes('~')) {
    return { valid: false, error: 'Path traversal detected' };
  }

  const resolved = path.resolve(baseDir, filePath);
  const normalizedBase = path.resolve(baseDir);

  if (!resolved.startsWith(normalizedBase)) {
    return { valid: false, error: 'Path outside allowed directory' };
  }

  return { valid: true };
}

/**
 * Validate plugin/mod file name
 * @param {string} fileName - File name to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validatePluginFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return { valid: false, error: 'Invalid file name' };
  }

  // Check for path separators
  if (fileName.includes('/') || fileName.includes('\\')) {
    return { valid: false, error: 'File name cannot contain path separators' };
  }

  // Check for dangerous patterns
  if (fileName.includes('..') || fileName.startsWith('.')) {
    return { valid: false, error: 'Invalid file name pattern' };
  }

  // Must end with .jar
  if (!fileName.toLowerCase().endsWith('.jar')) {
    return { valid: false, error: 'File must be a JAR file' };
  }

  return { valid: true };
}

/**
 * Validate RAM allocation string
 * @param {string} ramString - RAM allocation (e.g., "2048M", "4G")
 * @returns {{valid: boolean, error?: string}}
 */
function validateRamAllocation(ramString) {
  if (ramString === 'auto') {
    return { valid: true };
  }

  if (typeof ramString !== 'string') {
    return { valid: false, error: 'RAM allocation must be a string' };
  }

  const ramPattern = /^(\d+)(M|G)$/;
  const match = ramString.match(ramPattern);

  if (!match) {
    return { valid: false, error: 'Invalid RAM format. Use format like "2048M" or "4G"' };
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  // Minimum 512MB
  const minMB = 512;
  const maxMB = 32 * 1024; // 32GB

  const valueInMB = unit === 'G' ? value * 1024 : value;

  if (valueInMB < minMB) {
    return { valid: false, error: `RAM allocation too low (minimum ${minMB}MB)` };
  }

  if (valueInMB > maxMB) {
    return { valid: false, error: `RAM allocation too high (maximum ${maxMB}MB)` };
  }

  return { valid: true };
}

/**
 * Validate Minecraft version string
 * @param {string} version - Version string (e.g., "1.20.1")
 * @returns {{valid: boolean, error?: string}}
 */
function validateMinecraftVersion(version) {
  if (!version || typeof version !== 'string') {
    return { valid: false, error: 'Invalid version' };
  }

  const versionPattern = /^(\d+)\.(\d+)(\.(\d+))?$/;
  const match = version.match(versionPattern);

  if (!match) {
    return { valid: false, error: 'Invalid version format. Expected format: X.Y or X.Y.Z' };
  }

  return { valid: true };
}

module.exports = {
  validateServerCommand,
  validateFilePath,
  validatePluginFileName,
  validateRamAllocation,
  validateMinecraftVersion
};
