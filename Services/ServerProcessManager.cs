using System.Diagnostics;
using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

public sealed class ServerProcessManager : IDisposable
{
    private readonly object _lifecycle = new();
    private Process? _process;
    public int SessionId { get; private set; }
    private ServerProfile? _runningProfile;
    private TimeSpan _lastCpuTime;
    private DateTime _lastCpuSampleUtc;

    public event Action<string>? OutputReceived;
    public event Action<string>? ErrorReceived;
    public event Action<int, int>? Exited;
    private TaskCompletionSource<int>? _exitCompletion;
    public Task ExitCompletion => (Task?)_exitCompletion?.Task ?? Task.CompletedTask;
    public bool IsFinishing => _exitCompletion is not null && !_exitCompletion.Task.IsCompleted && !IsRunning;

    public bool IsRunning => _process is { HasExited: false };
    public int? ProcessId => IsRunning ? _process!.Id : null;
    public string LastLaunchArguments { get; private set; } = string.Empty;

    public void Start(ServerProfile profile, string executable)
    {
        lock (_lifecycle)
        {
            if (IsRunning || IsFinishing) throw new InvalidOperationException("Wait for the previous server session to finish before starting another.");
            var backend = ServerBackends.Resolve(profile.ServerSoftware);
            if (!File.Exists(backend.GetEntryPoint(profile))) throw new FileNotFoundException("The server entry point does not exist.", backend.GetEntryPoint(profile));
            if (TryGetLiveManagedProcess(profile, out var existing))
            {
                existing?.Dispose();
                throw new InvalidOperationException($"{profile.Name} already has a managed server process running. A duplicate start was blocked.");
            }
            RemoveStalePidFile(profile);
            _process?.Dispose();
            var process = new Process { StartInfo = backend.CreateStartInfo(profile, executable), EnableRaisingEvents = true };
            LastLaunchArguments = process.StartInfo.Arguments;
            _runningProfile = profile;
            _process = process;
            var session = ++SessionId;
            var completion = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
            _exitCompletion = completion;
            process.OutputDataReceived += (_, e) => { if (e.Data is not null && ReferenceEquals(_process, process)) OutputReceived?.Invoke(e.Data); };
            process.ErrorDataReceived += (_, e) => { if (e.Data is not null && ReferenceEquals(_process, process)) ErrorReceived?.Invoke(e.Data); };
            process.Exited += (_, _) => _ = ObserveExitAsync(process, profile, session, completion);
            try
            {
                if (!process.Start()) throw new InvalidOperationException("The server process could not be started.");
                WritePidFile(profile, process);
                _lastCpuTime = process.TotalProcessorTime;
                _lastCpuSampleUtc = DateTime.UtcNow;
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
            }
            catch
            {
                try { if (!process.HasExited) { process.Kill(entireProcessTree: true); process.WaitForExit(LauncherConfig.ForceStopWaitMilliseconds); } } catch { }
                DeletePidFile(profile);
                process.Dispose();
                _process = null;
                _runningProfile = null;
                completion.TrySetResult(-1);
                throw;
            }
        }
    }

    public void SendCommand(string command)
    {
        if (!IsRunning || _process is null)
            throw new InvalidOperationException("The server is not running.");

        if (string.IsNullOrWhiteSpace(command))
            return;

        _process.StandardInput.WriteLine(command.Trim());
        _process.StandardInput.Flush();
    }

    public async Task<bool> StopGracefullyAsync(CancellationToken cancellationToken = default)
    {
        if (!IsRunning && !IsFinishing) return true;
        if (IsRunning) SendCommand(_runningProfile is null ? "stop" : ServerBackends.Resolve(_runningProfile.ServerSoftware).StopCommand);
        try
        {
            await ExitCompletion.WaitAsync(TimeSpan.FromSeconds(LauncherConfig.GracefulStopTimeoutSeconds), cancellationToken);
            return !IsRunning;
        }
        catch (TimeoutException) { return false; }
    }

