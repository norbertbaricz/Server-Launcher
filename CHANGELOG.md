# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.16] - 2026-01-31

### Added
- Added `howl-greeting` command and greeting message event for The Lunar Pack.
- Added guild event logging (bans, channels, emojis, roles, messages, voice states).
- Added `bellyrub` command with GIF support and custom responses.
- Implemented sharding support and updated start script.

### Fixed
- Fixed stale interaction handling in `interactionCreate`.
- Fixed interaction defer errors in `bellyrub` and `fetch-e621`.

### Removed
- Removed unused dependencies from `package.json`.
- Removed sharding support and related configurations (after rollout adjustments).
- Removed `howl-greeting.js` and `greetingMessageCreate.js` from The Wolf Den.