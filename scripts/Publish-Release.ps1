#requires -Version 7.0
[CmdletBinding()]
param(
    [string]$OutputDirectory,
    [string]$ExpectedVersion
)

# EASY-TO-TUNE RELEASE DEFAULTS. The application project owns the version number.
$RuntimeIdentifier = 'win-x64'
$Configuration = 'Release'
$PublishProfile = 'WindowsPortable'
$ExecutableName = 'Server Launcher.exe'
$ProductPrefix = 'Server-Launcher-Reborn'
$VerificationArgument = '--verify-distribution'
$VerificationTimeoutSeconds = 60
$ApplicationRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ProjectPath = Join-Path $ApplicationRoot 'Server Launcher.csproj'
$DefaultOutputDirectory = Join-Path $ApplicationRoot 'artifacts'
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $IsWindows) { throw 'Publish the Windows release on Windows x64.' }
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'The supported server downloads require Windows x64.'
}
if (-not $OutputDirectory) { $OutputDirectory = $DefaultOutputDirectory }
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
[xml]$Project = Get-Content -LiteralPath $ProjectPath -Raw
$Version = [string]$Project.Project.PropertyGroup.Version
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'The project must declare a three-part release version.' }
if ($ExpectedVersion -and $ExpectedVersion -ne $Version) { throw 'The release tag and project version do not match.' }
$VersionSource = Get-Content -LiteralPath (Join-Path $ApplicationRoot 'Core/LauncherConfig.cs') -Raw
if ($VersionSource -notmatch ('AppVersion\s*=\s*"' + [regex]::Escape($Version) + '"')) {
    throw 'LauncherConfig.AppVersion and the project version must match.'
}
Get-Command dotnet -ErrorAction Stop | Out-Null

# Unique staging prevents local servers, caches and previous builds entering the archive.
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$Staging = Join-Path $OutputDirectory ('.staging-' + [guid]::NewGuid().ToString('N'))
$PublishDirectory = Join-Path $Staging 'publish'
$PackageDirectory = Join-Path $Staging "$ProductPrefix-$Version-$RuntimeIdentifier"
$ArchiveName = "$ProductPrefix-$Version-$RuntimeIdentifier.zip"
$ArchivePath = Join-Path $OutputDirectory $ArchiveName
$ChecksumPath = Join-Path $OutputDirectory 'SHA256SUMS.txt'
$NotesPath = Join-Path $OutputDirectory 'RELEASE_NOTES.md'
$SmokeOutput = Join-Path $Staging 'verification.stdout.txt'
$SmokeError = Join-Path $Staging 'verification.stderr.txt'
$Commit = if ($env:GITHUB_SHA) { $env:GITHUB_SHA } else { 'local' }

try {
    New-Item -ItemType Directory -Path $Staging -Force | Out-Null
    $PublishArguments = @('publish', $ProjectPath, '--configuration', $Configuration,
        '--runtime', $RuntimeIdentifier, '--self-contained', 'true',
        "-p:PublishProfile=$PublishProfile", '--output', $PublishDirectory)
    & dotnet @PublishArguments
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE." }
    $Executable = Join-Path $PublishDirectory $ExecutableName
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'The published executable is missing.' }
    $UnexpectedFiles = @(Get-ChildItem -LiteralPath $PublishDirectory -Recurse -File |
        Where-Object { $_.FullName -ne $Executable })
    if ($UnexpectedFiles.Count -gt 0) {
        throw ('The single-file output contains unexpected files: ' + ($UnexpectedFiles.Name -join ', '))
    }

    # Exercise the published EXE: embedded images/sounds and the custom WinForms controls.
    $Process = Start-Process -FilePath $Executable -ArgumentList $VerificationArgument -PassThru `
        -RedirectStandardOutput $SmokeOutput -RedirectStandardError $SmokeError
    if (-not $Process.WaitForExit($VerificationTimeoutSeconds * 1000)) {
        $Process.Kill($true)
        throw 'The published application did not finish its distribution verification.'
    }
    $Process.WaitForExit()
    $Process.Refresh()
    if ($Process.ExitCode -ne 0) {
        $Failure = if (Test-Path -LiteralPath $SmokeError) { Get-Content -LiteralPath $SmokeError -Raw } else { 'No error details were returned.' }
        throw "Published application verification failed: $Failure"
    }
    $Report = Get-Content -LiteralPath $SmokeOutput -Raw | ConvertFrom-Json
    if (-not $Report.passed -or $Report.version -ne $Version) { throw 'The verification report is invalid.' }
    Copy-Item -LiteralPath $SmokeOutput -Destination (Join-Path $OutputDirectory 'distribution-verification.json') -Force

    New-Item -ItemType Directory -Path $PackageDirectory -Force | Out-Null
    Copy-Item -LiteralPath $Executable -Destination $PackageDirectory
    Copy-Item -LiteralPath (Join-Path $ApplicationRoot 'docs/QUICK_START.txt') -Destination (Join-Path $PackageDirectory 'START_HERE.txt')
    Copy-Item -LiteralPath (Join-Path $ApplicationRoot 'LICENSE.txt') -Destination $PackageDirectory
    [ordered]@{
        product = 'Server Launcher Reborn'; version = $Version; runtime = $RuntimeIdentifier
        framework = [string]$Project.Project.PropertyGroup.TargetFramework
        selfContained = $true; singleFile = $true; sourceCommit = $Commit
        verification = $Report
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PackageDirectory 'release-info.json') -Encoding utf8NoBOM

    Compress-Archive -LiteralPath $PackageDirectory -DestinationPath $ArchivePath -CompressionLevel Optimal -Force
    $Hash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    "$Hash  $ArchiveName" | Set-Content -LiteralPath $ChecksumPath -Encoding utf8NoBOM
    Copy-Item -LiteralPath (Join-Path $ApplicationRoot 'docs/RELEASE_NOTES.md') -Destination $NotesPath -Force

    # Exactly the verified EXE, getting-started text, license and source/version manifest.
    $Zip = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $Names = @($Zip.Entries | Where-Object { $_.Name } | ForEach-Object { $_.Name } | Sort-Object)
        $ExpectedNames = @($ExecutableName, 'START_HERE.txt', 'LICENSE.txt', 'release-info.json') | Sort-Object
        if (Compare-Object $ExpectedNames $Names) { throw 'The release archive contains unexpected files.' }
    } finally { $Zip.Dispose() }

    if ($env:GITHUB_OUTPUT) {
        @("version=$Version", "archive=$ArchiveName", "tag=reborn-v$Version") |
            Add-Content -LiteralPath $env:GITHUB_OUTPUT -Encoding utf8NoBOM
    }
    if ($env:GITHUB_STEP_SUMMARY) {
        @("## Reborn $Version", '', '- Published Windows x64 executable verified.',
          '- Embedded icon, logo, four event sounds and custom controls checked.',
          '- .NET included; Java and Minecraft servers are prepared on demand.',
          "- Package: $ArchiveName", "- SHA-256: $Hash", "- Source commit: $Commit") |
            Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding utf8NoBOM
    }
    Write-Host "Created $ArchivePath"
} finally {
    if (Test-Path -LiteralPath $Staging) { Remove-Item -LiteralPath $Staging -Recurse -Force }
}