    private async Task ObserveExitAsync(Process process, ServerProfile profile, int session, TaskCompletionSource<int> completion)
    {
        var code = -1;
        try
        {
            // WaitForExit also drains the redirected output before reporting a clean stop.
            await Task.Run(() =>
            {
                try { process.WaitForExit(); }
                catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception) { }
            }).WaitAsync(TimeSpan.FromMilliseconds(LauncherConfig.ForceStopWaitMilliseconds)).ConfigureAwait(false);
            code = process.ExitCode;
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception or TimeoutException) { }
        finally
        {
            lock (_lifecycle) { if (ReferenceEquals(_process, process)) DeletePidFile(profile); }
            try { Exited?.Invoke(code, session); }
            finally { completion.TrySetResult(code); }
        }
    }

    public bool ForceStopAndWait(int waitMilliseconds = LauncherConfig.ForceStopWaitMilliseconds)
    {
        if (!IsRunning || _process is null)
        {
            DeletePidFile(_runningProfile);
            return true;
        }

        try
        {
            _process.Kill(entireProcessTree: true);
            _process.WaitForExit(Math.Max(250, waitMilliseconds));
        }
        catch
        {
            // We verify below instead of trusting Kill() blindly.
        }

        var stopped = !IsRunning;
        if (stopped)
            DeletePidFile(_runningProfile);

        return stopped;
    }

    public void ForceStop() => ForceStopAndWait();

    public ProcessMetrics GetMetrics()
    {
        if (!IsRunning || _process is null)
            return new ProcessMetrics(0, 0);

        try
        {
            _process.Refresh();
            var now = DateTime.UtcNow;
            var cpuTime = _process.TotalProcessorTime;
            var elapsed = now - _lastCpuSampleUtc;
            var cpuDelta = cpuTime - _lastCpuTime;

            double cpuPercent = 0;
            if (elapsed.TotalMilliseconds > 0)
            {
                cpuPercent = cpuDelta.TotalMilliseconds /
                             (elapsed.TotalMilliseconds * Environment.ProcessorCount) * 100.0;
            }

            _lastCpuTime = cpuTime;
            _lastCpuSampleUtc = now;

            var ramMb = _process.WorkingSet64 / 1024d / 1024d;
            return new ProcessMetrics(Math.Clamp(cpuPercent, 0, 100), ramMb);
        }
        catch
        {
            return new ProcessMetrics(0, 0);
        }
    }

    public static string BuildJavaArguments(ServerProfile profile) =>
        ServerBackends.BuildJavaArguments(profile, GlobalSettingsService.Current.ExtraJvmArguments);

    public static int CleanupOrphanedManagedServers(IEnumerable<ServerProfile> profiles)
    {
        var killed = 0;
        foreach (var profile in profiles)
        {
            if (!TryGetLiveManagedProcess(profile, out var process))
            {
                RemoveStalePidFile(profile);
                continue;
            }

            try
            {
                if (process is not null)
                {
                    process.Kill(entireProcessTree: true);
                    process.WaitForExit(LauncherConfig.ForceStopWaitMilliseconds);
                    if (process.HasExited)
                        killed++;
                }
            }
            catch
            {
                // Leave the PID file intact if Windows denied termination. The next start will still be blocked.
            }
            finally
            {
                process?.Dispose();
            }

            if (!TryGetLiveManagedProcess(profile, out var stillAlive))
            {
                stillAlive?.Dispose();
                RemoveStalePidFile(profile);
            }
            else
            {
                stillAlive?.Dispose();
            }
        }

        return killed;
    }

    public static bool HasLiveManagedProcess(ServerProfile profile)
    {
        var live = TryGetLiveManagedProcess(profile, out var process);
        process?.Dispose();
        return live;
    }

    private static string NormalizeExtraArguments(string? arguments)
    {
        if (string.IsNullOrWhiteSpace(arguments))
            return string.Empty;

        return string.Join(' ', arguments
            .Replace('\r', ' ')
            .Replace('\n', ' ')
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private static void WritePidFile(ServerProfile profile, Process process)
    {
        try
        {
            var startTicks = process.StartTime.ToUniversalTime().Ticks;
            File.WriteAllText(profile.PidFilePath, $"{process.Id}|{startTicks}");
        }
        catch
        {
            // Starting the server is more important than telemetry. Duplicate protection still works in-process.
        }
    }

    private static bool TryGetLiveManagedProcess(ServerProfile profile, out Process? process)
    {
        process = null;
        if (!File.Exists(profile.PidFilePath))
            return false;

        try
        {
            var parts = File.ReadAllText(profile.PidFilePath).Trim().Split('|');
            if (parts.Length != 2 || !int.TryParse(parts[0], out var pid) || !long.TryParse(parts[1], out var startTicks))
                return false;

            var candidate = Process.GetProcessById(pid);
            if (candidate.HasExited)
            {
                candidate.Dispose();
                return false;
            }

            var name = candidate.ProcessName;
            if (!name.StartsWith(ServerBackends.Resolve(profile.ServerSoftware).ProcessNamePrefix, StringComparison.OrdinalIgnoreCase))
            {
                candidate.Dispose();
                return false;
            }

            var actualStartTicks = candidate.StartTime.ToUniversalTime().Ticks;
            if (Math.Abs(actualStartTicks - startTicks) > TimeSpan.TicksPerSecond * 2)
            {
                candidate.Dispose();
                return false;
            }

            process = candidate;
            return true;
        }
        catch
        {
            process?.Dispose();
            process = null;
            return false;
        }
    }

    private static void RemoveStalePidFile(ServerProfile profile)
    {
        if (!File.Exists(profile.PidFilePath))
            return;

        if (TryGetLiveManagedProcess(profile, out var live))
        {
            live?.Dispose();
            return;
        }

        DeletePidFile(profile);
    }

    private static void DeletePidFile(ServerProfile? profile)
    {
        if (profile is null)
            return;

        try
        {
            if (File.Exists(profile.PidFilePath))
                File.Delete(profile.PidFilePath);
        }
        catch
        {
            // Best effort; a valid PID marker is safer than accidentally starting duplicates.
        }
    }

    public void Dispose()
    {
        ForceStopAndWait();

        if (_process is not null)
        {
            _process.Dispose();
            _process = null;
        }

        _runningProfile = null;
    }
}

public readonly record struct ProcessMetrics(double CpuPercent, double RamMb);
