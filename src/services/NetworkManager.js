/**
 * Network utilities for IP detection and ngrok management
 * @module services/NetworkManager
 */

const https = require('https');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');
const { Logger } = require('../utils/logger');
const { CleanupManager } = require('../utils/cleanup');

const logger = new Logger('NetworkManager');

const NGROK_API_ENDPOINT = 'http://127.0.0.1:4040/api/tunnels';
const PUBLIC_IP_API = 'https://api.ipify.org?format=json';
const PUBLIC_IP_TIMEOUT = 5000;

/**
 * Manages network operations including IP detection and ngrok tunneling
 */
class NetworkManager {
  constructor() {
    this.ngrokProcess = null;
    this.ngrokTargetPort = null;
    this.ngrokUnavailablePermanently = false;
    this.ngrokStopRequested = false;
    this.lastNgrokDiagnosticCode = null;
    this.cleanup = new CleanupManager();
  }

  /**
   * Get local IPv4 address
   * @returns {string} Local IP address or '-'
   */
  getLocalIPv4() {
    try {
      const interfaces = os.networkInterfaces();
      
      for (const name in interfaces) {
        const networkInterface = interfaces[name];
        
        for (const alias of networkInterface) {
          if (alias.family === 'IPv4' && !alias.internal) {
            return alias.address;
          }
        }
      }
      
      return '-';
    } catch (error) {
      logger.error('Failed to get local IP', error);
      return '-';
    }
  }

