# Server-Launcher
# Server Launcher

![Server Launcher Icon](build/icon.png)

A user-friendly desktop application for managing and running your own Minecraft server, built with Electron. This launcher simplifies the process of setting up, starting, stopping, and interacting with a PaperMC server.

## ✨ Features

* **Easy Setup:** Automatically downloads the required PaperMC server files on the first run.
* **Version Selection:** Choose from a list of available PaperMC versions.
* **RAM Allocation:** Easily configure the amount of RAM dedicated to your server, with an "auto" option for simplicity.
* **Server Console:** View the live server console output directly within the application.
* **Command Input:** Send commands to your running server without needing to interact with a terminal.
* **IP Information:** Quickly view your local and public IP addresses to share with your friends.
* **Cross-Platform:** Builds are configured for Windows, macOS, and Linux.
* **User-Friendly Interface:** A clean and modern UI built with Tailwind CSS.

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/)
* Java must be installed and available in your system's PATH to run the Minecraft server.

### Installation & Running

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/norbertbaricz/server-launcher.git](https://github.com/norbertbaricz/server-launcher.git)
    cd server-launcher
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the application in development mode:**
    ```bash
    npm start
    ```

### Building the Application

To create a distributable package for your operating system, use the following commands:

* **Create a package for the current OS:**
    ```bash
    npm run dist
    ```

* **Create a package specifically for Windows:**
    ```bash
    npm run dist:win
    ```

The packaged application will be located in the `dist_electron` directory.

## 🕹️ How to Use

1.  **First Launch:**
    * On the first run, a setup window will appear.
    * Select your desired Minecraft version and RAM allocation.
    * Click "Download / Configure". The application will download the necessary PaperMC server `.jar` file and create a `config.json`.

2.  **Starting the Server:**
    * Once the setup is complete, the main interface will be available.
    * Click the "Start Server" button. The launcher will automatically handle the EULA agreement and start the server with the specified settings.

3.  **Managing the Server:**
    * **Console:** The main text area shows the live output from your server.
    * **Send Commands:** Type any Minecraft server command into the input field at the bottom and click "Send".
    * **Stop Server:** Click the "Stop Server" button to gracefully shut down the server.
    * **Open Folder:** Click the "Open Folder" button to open the directory containing all your server files (`MinecraftServer` in your user data folder).

## 📂 Project Structure

.├── build/              # Icons for different OS builds├── dist_electron/      # Output directory for packaged application├── .gitignore├── index.html          # Main HTML file for the UI├── main.js             # Electron main process├── package.json        # Project metadata and dependencies├── preload.js          # Electron preload script├── README.md           # This file├── script.js           # Frontend JavaScript for the UI└── style.css           # Styles for the UI
## ⚖️ License

This project is licensed under the ISC License. See the [LICENSE.txt](LICENSE.txt) file for details.
