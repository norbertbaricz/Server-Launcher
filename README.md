# 🎮 Server-Launcher

![Server Launcher Icon](https://raw.githubusercontent.com/norbertbaricz/server-launcher/main/build/icon.png)

[![ISC License](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)  
[![Electron](https://img.shields.io/badge/Built_with-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)  
[![Tailwind CSS](https://img.shields.io/badge/Styled_with-Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

An intuitive desktop app to manage and run your own Minecraft server. Built with Electron, this launcher radically simplifies the process of setting up, starting, stopping, and interacting with a PaperMC server.

![Server Launcher Screenshot](https://placehold.co/800x500/1f2937/9ca3af?text=App+Screenshot+Here)  
*Add a screenshot of your app interface here!*

---

## ✨ Key Features

* **🚀 Simplified Setup:** Automatically downloads the PaperMC server files on first launch.
* **📋 Version Selector:** Easily choose your preferred Minecraft version from an updated list.
* **🧠 Smart RAM Allocation:** Configure RAM dedicated to the server, with an "auto" option for simplicity.
* **🖥️ Integrated Console:** View the server console output live directly inside the app.
* **⌨️ Command Input:** Send commands to the server without needing a separate terminal.
* **🌐 IP Info:** Quickly display your local and public IP addresses to share with friends.
* **💻 Cross-Platform:** Compatible with Windows, macOS, and Linux.
* **🎨 Modern Interface:** A clean and user-friendly design powered by Tailwind CSS.

---

## 🛠️ Technologies Used

* **Framework:** [Electron](https://www.electronjs.org/)
* **Server:** [PaperMC](https://papermc.io/)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/)
* **Runtime:** [Node.js](https://nodejs.org/)

---

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) must be installed on your system.
* Java must be installed and added to your system `PATH` to run the Minecraft server.

### Installation & Running

1. **Clone the repository:**
    ```bash
    git clone https://github.com/norbertbaricz/server-launcher.git
    cd server-launcher
    ```

2. **Install dependencies:**
    ```bash
    npm install
    ```

3. **Run the app in development mode:**
    ```bash
    npm start
    ```

---

## 📦 Building the App

To create a distributable package for your operating system, use the following commands. The final app will be located in the `dist_electron` folder.

* **Build for the current OS:**
    ```bash
    npm run dist
    ```

* **Build specifically for Windows:**
    ```bash
    npm run dist:win
    ```

---

## 🕹️ Usage Guide

1. **First Launch (Setup):**
    * On first launch, a setup window will appear.
    * Select your preferred Minecraft version and RAM allocation.
    * Click **"Download / Configure"**. The app will download the required `.jar` file and create a `config.json`.

2. **Starting the Server:**
    * After configuration, the main interface will be available.
    * Click **"Start Server"**. The launcher will automatically accept the EULA and start the server.

3. **Server Management:**
    * **Console:** The main text area displays live server activity.
    * **Commands:** Type any server command in the input field at the bottom and click **"Send"**.
    * **Stop:** Click **"Stop Server"** to safely shut down the server.
    * **File Directory:** Click **"Open Folder"** to open the folder containing all server files (`MinecraftServer`).

---

## ⚖️ License

This project is licensed under the ISC License. See the `LICENSE.txt` file for full details.