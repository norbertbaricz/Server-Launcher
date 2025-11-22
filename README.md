# 🎮 Server Launcher — User Guide

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Version](https://img.shields.io/badge/Version-1.2.14-green.svg)](https://github.com/norbertbaricz/server-launcher/releases)

Server Launcher is a desktop application that helps you configure and run Minecraft servers (Java: PaperMC/Vanilla, Fabric/Modded; Bedrock) without touching the terminal. This guide explains the interface in detail and what each button does, so you can use it effectively day-to-day.

---

## 📋 Overview

- Dashboard with live status, local/public IPs, latency, and memory usage.
- Quick Start/Stop buttons and command input to the server console.
- Plugins/Mods/Add-ons page for managing extensions and editing `server.properties`.
- Settings with three sections: Server Configuration, Server Data Location, Launcher Settings.
- Guided Setup on first launch or when server files are missing.

---

## 🖥️ Dashboard (Main Screen)

- **Status Bar:** Displays current state (e.g., "Server is running.", "Server ready.", "Downloading…"). Color changes based on context.
- **Local IP / Public IP:** Shows network addresses. Port is automatically appended when the server is running (extracted from `server.properties`).
- **Latency:** Measured via `/list` command sent periodically (every 1.5s) when server is running. Automatic probes are hidden from console; manual `/list` commands remain visible.
- **Memory:** Current RAM consumption reported from the server process.
- **Console:** Displays server logs. The command input below sends commands (press Enter). All commands are sanitized before being sent.
- **Start:** Launches the server. During "starting", critical settings are automatically locked.
- **Stop:** Safely stops the server.

---

## 🔧 Settings

Settings are always accessible. Only critical fields are locked during "starting" or when the server is running.

### 1) Server Configuration
- **Server Type:** PaperMC (Vanilla), Fabric (Modded), or Bedrock.
- **Minecraft Version:** List of available versions for the selected type.
- **RAM Allocation:** How much memory the server uses (or `auto`).
- **Java Arguments:** Only applicable for Java servers (Paper/Fabric).
- **Save & Apply:** Saves settings. Reconfiguration/download only occurs if you modified Server Type/Version/RAM/Java Args. If nothing changed, it skips reconfiguration and refreshes Dashboard IPs correctly.

### 2) Server Data Location
- Displays the path where server files are stored. Default: `Documents/MinecraftServer` (all operating systems).
- **Choose:** Change the location (disabled if Locked or server is starting/running).
- **Lock / Unlock:** Locks/unlocks the ability to change the location.
  - By default, the path is Locked at application startup.
  - Both Lock/Unlock and Choose are disabled during "starting" or "running".

### 3) Launcher Settings
- **Language:** Interface language. Applied ONLY on Save & Apply.
- **Theme:** Visual theme (Skypixel, Nord, Aurora, Midnight, Emerald, Sunset, Crimson, Ocean, Grape, Neon).
- **Desktop Notifications:** Notifications with sound for start/stop/crash events.
- **Start with system:** Launch the launcher with the operating system.
- **Auto-start server:** Automatically start the server after a configurable countdown.

---

## 🧩 Plugins / Mods / Add-ons

- The label adapts automatically based on server type:
  - PaperMC: "Plugins"
  - Fabric: "Mods"
  - Bedrock: "Add-ons"
- **Upload:** Upload plugins/mods (disabled for Bedrock; manage manually from the server folder).
- **Open Folder:** Opens the corresponding folder (plugins/mods or Bedrock folder).
- **Server Properties:** Edit values in `server.properties`; press Save & Apply on the page to save changes.
- **Delete:** Delete a plugin/mod (disabled for Bedrock).

---

## 🧭 Setup (Initial Configuration)

- Setup appears only when the `MinecraftServer` folder is missing from the configured location.
- Choose server type, version, and RAM. Press Download / Configure.
- The launcher downloads necessary files and completes setup.

---

## 🌐 Network & Latency

- **Local/Public IP:** Displayed on Dashboard. When server is running, the port from `server.properties` is automatically appended.
- **Latency:** Measured via `/list` probe every 1.5s. Automatic commands are hidden from console (to avoid spam); manual `/list` commands appear normally.

---

## 🛡️ Safety & Runtime Behavior

- **EPIPE Protection:** If the server process exits, the launcher stops writing to stdin and clears related intervals.
- **Command Sanitization:** Console input is validated before being sent.
- **Runtime Control Locking:**
  - "Server Configuration" (critical fields) locks during starting/running.
  - "Server Data Location" (Choose and Lock/Unlock) are disabled during starting/running.
- Settings remain accessible at all times (only locked fields are disabled when appropriate).
- Language applies only on Save & Apply (not immediately on selection).

---

## ❓ Frequently Asked Questions

**Where are the server files located?**
- Default: `Documents/MinecraftServer`. You can choose a different path from Settings → Server Data Location (when not running/starting and if not Locked).

**Why can't I use "Choose" or "Lock/Unlock" when the server is running?**
- For safety, the location cannot be changed during starting/running.

**Why don't I see the port when the server is stopped?**
- The port is displayed with the IP when the server is running (read from `server.properties`).

**Why doesn't `/list` appear in the console periodically?**
- Automatic probe commands are hidden to avoid spam. If you type `/list` manually, it appears normally.

**I pressed Save & Apply without changing Server Configuration settings and the IPs stayed on "fetching".**
- This has been fixed. IPs now refresh correctly even without reconfiguration.

---

## Versioning

We use the format $MAJOR.MINOR.PATCH$ (example: `2.3.14`).

- MAJOR: Increment when there is a large update that changes core logic, architecture, or major UI flows.
- MINOR: Increment for UI/design enhancements or new non-breaking features.
- PATCH: Increment for bug fixes and small internal adjustments. Each additional set of fixes increases this number.

Guideline:
1. Change MAJOR only when existing integrations might need adjustments.
2. Change MINOR when adding improvements that are backward compatible.
3. Change PATCH for corrective releases (no new features).

## 📄 License

This project is licensed under [ISC](./LICENSE.txt).
