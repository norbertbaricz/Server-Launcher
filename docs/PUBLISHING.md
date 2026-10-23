# Publishing Reborn

## Source layout

The C# project is in the repository root. Run Reborn commands there. The older Electron edition remains available in previous releases and repository history; its user guide is preserved in `docs/ELECTRON.md`.

The application version is declared in `Server Launcher.csproj` and `Core/LauncherConfig.cs`. The publishing script checks that both match. The manifest's assembly identity should use the same four-part version.

## Build the portable application on Windows

Install the .NET 10 SDK and PowerShell 7, then run:

```powershell
./scripts/Publish-Release.ps1
```

The script uses `Properties/PublishProfiles/WindowsPortable.pubxml`: Windows x64, .NET included, one executable, embedded icons/audio, ReadyToRun and no trimming. Publishing happens in a fresh staging folder so local server data and previous builds cannot enter the archive.

It then starts the published executable with `--verify-distribution`. This checks the platform, embedded images, four PCM event sounds and custom control rendering without creating a server, downloading Java, changing startup settings or playing audio. The script waits for success before packaging.

Outputs are placed in the ignored `artifacts/` directory:

- `Server-Launcher-Reborn-2.7.0-win-x64.zip`
- `SHA256SUMS.txt`
- `distribution-verification.json`
- `RELEASE_NOTES.md`

The ZIP contains the verified executable, START_HERE.txt, LICENSE.txt and release-info.json. The manifest records the source commit when built by GitHub Actions.

## GitHub workflow

**Reborn Windows release** runs for source changes on pull requests, main and release/reborn-* branches. It also accepts reborn-v* tags and manual runs.

- The Windows job publishes and starts the actual executable, then uploads the verified package as a workflow artifact.
- A release/reborn-* branch or reborn-v* tag prepares an unpublished Reborn release draft after verification succeeds.
- After the workflow exists on main, Actions > Reborn Windows release > Run workflow can prepare another draft by enabling create_draft.
- The release job uses a separate write-capable token scope. Pull-request verification has read access only.
- Existing published releases are not overwritten. Increase the version for a new release.

The initial release branch is `release/reborn-2.7.0`; its draft uses `reborn-v2.7.0` and the exact verified source commit. Reborn drafts are marked pre-release and do not replace the Electron edition's latest stable release.

## Publish for the community

1. Review and merge the Reborn pull request after its Windows checks pass.
2. Open the prepared **Reborn 2.7.0 - Windows x64** draft in Releases.
3. Download the ZIP and try the normal application on Windows. Automated verification covers packaging and UI resources, not a full Minecraft hosting session.
4. Keep the Reborn preview separate from the Electron stable update channel, and click **Publish release** when ready.
5. Share the Reborn release page. Community users download its Windows ZIP; GitHub's generated Source code archives require compilation.

For the next version, update the project/config/manifest versions and release notes, then prepare a release branch or matching reborn-v tag. Publish profiles, script defaults and workflow action references remain in separate files for maintenance.
