/**
 * Server ping utilities for accurate latency measurement
 * @module utils/serverPing
 */

const net = require('net');
const dgram = require('dgram');
const logger = require('./logger');

/**
 * Ping a Minecraft Java server using Server List Ping protocol
 * @param {string} host - Server host
 * @param {number} port - Server port
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<{latency: number, online: boolean}>}
 */
async function pingJavaServer(host = 'localhost', port = 25565, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = new net.Socket();
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        resolve({ latency: -1, online: false });
      }
    }, timeout);

    client.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve({ latency: -1, online: false });
      }
    });

    client.on('connect', () => {
      // Send handshake packet
      const handshake = Buffer.from([
        0x00, // Packet ID
        0x00, // Protocol version (placeholder)
        host.length, ...Buffer.from(host),
        port >> 8, port & 0xFF,
        0x01 // Next state: status
      ]);
      
      const handshakeLength = Buffer.from([handshake.length]);
      client.write(Buffer.concat([handshakeLength, handshake]));

      // Send status request
      const statusRequest = Buffer.from([0x01, 0x00]);
      client.write(statusRequest);
    });

    client.on('data', () => {
      if (!resolved) {
        resolved = true;
        const latency = Date.now() - startTime;
        clearTimeout(timeoutId);
        client.destroy();
        resolve({ latency, online: true });
      }
    });

    client.connect(port, host);
  });
}

/**
 * Ping a Minecraft Bedrock server using unconnected ping
 * @param {string} host - Server host
 * @param {number} port - Server port
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<{latency: number, online: boolean}>}
 */
async function pingBedrockServer(host = 'localhost', port = 19132, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = dgram.createSocket('udp4');
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.close();
        resolve({ latency: -1, online: false });
      }
    }, timeout);

    client.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        client.close();
        resolve({ latency: -1, online: false });
      }
    });

    client.on('message', () => {
      if (!resolved) {
        resolved = true;
        const latency = Date.now() - startTime;
        clearTimeout(timeoutId);
        client.close();
        resolve({ latency, online: true });
      }
    });

    // Unconnected Ping packet for Bedrock
    // Magic bytes + client GUID
    const pingPacket = Buffer.from([
      0x01, // Unconnected Ping ID
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Time
      0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe, // Magic
      0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00  // Client GUID
    ]);

    client.send(pingPacket, port, host, (err) => {
      if (err && !resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        client.close();
        resolve({ latency: -1, online: false });
      }
    });
  });
}

/**
 * Ping server based on server type
 * @param {string} serverType - 'papermc', 'fabric', or 'bedrock'
 * @param {number} port - Server port
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<{latency: number, online: boolean}>}
 */
async function pingServer(serverType, port, timeout = 5000) {
  try {
    if (serverType === 'bedrock') {
      return await pingBedrockServer('localhost', port || 19132, timeout);
    } else {
      // Java servers (papermc, fabric)
      return await pingJavaServer('localhost', port || 25565, timeout);
    }
  } catch (error) {
    logger.error('Failed to ping server', error);
    return { latency: -1, online: false };
  }
}

module.exports = {
  pingJavaServer,
  pingBedrockServer,
  pingServer
};
