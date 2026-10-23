# Server Launcher Reborn v2.1 - Windows x64

The Reborn desktop edition brings the current C# launcher to this repository with a portable Windows distribution.

## Download

Download **Server-Launcher-Reborn-2.1.0-win-x64.zip**, extract it into a writable folder and open **Server Launcher.exe**. .NET is included; an installer and developer tools are not required.

## Included

- PaperMC, Fabric and native Bedrock server creation.
- Automatic matching Java preparation and enabled-content runtime checks.
- Global RAM sliders, Standard/Balance/Performance profiles and Balance defaults.
- Per-server plugins, mods, add-ons and world management.
- Live console and process monitoring, LAN/public address display, server rename/delete.
- Desktop notifications, fixed event sounds, optional close-to-tray and Windows startup.
- Embedded application icon, logo and event audio in the portable executable.

The workflow starts the published executable in verification mode, reads its embedded images and four event sounds, renders the custom controls, and creates the ZIP with a source/version manifest. SHA256SUMS.txt and distribution-verification.json accompany the archive.

## Before use

- This edition is for Windows x64. Native Bedrock additionally needs the Microsoft Visual C++ x64 runtime.
- Internet is needed for initial server/Java downloads. Minecraft servers and JDKs are not bundled.
- Keep your servers/, runtime/ and launcher.settings.json when updating.
- A public IP display does not configure port forwarding or a tunnel.
- Electron profiles are not automatically migrated; existing worlds can be copied and imported.

This is the stable Windows release built from `main`. Its GitHub tag is `v2.1`; executable and package metadata use `2.1.0`. Older Electron releases remain available in the release archive.
