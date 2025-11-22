## [1.2.14] - 2025-11-22

### 🆕 Added / Changed
- Java installation information and optimized resource management
- Enhanced server path locking and optimized settings save logic
- Implemented server path locking mechanism and updated UI states
- Updated server path management and locked settings during server operations
- Implemented command latency measurement and updated performance stats display
- Enhanced server path management and localization support
- Updated README and documentation for version 1.2.14
- Added versioning guidelines to documentation

### 🐛 Fixed
- Removed duplicate Java installation status message during extraction
- Removed unused server ping utilities and cleaned up related code
- Removed unused services and utilities

## [1.2.0] - 2025-11-14

### ➕ Added
- **Multi-Server Support:** PaperMC (Vanilla), Fabric (Modded), and Bedrock (Dedicated Server)
- **Dynamic UI Labeling:** Plugins/Mods/Add-ons button text and icons adapt based on server type
- **Real-time Latency Measurement:** `/list` command probe every 1.5s with automatic console suppression
  - TCP Server List Ping for Java servers
  - UDP Unconnected Ping for Bedrock servers
- **Cross-Platform Notifications:** Desktop notifications with sound effects
  - Windows: AppUserModelId integration
  - Linux: Desktop file with proper icon paths
  - macOS: Native notification support
- **Plugin/Mod Manager:** Drag-and-drop upload interface with type-aware labeling and icons
- **Save & Apply Icon:** Consistency across Plugins/Mods page
- **Server Configuration Storage:** Moved to app userData directory with one-time legacy migration
- **Folder-based Setup Detection:** Setup appears only when `MinecraftServer` folder is absent
- **Default Server Path:** `Documents/MinecraftServer` on all platforms, locked by default
- **Server Data Location Lock:** Path locked at startup; Choose button disabled when locked or during server starting/running
- **Smart Settings Lock:** Settings always accessible; only critical Server Configuration fields lock during starting/running
- **Deferred Language Application:** Language changes apply only on Save & Apply, not on selection
- **Smart Reconfiguration:** Save & Apply skips reconfigure when server type/version/RAM/Java args unchanged
- **EPIPE Protection:** Stdin error handlers and robust write guards prevent crashes on process exit
- **Virtual Console Scrolling:** Smooth 60 FPS rendering for 100,000+ log lines
- **10 Premium Themes:** Skypixel, Nord, Aurora, Midnight, Emerald, Sunset, Crimson, Ocean, Grape, Neon
- **6 Languages:** English, Romanian, German, French, Hungarian, Polish
- **Auto-updater:** Seamless updates via electron-updater
- **Discord Rich Presence:** Shows server state in Discord
- **Memory Optimization:** 40% reduction in idle usage (250MB → 150MB)
- **CPU Optimization:** 70% reduction in idle usage (15% → 2-5%)
- **Input Validation:** All user inputs sanitized to prevent command injection
- **Context Isolation:** Proper IPC bridge with sandboxed renderer
- **Path Validation:** Directory traversal protection

### 🗑️ Removed
- Unused modules never wired into `main.js` (ServerManager, NetworkManager, ConfigManager, CleanupManager)
- Renderer performance helpers and standalone debounce utilities
- Bespoke Logger helper (now using electron-log directly)
- Empty `src/renderer/` folder
- All console.log/debug/warn from production code
- Development-only dependencies (eslint, prettier, jest)
- Test files and test configuration
- Unused GitHub workflows directory
- Notification logging spam
- Deprecated `desktop` block from electron-builder config

### 🔧 Fixed
- **EPIPE Crash:** Uncaught exception when IPC messages sent to closed renderer via `safeSend()` helper
- **IP Refresh Bug:** Dashboard IPs now refresh correctly after Save & Apply even without reconfiguration
- **Java Handler Spam:** Unified stdout handler respects `isAutomaticProbe` flag, removed duplicate parsing
- **Bedrock Console Suppression:** Fixed symmetry with Java handler
- **Choose Button Lock:** Button truly disabled at startup and non-clickable when locked
- **Server Data Location Controls:** Choose and Lock/Unlock properly disabled during starting/running
- **Linux Build:** Fixed electron-builder errors by adding `synopsis` and removing invalid properties
- Auto-start delay slider overflow
- Language selection not persisting after closing settings
- Ubuntu notifications showing "Unknown app" without icon
- Notification system on all platforms (Windows, Linux, macOS)
- ngrok tunnel URL extraction and display
- Memory leaks from event listeners and intervals
- Console scrolling performance issues