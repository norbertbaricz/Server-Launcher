/**
 * Resource cleanup utilities
 * @module utils/cleanup
 */

const { Logger } = require('./logger');
const logger = new Logger('Cleanup');

/**
 * Manages cleanup of intervals, processes, and event listeners
 */
class CleanupManager {
  constructor() {
    this.intervals = new Map();
    this.timeouts = new Map();
    this.processes = new Map();
    this.eventListeners = new Map();
  }

  /**
   * Register an interval for cleanup
   * @param {string} name - Identifier for the interval
   * @param {NodeJS.Timeout} interval - Interval to register
   */
  registerInterval(name, interval) {
    if (this.intervals.has(name)) {
      this.clearInterval(name);
    }
    this.intervals.set(name, interval);
    logger.debug(`Registered interval: ${name}`);
  }

  /**
   * Clear a specific interval
   * @param {string} name - Identifier of the interval
   */
  clearInterval(name) {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
      logger.debug(`Cleared interval: ${name}`);
    }
  }

  /**
   * Register a timeout for cleanup
   * @param {string} name - Identifier for the timeout
   * @param {NodeJS.Timeout} timeout - Timeout to register
   */
  registerTimeout(name, timeout) {
    if (this.timeouts.has(name)) {
      this.clearTimeout(name);
    }
    this.timeouts.set(name, timeout);
    logger.debug(`Registered timeout: ${name}`);
  }

  /**
   * Clear a specific timeout
   * @param {string} name - Identifier of the timeout
   */
  clearTimeout(name) {
    const timeout = this.timeouts.get(name);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(name);
      logger.debug(`Cleared timeout: ${name}`);
    }
  }

  /**
   * Register a child process for cleanup
   * @param {string} name - Identifier for the process
   * @param {ChildProcess} process - Process to register
   */
  registerProcess(name, process) {
    if (this.processes.has(name)) {
      this.killProcess(name);
    }
    this.processes.set(name, process);
    logger.debug(`Registered process: ${name}`);
  }

  /**
   * Kill a specific process
   * @param {string} name - Identifier of the process
   */
  killProcess(name) {
    const process = this.processes.get(name);
    if (process && !process.killed) {
      try {
        process.kill();
        logger.debug(`Killed process: ${name}`);
      } catch (error) {
        logger.error(`Failed to kill process: ${name}`, error);
      }
      this.processes.delete(name);
    }
  }

  /**
   * Register an event listener for cleanup
   * @param {string} name - Identifier for the listener
   * @param {Object} emitter - Event emitter
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  registerEventListener(name, emitter, event, handler) {
    this.eventListeners.set(name, { emitter, event, handler });
    logger.debug(`Registered event listener: ${name}`);
  }

  /**
   * Remove a specific event listener
   * @param {string} name - Identifier of the listener
   */
  removeEventListener(name) {
    const listener = this.eventListeners.get(name);
    if (listener) {
      listener.emitter.removeListener(listener.event, listener.handler);
      this.eventListeners.delete(name);
      logger.debug(`Removed event listener: ${name}`);
    }
  }

  /**
   * Clear all registered intervals
   */
  clearAllIntervals() {
    for (const name of this.intervals.keys()) {
      this.clearInterval(name);
    }
    logger.info('Cleared all intervals');
  }

  /**
   * Clear all registered timeouts
   */
  clearAllTimeouts() {
    for (const name of this.timeouts.keys()) {
      this.clearTimeout(name);
    }
    logger.info('Cleared all timeouts');
  }

  /**
   * Kill all registered processes
   */
  killAllProcesses() {
    for (const name of this.processes.keys()) {
      this.killProcess(name);
    }
    logger.info('Killed all processes');
  }

  /**
   * Remove all event listeners
   */
  removeAllEventListeners() {
    for (const name of this.eventListeners.keys()) {
      this.removeEventListener(name);
    }
    logger.info('Removed all event listeners');
  }

  /**
   * Cleanup all resources
   */
  cleanupAll() {
    logger.info('Starting full cleanup...');
    this.clearAllIntervals();
    this.clearAllTimeouts();
    this.killAllProcesses();
    this.removeAllEventListeners();
    logger.info('Cleanup complete');
  }
}

module.exports = { CleanupManager };
