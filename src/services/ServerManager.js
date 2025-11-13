/**
 * Server process management service
 * @module services/ServerManager
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const pidusage = require('pidusage');
const { Logger } = require('../utils/logger');
const { CleanupManager } = require('../utils/cleanup');
const { validateServerCommand } = require('../utils/validation');

const logger = new Logger('ServerManager');

/**
 * Server types
 * @readonly
 * @enum {string}
 */
const ServerType = {
  PAPER: 'papermc',
  FABRIC: 'fabric',
  BEDROCK: 'bedrock'
};

/**
 * Server state
 * @readonly
 * @enum {string}
 */
const ServerState = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error'
};

/**
 * Manages Minecraft server lifecycle and monitoring
 */
class ServerManager {
  constructor(serverFilesDir, javaExecutablePath, getCleanEnvForJava) {
    this.serverFilesDir = serverFilesDir;
    this.javaExecutablePath = javaExecutablePath;
    this.getCleanEnvForJava = getCleanEnvForJava;
    
    this.serverProcess = null;
    this.state = ServerState.STOPPED;
    this.cleanup = new CleanupManager();
    
    this.eventHandlers = {
      onConsoleOutput: null,
      onStateChange: null,
      onPerformanceStats: null,
      onError: null
    };
    
    this.performanceMonitoringEnabled = false;
    this.serverIsFullyStarted = false;
  }

  /**
   * Get current server state
   * @returns {string} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Check if server is running
   * @returns {boolean}
   */
  isRunning() {
    return this.state === ServerState.RUNNING;
  }

  /**
   * Set event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (event in this.eventHandlers) {
      this.eventHandlers[event] = handler;
    }
  }

  /**
   * Emit event
   * @private
   */
  emit(event, ...args) {
    if (this.eventHandlers[event]) {
      try {
        this.eventHandlers[event](...args);
      } catch (error) {
        logger.error(`Error in event handler ${event}`, error);
      }
    }
  }

  /**
   * Change server state and emit event
   * @private
   */
  changeState(newState) {
    const oldState = this.state;
    this.state = newState;
    logger.info(`Server state changed: ${oldState} -> ${newState}`);
    this.emit('onStateChange', newState, oldState);
  }

  /**
   * Start the server
   * @param {Object} config - Server configuration
   * @returns {Promise<void>}
   */
  async start(config) {
    if (this.state !== ServerState.STOPPED) {
      throw new Error(`Cannot start server in state: ${this.state}`);
    }

    try {
      this.changeState(ServerState.STARTING);
      
      const serverType = config.serverType || ServerType.PAPER;
      
      if (serverType === ServerType.BEDROCK) {
        await this.startBedrockServer(config);
      } else {
        await this.startJavaServer(config);
      }
    } catch (error) {
      this.changeState(ServerState.ERROR);
      this.emit('onError', error);
      throw error;
    }
  }

  /**
   * Start Java-based server (Paper/Fabric)
   * @private
   */
  async startJavaServer(config) {
    const jarName = config.serverType === ServerType.FABRIC ? 'fabric-server-launch.jar' : 'paper.jar';
    const serverJarPath = path.join(this.serverFilesDir, jarName);

    if (!fs.existsSync(serverJarPath)) {
      throw new Error(`Server JAR not found: ${jarName}`);
    }

    // Accept EULA
    const eulaPath = path.join(this.serverFilesDir, 'eula.txt');
    if (!fs.existsSync(eulaPath) || !fs.readFileSync(eulaPath, 'utf8').includes('eula=true')) {
      fs.writeFileSync(eulaPath, 'eula=true\n');
      logger.info('EULA accepted');
    }

    const args = this.buildJavaArguments(config, jarName);
    
    logger.info('Starting Java server', { jar: jarName, args: args.join(' ') });

    this.serverProcess = spawn(this.javaExecutablePath, args, {
      cwd: this.serverFilesDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.getCleanEnvForJava()
    });

    this.cleanup.registerProcess('minecraftServer', this.serverProcess);
    this.setupServerProcessHandlers();
    this.startPerformanceMonitoring();
  }

  /**
   * Build Java arguments for server
   * @private
   */
  buildJavaArguments(config, jarName) {
    let ramToUse = config.ram || 'auto';
    
    if (ramToUse === 'auto') {
      const os = require('os');
      const totalSystemRamMB = Math.floor(os.totalmem() / (1024 * 1024));
      let autoRamMB = Math.floor(totalSystemRamMB / 3);
      if (autoRamMB < 1024) autoRamMB = 1024;
      ramToUse = `${autoRamMB}M`;
    }

    const javaArgsProfile = config.javaArgs || 'Default';
    
    const commonArgs = [
      `-Xms${ramToUse}`,
      `-Xmx${ramToUse}`,
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions'
    ];

    const performanceArgs = [
      ...commonArgs,
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
      '-XX:G1NewSizePercent=40',
      '-XX:G1MaxNewSizePercent=50',
      '-XX:G1HeapRegionSize=16M',
      '-XX:G1ReservePercent=15',
      '-XX:G1HeapWastePercent=5',
      '-XX:InitiatingHeapOccupancyPercent=20',
      '-XX:G1MixedGCLiveThresholdPercent=90',
      '-XX:G1RSetUpdatingPauseTimePercent=5',
      '-XX:SurvivorRatio=32',
      '-XX:MaxTenuringThreshold=1',
      '-Dusing.aikars.flags=https://mcflags.emc.gs',
      '-Daikars.new.flags=true'
    ];

    const defaultArgs = [
      ...commonArgs,
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20',
      '-XX:InitiatingHeapOccupancyPercent=45'
    ];

    const selectedArgs = javaArgsProfile === 'Performance' ? performanceArgs : defaultArgs;
    
    return [...selectedArgs, '-jar', jarName, 'nogui'];
  }

