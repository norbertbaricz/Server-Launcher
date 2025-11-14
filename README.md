# 🎮 Server Launcher

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Built with Electron](https://img.shields.io/badge/Built_with-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Release](https://img.shields.io/badge/Version-1.2.0-green.svg)](https://github.com/norbertbaricz/server-launcher/releases)

**Server Launcher** is a desktop app for configuring and running PaperMC, Fabric, or Bedrock Minecraft servers without touching the terminal. It bundles auto-updates, Discord Rich Presence, optional ngrok tunneling, and rich notifications in a single Electron experience.

![Server Launcher Screenshot](https://raw.githubusercontent.com/norbertbaricz/server-launcher/main/build/screenshot.png)

---

## ✨ Features

- **Guided Server Setup** – Pick server type, version, RAM profile, and language from the UI.
- **One-click Start/Stop** – Sends safe commands to PaperMC/Fabric JARs or the Bedrock executable.
- **Live Console View** – Streams ANSI-colored logs, command history, and status updates.
- **Plugin / Mod Management** – Upload, delete, or open the plugins/mods folder directly.
- **Auto Updates & Rich Presence** – Electron updater plus Discord RPC to show server state.
- **Network Insights** – Shows LAN/Public IPs and optionally surfaces ngrok TCP tunnels.
- **Notifications with Sound** – Cross-platform desktop notifications with in-app fallback audio cues.
- **Localization & Themes** – English, Romanian, German, French, Hungarian, and Polish with 10 theme presets.

---

## 🛠️ Tech Stack

| Component | Version | Role |
|-----------|---------|------|
| Electron | 36.2.1 | Desktop shell & auto-updates |
| Node.js | 18+ | Runtime for launcher logic |
| electron-updater | 6.3.1 | Update delivery |
| electron-log | 5.4.1 | File & console logging |
| discord-rpc | 4.0.1 | Discord Rich Presence integration |
| pidusage | 4.0.1 | Process CPU/RAM stats |
| Adm-Zip | 0.5.10 | Extract Bedrock server bundles |

---

## 📥 Installation (Users)

1. Download the latest installer for your platform from the [Releases page](https://github.com/norbertbaricz/server-launcher/releases).
2. Install and launch the app.
3. (PaperMC/Fabric only) Ensure Java 17+ is installed. The launcher can fetch Adoptium builds for Windows automatically.
4. Complete the guided setup and start the server.

Minimum specs: 4 GB RAM and 2 GB free disk. Recommended: 8 GB RAM and 5 GB free disk.

---

## 🧑‍💻 Development Setup

```bash
git clone https://github.com/norbertbaricz/server-launcher.git
cd server-launcher
npm install
npm start
```

- `npm start` launches the packaged UI (devtools enabled when `--dev` is passed via `npm run dev`).
- `npm run clean` removes build outputs and caches.
- Automated unit tests are not wired up yet; manual validation is required after changes.

---

## 📦 Build Targets

```bash
npm run clean          # optional but recommended
npm run dist           # build for current platform
npm run dist:win       # Windows (NSIS + Portable)
npm run dist:linux     # Linux (AppImage + deb + tar.gz)
npm run dist:mac       # macOS (ZIP)
npm run dist:all       # All targets (host requirements apply)
```

Artifacts are written to `release/`.

---

## 🕹️ Usage Overview

### First-time Setup
1. The setup view appears automatically when no server config exists.
2. Choose PaperMC, Fabric, or Bedrock, then pick the desired Minecraft version.
3. Select RAM allocation (`auto` calculates based on system RAM) and confirm.
4. The launcher downloads the required server files and writes `config.json` in the user data directory.

### Running & Stopping
- **Start Server**: Accepts the EULA automatically and launches the correct executable/JAR.
- **Stop Server**: Sends the `stop` command (or terminates Bedrock) with a timeout-based fallback.
- **Auto Start / Restart**: Optional countdown (configurable delay) after crashes or on app launch.

### Console & Commands
- ANSI output is streamed into the dashboard console.
- Commands typed in the input box are sanitized before being sent to the server process.

### Plugins / Mods & Server Properties
- Open the Plugins/Mods view to upload JARs or edit `server.properties`.
- Fabric servers treat the folder as `mods/`, PaperMC uses `plugins/`, and Bedrock exposes the root folder.

### Network & ngrok
- Local and public IPs are displayed when available.
- If ngrok is installed and authenticated, the launcher attempts to surface an active TCP tunnel for easy sharing.

### Notifications
- Desktop notifications (with sound) announce server start/stop, crashes, and status changes.
- When notifications are disabled or unsupported, the UI falls back to in-app banners and tones.

---

## 🌐 Localization & Themes

- Language files live under `lang/*.json`. Contributions can add translations by following the same key structure.
- Ten theme presets are available from the settings panel (Skypixel, Nord, Aurora, Midnight, Emerald, Sunset, Crimson, Ocean, Grape, Neon).

---

## 🧱 Project Structure Highlights

- `main.js` – Electron main process: window creation, auto-updates, IPC handlers, server orchestration.
- `preload.js` – Secure bridge that exposes whitelisted IPC helpers to the renderer.
- `script.js` – Renderer UI logic for setup, dashboard, settings, plugins, and localization.
- `style.css` – Custom styling shared across all views.
- `lang/*.json` – Translation dictionaries.
- `src/services/NotificationService.js` – Cross-platform notification helper with fallbacks.
- `src/utils/serverPing.js` – Java/Bedrock ping helpers used for latency readouts.
- `src/utils/validation.js` – Input sanitizers for commands and file operations.
- `build/` – Icons, sounds, and packaging resources referenced by electron-builder.

---

## 🤝 Contributing & License

Issues and pull requests are welcome. Please describe the change, steps to reproduce (if fixing a bug), and any manual validation performed.

This project is licensed under the [ISC License](./LICENSE.txt).
