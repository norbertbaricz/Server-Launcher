# 🎮 Server-Launcher

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Built with Electron](https://img.shields.io/badge/Built_with-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Styled with Tailwind CSS](https://img.shields.io/badge/Styled_with-Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

**Server-Launcher** is a sleek and intuitive desktop app for managing your own Minecraft server powered by PaperMC. Built using Electron and styled with Tailwind CSS, it simplifies everything from setup to server control.

![Server Launcher Screenshot](https://raw.githubusercontent.com/norbertbaricz/server-launcher/main/build/screenshot.png)

---

## ✨ Key Features

- 🚀 **Automatic Setup:** Downloads the required PaperMC server files on first launch.
- 📋 **Version Selector:** Easily pick your favorite Minecraft version from an updated list.
- 🧠 **Smart RAM Allocation:** Choose how much RAM to allocate, or let the app decide with "auto".
- 🖥️ **Built-in Console:** See real-time server logs directly inside the app.
- ⌨️ **Command Input:** Send Minecraft server commands without needing an external terminal.
- 🌐 **IP Information:** Instantly view your local and public IP addresses for sharing.
- 💻 **Cross-Platform:** Runs on Windows, macOS, and Linux.
- 🎨 **Modern UI:** Clean and responsive interface thanks to Tailwind CSS.

---

## 🛠️ Technologies Used

| Component     | Description |
|---------------|-------------|
| **Electron**  | Desktop app framework |
| **PaperMC**   | High-performance Minecraft server |
| **Tailwind CSS** | Styling framework |
| **Node.js**   | Runtime environment |

---

## 🚀 Getting Started

### Requirements

- [Node.js](https://nodejs.org/) must be installed on your system.
- Java must be installed and added to your system’s `PATH` (required to run Minecraft servers).

### Installation (Development Mode)

1. **Clone the repository:**
    ```bash
    git clone https://github.com/norbertbaricz/server-launcher.git
    cd server-launcher
    ```

2. **Install dependencies:**
    ```bash
    npm install
    ```

3. **Run the app:**
    ```bash
    npm start
    ```

---

## 📦 Building the App

You can create a production-ready version of the app using:

- **Build for current OS:**
    ```bash
    npm run dist
    ```

- **Build specifically for Windows:**
    ```bash
    npm run dist:win
    ```

> The output will be located in the `dist_electron` directory.

---

## 🕹️ Usage Guide

### 🛠️ First-Time Setup

1. When you launch the app for the first time, a setup window appears.
2. Select the Minecraft version and desired RAM allocation.
3. Click **“Download / Configure”** to install the necessary files and generate `config.json`.

### ▶️ Starting the Server

- After setup is complete, the main interface appears.
- Click **“Start Server”** to automatically accept the EULA and launch the server.

### 🧰 Server Management

- **Console:** View real-time server output.
- **Commands:** Type server commands in the input field and click **“Send”**.
- **Stop Server:** Click **“Stop Server”** for a safe shutdown.
- **File Access:** Click **“Open Folder”** to open the `MinecraftServer` directory.

---

## ⚖️ License

This project is licensed under the ISC License.  
See the [`LICENSE.txt`](./LICENSE.txt) file for full details.

---

## 💡 Contribute or Follow

📁 GitHub Repository: [https://github.com/norbertbaricz/server-launcher](https://github.com/norbertbaricz/server-launcher)

---

Crafted with care by [Norbert Baricz](https://github.com/norbertbaricz) 🐺  
Feel free to fork, contribute, or share!
