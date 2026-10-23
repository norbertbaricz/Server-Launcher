# Publishing Server Launcher Reborn

## Sources and versions

The current C# application, assets and release workflow live on `main`, with the project in the repository root. Older Electron sources remain in repository history and their user guide is preserved in `docs/ELECTRON.md`.

Set the same three-part version in `Server Launcher.csproj` and `Core/LauncherConfig.cs`. Set the project's AssemblyVersion/FileVersion and `app.manifest` identity to its four-part equivalent. The publishing script checks the project and application versions before building.

For version `2.1.0`, the public release tag is `v2.1`. A nonzero patch is kept in the tag, for example `2.1.1` becomes `v2.1.1`. HTTP requests identify the application version and repository.

## Build the portable application on Windows

Install the .NET 10 SDK and PowerShell 7, then run from the repository root:

```powershell
./scripts/Publish-Release.ps1
```

`Properties/PublishProfiles/WindowsPortable.pubxml` publishes for Windows x64 with .NET included, one executable, embedded icons/audio, ReadyToRun and no trimming. Each build uses a fresh staging folder so existing servers, settings and previous builds cannot enter the download.

The script starts the actual published executable with `--verify-distribution`, checking embedded images, four PCM event sounds and custom control rendering. This verification does not create a server, download Java, change startup settings or play audio. Normal Minecraft hosting still needs a separate Windows usage test.

Outputs are placed in the ignored `artifacts/` directory:

- `Server-Launcher-Reborn-2.1.0-win-x64.zip`
- `SHA256SUMS.txt`
- `distribution-verification.json`
- `RELEASE_NOTES.md`

The ZIP contains the verified executable, `START_HERE.txt`, `LICENSE.txt` and `release-info.json`. The manifest identifies the version, public tag and exact source commit when built by GitHub Actions.

## Publish from main

**Reborn Windows release** verifies source changes on pull requests and pushes to `main`. Pull-request builds have read access and upload workflow artifacts only.

After a change is merged into `main`, the workflow:

1. Builds and starts the Windows executable in verification mode.
2. Packages it and checks the ZIP's SHA-256 checksum.
3. Uploads the verified ZIP, checksum and verification report to its release.
4. Publishes that release as stable and latest, targeting the exact built commit.

The upload is staged privately until all files are ready. A published version is never overwritten: increase the version and update the release notes before shipping another release. The workflow can also be run manually from `main` in Actions.

For the initial `v2.1` migration, the workflow removes the obsolete unpublished `reborn-v2.7.0` draft after publication. It also removes the two preparation branches only after checking that their commits are included in `main`. Published historical releases are retained.

Share the [latest release](https://github.com/norbertbaricz/Server-Launcher/releases/latest). Community members download the Windows ZIP, extract it and run `Server Launcher.exe`. GitHub's automatically generated **Source code** archives are for developers and require compilation.
