# Server Launcher Reborn

A Windows desktop launcher for creating and managing Minecraft servers.

## Download and run

1. Open the [latest release](https://github.com/norbertbaricz/Server-Launcher/releases/latest).
2. Download **Server-Launcher-Reborn-2.1.0-win-x64.zip** from the **v2.1** release.
3. Extract the full archive into a writable folder, for example `Documents\Server Launcher Reborn`.
4. Open **Server Launcher.exe**.

The download includes .NET. No installer, Visual Studio or developer tools are required. GitHub's **Source code** downloads are for developers; the runnable application is the Windows ZIP attached to a Reborn release.

### Requirements

- Windows on an x64 Intel/AMD computer.
- Enough free RAM and disk space for the Minecraft server you choose.
- Internet for initial server and missing Java downloads.
- For native Bedrock: the [Microsoft Visual C++ x64 runtime](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist).

The first single-file launch may extract its bundled native .NET libraries into the Windows temporary directory. Server files, Java and settings stay beside the launcher, so choose a folder your Windows account can write to.

## Create your first server

1. Select **Create server** and enter a name.
2. Choose PaperMC, Fabric or Bedrock.
3. Choose the available Minecraft version and review the memory and port settings.
4. Keep **Balance**, or select Standard or Performance for your Java server.
5. Review and accept the Minecraft EULA/download terms, then create the server.
6. Wait for preparation to finish and press **Start**.

The initial release has no preinstalled Minecraft server. A missing matching JDK is downloaded from Eclipse Temurin into the private `runtime` folder. Existing compatible Java installations can also be reused. Bedrock is a native server and does not use Java.

## Daily use

- **Servers:** select, rename or delete a server. Deletion removes its files and worlds.
- **Console:** read live output and send server commands. Follow output and clear controls are available.
- **Content:** manage the selected server's plugins, mods or add-ons, plus its worlds. Stop the server before changing content. Select another world before deleting the selected one or its dimensions.
- **Settings:** global memory defaults, optimization, public address display, notifications, close-to-tray and Windows startup.
- **Tray:** reopen the launcher or exit. Exiting stops managed running servers; close-to-tray keeps them running in the background.

Use content that matches your Minecraft version and server backend. Java checks do not replace a plugin or mod's Minecraft compatibility requirements.

The optimization profiles use Java launch arguments for PaperMC/Fabric. Bedrock uses its native settings. Event sounds use the fixed 70% application volume.

## Connecting players

Use the displayed **LAN** address for other devices on your local network. For internet players, the server must be reachable through your firewall/router or a separately configured tunnel. The displayed **WAN** IP alone does not open a port. This Reborn edition does not bundle a tunneling service.

Prepared server files and runtimes remain available offline. Minecraft account authentication may still require internet, depending on server configuration.

## Your data and updates

The portable launcher creates these items next to its executable:

```text
servers/
runtime/
launcher.settings.json
```

Before updating, stop your servers, exit the launcher and back up these items. Extract the new release and copy its application files into the same launcher directory, keeping your existing data folders and settings. If you move the launcher and use Windows startup, save that option again from its new location.

Reborn does not automatically import Electron profiles. To move a world, create the appropriate server in Reborn and import a copy through **Content > Worlds** while the server is stopped.

## For developers

The current project and release workflow are on `main`. Use the .NET 10 SDK on Windows. The project uses C# 12 and .NET 10 LTS. The [publishing guide](docs/PUBLISHING.md) documents the verified Windows package and automatic stable releases from `main`.

The launcher follows the repository's [ISC license](LICENSE.txt). Downloaded server software, Java, plugins and mods retain their own licenses.

## Previous releases

The older Electron releases for Windows, macOS and Linux remain in the release archive. Their [original guide](docs/ELECTRON.md) is preserved for existing installations. Current C# sources use the repository root.
