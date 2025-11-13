/**
 * Configuration file management service
 * @module services/ConfigManager
 */

const fs = require('fs');
const path = require('path');
const { Logger } = require('../utils/logger');

const logger = new Logger('ConfigManager');

/**
 * Manages reading and writing of JSON configuration files
 */
class ConfigManager {
  constructor(basePath) {
    this.basePath = basePath;
    this.cache = new Map();
  }

  /**
   * Read JSON file with error handling and caching
   * @param {string} fileName - Name of the file
   * @param {boolean} useCache - Whether to use cached version
   * @returns {Object} Parsed JSON object
   */
  readJSONFile(fileName, useCache = true) {
    const filePath = path.join(this.basePath, fileName);

    if (useCache && this.cache.has(fileName)) {
      return this.cache.get(fileName);
    }

    try {
      if (!fs.existsSync(filePath)) {
        logger.debug(`File does not exist: ${fileName}`);
        return {};
      }

      const fileData = fs.readFileSync(filePath, 'utf8');
      
      if (fileData.trim() === '') {
        logger.debug(`File is empty: ${fileName}`);
        return {};
      }

      const parsed = JSON.parse(fileData);
      this.cache.set(fileName, parsed);
      
      return parsed;
    } catch (error) {
      logger.error(`Error reading ${fileName}`, error);
      return {};
    }
  }

  /**
   * Write JSON file with atomic write and backup
   * @param {string} fileName - Name of the file
   * @param {Object} data - Data to write
   * @param {boolean} createBackup - Whether to create backup
   * @returns {boolean} Success status
   */
  writeJSONFile(fileName, data, createBackup = false) {
    const filePath = path.join(this.basePath, fileName);
    const tempPath = filePath + '.tmp';
    const backupPath = filePath + '.backup';

    try {
      // Create backup if requested and file exists
      if (createBackup && fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupPath);
      }

      // Write to temporary file first (atomic write)
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');

      // Rename temp file to actual file
      fs.renameSync(tempPath, filePath);

      // Update cache
      this.cache.set(fileName, data);

      logger.debug(`Successfully wrote ${fileName}`);
      return true;
    } catch (error) {
      logger.error(`Error writing ${fileName}`, error);

      // Cleanup temp file if it exists
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temp file', cleanupError);
      }

      return false;
    }
  }

  /**
   * Update specific fields in JSON file
   * @param {string} fileName - Name of the file
   * @param {Object} updates - Fields to update
   * @returns {boolean} Success status
   */
  updateJSONFile(fileName, updates) {
    const current = this.readJSONFile(fileName, false);
    const merged = { ...current, ...updates };
    return this.writeJSONFile(fileName, merged, true);
  }

  /**
   * Delete JSON file
   * @param {string} fileName - Name of the file
   * @returns {boolean} Success status
   */
  deleteJSONFile(fileName) {
    const filePath = path.join(this.basePath, fileName);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.cache.delete(fileName);
        logger.info(`Deleted ${fileName}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Error deleting ${fileName}`, error);
      return false;
    }
  }

  /**
   * Check if file exists
   * @param {string} fileName - Name of the file
   * @returns {boolean}
   */
  fileExists(fileName) {
    const filePath = path.join(this.basePath, fileName);
    return fs.existsSync(filePath);
  }

  /**
   * Clear cache for specific file or all files
   * @param {string} fileName - Optional file name to clear
   */
  clearCache(fileName = null) {
    if (fileName) {
      this.cache.delete(fileName);
      logger.debug(`Cleared cache for ${fileName}`);
    } else {
      this.cache.clear();
      logger.debug('Cleared all cache');
    }
  }

  /**
   * Restore from backup
   * @param {string} fileName - Name of the file
   * @returns {boolean} Success status
   */
  restoreFromBackup(fileName) {
    const filePath = path.join(this.basePath, fileName);
    const backupPath = filePath + '.backup';

    try {
      if (!fs.existsSync(backupPath)) {
        logger.warn(`No backup found for ${fileName}`);
        return false;
      }

      fs.copyFileSync(backupPath, filePath);
      this.clearCache(fileName);
      
      logger.info(`Restored ${fileName} from backup`);
      return true;
    } catch (error) {
      logger.error(`Failed to restore ${fileName} from backup`, error);
      return false;
    }
  }
}

module.exports = { ConfigManager };
