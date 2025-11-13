/**
 * Logger utility with different log levels
 * @module utils/logger
 */

const log = require('electron-log');

/**
 * Log levels
 * @readonly
 * @enum {string}
 */
const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

/**
 * Enhanced logger with structured logging
 */
class Logger {
  constructor(context = 'App') {
    this.context = context;
    this.setupLogger();
  }

  setupLogger() {
    log.transports.file.level = 'info';
    log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
    log.transports.console.level = 'debug';
  }

  /**
   * Format log message with context
   * @private
   */
  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      context: this.context,
      message,
      ...metadata
    };
  }

  error(message, error = null, metadata = {}) {
    const logData = this.formatMessage(LogLevel.ERROR, message, metadata);
    if (error instanceof Error) {
      logData.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    }
    log.error(logData);
  }

  warn(message, metadata = {}) {
    log.warn(this.formatMessage(LogLevel.WARN, message, metadata));
  }

  info(message, metadata = {}) {
    log.info(this.formatMessage(LogLevel.INFO, message, metadata));
  }

  debug(message, metadata = {}) {
    log.debug(this.formatMessage(LogLevel.DEBUG, message, metadata));
  }

  /**
   * Create a child logger with extended context
   */
  child(additionalContext) {
    return new Logger(`${this.context}:${additionalContext}`);
  }
}

module.exports = { Logger, LogLevel };
