# 🎮 Server Launcher — Download & Play

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Version](https://img.shields.io/badge/Version-1.2.17-green.svg)](https://github.com/norbertbaricz/server-launcher/releases)

Server Launcher is the easiest way to host your own Minecraft Java (Paper/Fabric/Vanilla) or Bedrock server without touching the terminal. You do **not** need to clone this repository or install any developer tools—simply download the app, press Start, and invite your friends.

---

## 🚀 Quick Download (takes 1 minute)

1. Open the [Releases](https://github.com/norbertbaricz/server-launcher/releases) page.
2. Pick the latest version at the top.
3. Download the file that matches your computer:
   - `Server-Launcher-Setup-<version>.exe` for Windows
   - `Server-Launcher-mac-<version>.zip` for macOS
   - `Server-Launcher-<version>.AppImage` for Linux
4. Double-click the download to install/run the app.

That is all—no `git clone`, no coding, no extra software.

---

## 🧱 What You Get

- Guided setup that creates your Minecraft server folder for you.
- Start/Stop buttons, live console, RAM usage, IP + port display, and ping checker.
- Plugin/Mod/Add-on upload page with one-click folder access.
- Automatic language, theme, and notification options.

---

## 💾 Install by Operating System

### 🪟 Windows (10/11)

1. Download `Server-Launcher-Setup-<version>.exe` from Releases.
2. Double-click it and follow the installer (next → next → finish).
3. If SmartScreen asks for confirmation, click **More info → Run anyway**. This happens because the app is not in the Microsoft Store yet.
4. You now have Server Launcher in your Start menu and can pin it to the taskbar.

### 🍎 macOS (11 Big Sur or newer)

1. Download `Server-Launcher-mac-<version>.zip`.
2. Open the zip and drag `Server Launcher.app` into `Applications`.
3. First launch: right-click the app → **Open** → **Open** (this lets macOS trust the app).
4. After that you can open it normally from Launchpad or Spotlight.

### 🐧 Linux (Ubuntu, Debian, Fedora, Arch, etc.)

1. Download `Server-Launcher-<version>.AppImage`.
2. Make it executable:

   ```bash
   chmod +x Server-Launcher-<version>.AppImage
   ```

3. Double-click the file or run `./Server-Launcher-<version>.AppImage`.
4. Optional: move it to `/opt/ServerLauncher/` and create a desktop shortcut for quick access.

> Tip: On Ubuntu you might need to install AppImage/FUSE support (`sudo apt install libfuse2`).

---

## 🩺 Troubleshooting

- **Linux font-antialiasing warning:** Electron may print `Schema org.gnome.desktop.interface does not have key font-antialiasing` on some desktop environments. Installing your distro's `gsettings-desktop-schemas` package (or the GLib settings schemas equivalent) silences it; the message is harmless for the app.

---

## 🕹️ First Launch Setup (kid friendly!)

1. Pick where the server files should live (default is `Documents/MinecraftServer`).
2. Choose your server type (Paper, Fabric, or Bedrock) and Minecraft version.
3. Choose how much RAM to give the server (or leave it on Auto).
4. Press **Download & Configure** and wait for the progress bar to finish.
5. Hit **Start Server**. Once the status turns green, share the shown IP + port with your friends.

You can reopen the setup later from Settings if you ever want to change version, folder, or RAM.

---

## 🛠 Daily Controls Explained

- **Dashboard:** Shows status (Starting/Running/Stopped), local + public IP, latency, and RAM usage.
- **Console + Command bar:** Read logs and send commands (e.g., `/op YourName`). Inputs are sanitized to keep things safe.
- **Start/Stop buttons:** One click to power your server up or down. Critical settings lock automatically while the server runs.
- **Plugins / Mods / Add-ons page:** Upload or delete files, open the folder, and edit `server.properties` with Save & Apply.
- **Settings:** Change language, theme, notifications, auto-start options, and the server location whenever the server is stopped.

---

## ❓ FAQ (short answers)

- **Do I need to know coding or Git?** No. Just download the newest release and run it.
- **Where are the server files?** By default in `Documents/MinecraftServer`. Change it anytime in Settings → Server Data Location.
- **Why is the Choose button greyed out?** The server is starting/running or the folder is locked. Stop the server first.
- **How do friends join?** Share the public IP + port shown on the Dashboard. Make sure the port is forwarded on your router.
- **What if I cannot port-forward?** Create a free [ngrok](https://ngrok.com/) account, copy your auth token, and run `ngrok config add-authtoken <TOKEN>` in your terminal (only once). Server Launcher then detects the system-wide token, starts the tunnel for you when the server runs, and shows the shareable address on the Dashboard.
- **Can it auto-start with my PC?** Yes. Enable "Start with system" and (optionally) "Auto-start server" with a countdown.
- **How do I update Server Launcher?** Close the app, download the latest version from Releases, and install/run it over the old one. Your server files stay untouched.
- **Can I copy my world to another PC?** Yes. Zip the server folder (e.g., `Documents/MinecraftServer`) and move it to the other machine, then point Server Launcher to that folder.
- **Bedrock plugins?** Bedrock does not support plugins the same way Java does; manage add-ons manually from the folder opened via the Plugins/Add-ons page.

---

## 🆘 Need Help?

- Check the [Issues](https://github.com/norbertbaricz/server-launcher/issues) tab to see if someone already solved your problem.
- Open a new issue with clear steps if you discover a bug.
- For release announcements download from [Releases](https://github.com/norbertbaricz/server-launcher/releases) only.

---

## 📄 License

This project is licensed under [ISC](./LICENSE.txt).