  /**
   * Setup handlers for server process events
   * @private
   */
  setupServerProcessHandlers() {
    this.serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      this.emit('onConsoleOutput', output, 'stdout');
      this.checkServerReady(output);
    });

    this.serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      this.emit('onConsoleOutput', output, 'stderr');
    });

    this.serverProcess.on('close', (code) => {
      this.handleServerClose(code);
    });

    this.serverProcess.on('error', (error) => {
      logger.error('Server process error', error);
      this.emit('onError', error);
      this.changeState(ServerState.ERROR);
    });
  }

  /**
   * Check if server is ready from output
   * @private
   */
  checkServerReady(output) {
    const cleanOutput = output.replace(/\u001b\[(?:\d{1,3}(?:;\d{1,3})*)?[m|K]/g, '').trimEnd();
    
    if (/Done \([^)]+\)! For help, type "help"/.test(cleanOutput)) {
      this.serverIsFullyStarted = true;
      this.changeState(ServerState.RUNNING);
      logger.info('Server fully started and ready');
    }
  }

  /**
   * Handle server process close
   * @private
   */
  handleServerClose(code) {
    this.stopPerformanceMonitoring();
    
    const wasKilledInternally = this.serverProcess && this.serverProcess.killedInternally;
    this.serverProcess = null;
    this.serverIsFullyStarted = false;

    if (wasKilledInternally) {
      logger.info('Server stopped normally');
      this.changeState(ServerState.STOPPED);
    } else {
      logger.warn(`Server stopped unexpectedly with code: ${code}`);
      this.changeState(ServerState.ERROR);
    }
  }

  /**
   * Start performance monitoring
   * @private
   */
  startPerformanceMonitoring() {
    if (this.performanceMonitoringEnabled) return;
    
    this.performanceMonitoringEnabled = true;
    
    const interval = setInterval(async () => {
      if (!this.serverProcess || this.serverProcess.killed) {
        this.stopPerformanceMonitoring();
        return;
      }

      try {
        const stats = await pidusage(this.serverProcess.pid);
        const memoryGB = stats.memory / (1024 * 1024 * 1024);
        const cpuPercent = stats.cpu;
        
        this.emit('onPerformanceStats', {
          memoryGB: memoryGB.toFixed(2),
          cpuPercent: cpuPercent.toFixed(1),
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error('Failed to get performance stats', error);
        this.stopPerformanceMonitoring();
      }
    }, 2000);

    this.cleanup.registerInterval('performanceMonitoring', interval);
  }

  /**
   * Stop performance monitoring
   * @private
   */
  stopPerformanceMonitoring() {
    if (!this.performanceMonitoringEnabled) return;
    
    this.performanceMonitoringEnabled = false;
    this.cleanup.clearInterval('performanceMonitoring');
  }

  /**
   * Send command to server
   * @param {string} command - Command to send
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendCommand(command) {
    const validation = validateServerCommand(command);
    
    if (!validation.valid) {
      logger.warn('Invalid command rejected', { command, error: validation.error });
      return { success: false, error: validation.error };
    }

    if (!this.serverProcess || !this.serverProcess.stdin.writable) {
      return { success: false, error: 'Server not running or not writable' };
    }

    try {
      this.serverProcess.stdin.write(validation.sanitized + '\n');
      logger.debug('Command sent', { command: validation.sanitized });
      return { success: true };
    } catch (error) {
      logger.error('Failed to send command', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop the server gracefully
   * @param {number} timeout - Timeout in milliseconds before force kill
   * @returns {Promise<void>}
   */
  async stop(timeout = 10000) {
    if (this.state === ServerState.STOPPED) {
      return;
    }

    this.changeState(ServerState.STOPPING);
    logger.info('Stopping server...');

    if (!this.serverProcess || this.serverProcess.killed) {
      this.changeState(ServerState.STOPPED);
      return;
    }

    this.serverProcess.killedInternally = true;

    // Try graceful shutdown first
    try {
      if (this.serverProcess.stdin.writable) {
        this.serverProcess.stdin.write('stop\n');
      }
    } catch (error) {
      logger.warn('Failed to send stop command', error);
    }

    // Force kill after timeout
    const killTimeout = setTimeout(() => {
      if (this.serverProcess && !this.serverProcess.killed) {
        logger.warn('Force killing server after timeout');
        this.serverProcess.kill('SIGKILL');
      }
    }, timeout);

    this.cleanup.registerTimeout('serverKillTimeout', killTimeout);
  }

  /**
   * Start Bedrock server
   * @private
   */
  async startBedrockServer(config) {
    const platform = process.platform;
    const execName = platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
    const execPath = path.join(this.serverFilesDir, execName);

    if (!fs.existsSync(execPath)) {
      throw new Error(`Bedrock server executable not found: ${execName}`);
    }

    const spawnOptions = {
      cwd: this.serverFilesDir,
      stdio: ['pipe', 'pipe', 'pipe']
    };

    if (platform !== 'win32') {
      spawnOptions.env = { ...process.env, LD_LIBRARY_PATH: '.' };
    }

    logger.info('Starting Bedrock server', { executable: execName });

    this.serverProcess = spawn(execPath, [], spawnOptions);
    this.cleanup.registerProcess('minecraftServer', this.serverProcess);
    this.setupServerProcessHandlers();
    this.startPerformanceMonitoring();
  }

  /**
   * Cleanup all resources
   */
  destroy() {
    logger.info('Destroying ServerManager');
    this.stop();
    this.cleanup.cleanupAll();
  }
}

module.exports = { ServerManager, ServerType, ServerState };