  /**
   * Fetch public IP from external API
   * @returns {Promise<string>}
   */
  async fetchPublicIP() {
    return new Promise((resolve, reject) => {
      const request = https.get(
        PUBLIC_IP_API,
        { 
          headers: { 'User-Agent': 'Server-Launcher/1.0' },
          timeout: PUBLIC_IP_TIMEOUT
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Public IP API returned ${res.statusCode}`));
          }

          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed.ip || '-');
            } catch (error) {
              reject(new Error('Failed to parse public IP response'));
            }
          });
        }
      );

      request.on('error', (error) => {
        reject(new Error(`Public IP fetch error: ${error.message}`));
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Public IP request timed out'));
      });
    });
  }

  /**
   * Fetch ngrok tunnel information
   * @returns {Promise<Object|null>}
   */
  async fetchNgrokTunnels() {
    return new Promise((resolve, reject) => {
      const request = http.get(NGROK_API_ENDPOINT, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          const error = new Error(`Ngrok API returned ${res.statusCode}`);
          error.code = 'NGROK_BAD_STATUS';
          return reject(error);
        }

        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            error.code = 'NGROK_BAD_JSON';
            reject(error);
          }
        });
      });

      request.setTimeout(2000, () => {
        const error = new Error('Ngrok API request timed out');
        error.code = 'NGROK_TIMEOUT';
        request.destroy(error);
      });

      request.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get ngrok TCP tunnel info
   * @returns {Promise<{publicUrl: string, configAddr: string}|null>}
   */
  async getNgrokTunnelInfo() {
    try {
      const payload = await this.fetchNgrokTunnels();
      const tunnels = Array.isArray(payload?.tunnels) ? payload.tunnels : [];

      if (!tunnels.length) {
        return null;
      }

      const tcpTunnels = tunnels.filter(tunnel => 
        tunnel && 
        typeof tunnel.public_url === 'string' &&
        tunnel.public_url.startsWith('tcp://')
      );

      if (!tcpTunnels.length) {
        return null;
      }

      // Prefer tunnels pointing to Minecraft default port
      const preferredTunnel = tcpTunnels.find(tunnel => {
        const addr = tunnel.config?.addr;
        return addr && (addr.includes('25565') || addr.includes('25575'));
      });

      const selected = preferredTunnel || tcpTunnels[0];
      this.lastNgrokDiagnosticCode = null;

      return {
        publicUrl: selected.public_url,
        configAddr: selected.config?.addr || null
      };
    } catch (error) {
      const ignorableCodes = ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'NGROK_BAD_STATUS', 'NGROK_TIMEOUT', 'NGROK_BAD_JSON'];
      
      if (ignorableCodes.includes(error.code)) {
        const shouldLog = error.code !== 'ECONNREFUSED' || this.ngrokProcess;
        
        if (shouldLog && error.code !== this.lastNgrokDiagnosticCode) {
          logger.debug('Ngrok tunnel not available', { error: error.message });
          this.lastNgrokDiagnosticCode = error.code;
        }
      } else {
        if (error.code !== this.lastNgrokDiagnosticCode) {
          logger.warn('Ngrok tunnel check failed', error);
          this.lastNgrokDiagnosticCode = error.code;
        }
      }

      return null;
    }
  }

  /**
   * Check if ngrok is configured with authtoken
   * @returns {Promise<boolean>}
   */
  async isNgrokConfigured() {
    return new Promise((resolve) => {
      const proc = spawn('ngrok', ['config', 'check'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { output += data.toString(); });

      proc.on('close', (code) => {
        // If authtoken is configured, ngrok config check returns 0
        // If not configured, it returns non-zero and mentions authtoken
        const hasAuthtoken = code === 0 || !output.toLowerCase().includes('authtoken');
        resolve(hasAuthtoken);
      });

      proc.on('error', () => {
        resolve(false);
      });

      // Timeout after 3 seconds
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 3000);
    });
  }

  /**
   * Start ngrok tunnel for a specific port
   * @param {number} port - Port to tunnel
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startNgrokTunnel(port) {
    if (this.ngrokUnavailablePermanently) {
      return { success: false, error: 'Ngrok is not available' };
    }

    try {
      // Check if ngrok is configured
      const isConfigured = await this.isNgrokConfigured();
      if (!isConfigured) {
        const message = 'Ngrok authtoken not configured. Run: ngrok config add-authtoken YOUR_TOKEN';
        logger.warn(message);
        return { success: false, error: message };
      }

      if (this.ngrokProcess && !this.ngrokProcess.killed) {
        if (this.ngrokTargetPort === port) {
          return { success: true };
        }
        this.stopNgrokTunnel();
      }

      const args = ['tcp', String(port)];
      this.ngrokStopRequested = false;

      logger.info(`Starting ngrok TCP tunnel on port ${port}`);

      const proc = spawn('ngrok', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.ngrokProcess = proc;
      this.ngrokTargetPort = port;
      this.cleanup.registerProcess('ngrok', proc);

      proc.stdout.on('data', (data) => {
        logger.debug(`[ngrok stdout] ${data.toString().trim()}`);
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text.toLowerCase().includes('error')) {
          logger.error(`[ngrok] ${text}`);
        } else {
          logger.debug(`[ngrok] ${text}`);
        }
      });

      proc.once('error', (error) => {
        if (error.code === 'ENOENT') {
          this.ngrokUnavailablePermanently = true;
          logger.warn('Ngrok executable not found. Install ngrok to use tunneling.');
        } else {
          logger.error('Ngrok failed to start', error);
        }

        if (this.ngrokProcess === proc) {
          this.ngrokProcess = null;
          this.ngrokTargetPort = null;
          this.lastNgrokDiagnosticCode = null;
        }
      });

      proc.once('exit', (code, signal) => {
        const wasManual = this.ngrokStopRequested;
        
        if (this.ngrokProcess === proc) {
          this.ngrokProcess = null;
          this.ngrokTargetPort = null;
          this.lastNgrokDiagnosticCode = null;
        }

        this.ngrokStopRequested = false;

        if (wasManual) {
          logger.info('Ngrok tunnel stopped');
        } else {
          const reason = code !== null ? `code ${code}` : `signal ${signal || 'unknown'}`;
          logger.warn(`Ngrok process exited (${reason})`);
        }
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to launch ngrok', error);
      this.ngrokProcess = null;
      this.ngrokTargetPort = null;
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop ngrok tunnel
   */
  stopNgrokTunnel() {
    if (!this.ngrokProcess) {
      return;
    }

    try {
      if (this.ngrokProcess.killed) {
        this.ngrokProcess = null;
        this.ngrokTargetPort = null;
        this.ngrokStopRequested = false;
        this.lastNgrokDiagnosticCode = null;
        return;
      }

      this.ngrokStopRequested = true;
      const killed = this.ngrokProcess.kill();

      if (!killed && process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(this.ngrokProcess.pid), '/f', '/t'], {
          stdio: 'ignore'
        });
        killer.unref();
      }

      logger.info('Stopping ngrok tunnel');
    } catch (error) {
      logger.error('Failed to stop ngrok', error);
      this.ngrokProcess = null;
      this.ngrokTargetPort = null;
      this.ngrokStopRequested = false;
      this.lastNgrokDiagnosticCode = null;
    }
  }

  /**
   * Resolve public address (ngrok or direct IP)
   * @param {boolean} serverRunning - Is server currently running
   * @param {number} serverPort - Server port number
   * @returns {Promise<{address: string, includeServerPort: boolean, source: string}>}
   */
  async resolvePublicAddress(serverRunning = false, serverPort = 25565) {
    let ngrokInfo = await this.getNgrokTunnelInfo();

    // Try to start ngrok if not running and server is up
    if (!ngrokInfo && serverRunning) {
      const started = this.startNgrokTunnel(serverPort);
      
      if (started) {
        // Wait a bit for ngrok to initialize
        await new Promise(resolve => setTimeout(resolve, 800));
        ngrokInfo = await this.getNgrokTunnelInfo();
      }
    }

    if (ngrokInfo?.publicUrl) {
      const address = ngrokInfo.publicUrl.replace(/^tcp:\/\//, '');
      logger.info('Using ngrok tunnel for public address', { address });
      
      return {
        address,
        includeServerPort: false,
        source: 'ngrok'
      };
    }

    // Fallback to direct public IP
    try {
      const publicIP = await this.fetchPublicIP();
      logger.info('Using direct public IP', { ip: publicIP });
      
      return {
        address: publicIP,
        includeServerPort: true,
        source: 'direct'
      };
    } catch (error) {
      logger.error('Failed to fetch public IP', error);
      
      return {
        address: '- (Error)',
        includeServerPort: true,
        source: 'error'
      };
    }
  }

  /**
   * Cleanup all network resources
   */
  destroy() {
    logger.info('Destroying NetworkManager');
    this.stopNgrokTunnel();
    this.cleanup.cleanupAll();
  }
}

module.exports = { NetworkManager };
