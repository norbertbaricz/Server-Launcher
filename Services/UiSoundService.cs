using System.Runtime.InteropServices;
using System.Threading.Channels;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

internal enum SoundCue { Startup, Error, DownloadSuccess, ServerReady }
internal readonly record struct SoundPlaybackResult(bool Succeeded, string? Error = null);

internal static class UiSoundService
{
    // EASY-TO-TUNE PLAYBACK VALUES. PCM volume affects this clip, never other applications.
    private const int QueueCapacity = 8;
    private const int MaximumSoundBytes = 8 * 1024 * 1024;
    private const int PlaybackTailMilliseconds = 200;
    private const string ErrorLogFileName = "audio-errors.log";
    private const uint SoundAsync = 0x0001;
    private const uint SoundNoDefault = 0x0002;
    private const uint SoundMemory = 0x0004;
    private sealed record SoundRequest(SoundCue Cue, long ErrorSequence,
        TaskCompletionSource<SoundPlaybackResult>? Completion = null);
    private static readonly object Sync = new();
    private static readonly Channel<SoundRequest> Queue = Channel.CreateBounded<SoundRequest>(
        new BoundedChannelOptions(QueueCapacity) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
    private static readonly Task Worker;
    private static CancellationTokenSource? _activePlayback;
    private static SoundCue _activeCue;
    private static long _errorSequence;
    private static long _lastErrorTick;
    private static bool _stopped;

    static UiSoundService() => Worker = Task.Run(PlayQueuedAsync);

    [DllImport("winmm.dll", EntryPoint = "PlaySoundW", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool PlaySound(IntPtr sound, IntPtr module, uint flags);

    public static void PlayStartup() => Enqueue(SoundCue.Startup);
    public static void PlaySuccess() => Enqueue(SoundCue.DownloadSuccess);
    public static void PlayServerReady() => Enqueue(SoundCue.ServerReady);
    public static Task<SoundPlaybackResult> PlayServerStoppedAsync()
    {
        var completion = new TaskCompletionSource<SoundPlaybackResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        Write(new SoundRequest(SoundCue.DownloadSuccess, Interlocked.Read(ref _errorSequence), Completion: completion));
        return completion.Task;
    }

    public static void PlayError()
    {
        lock (Sync)
        {
            Interlocked.Increment(ref _errorSequence);
            if (_activePlayback is not null && _activeCue != SoundCue.Error) StopActive();
            var now = Environment.TickCount64;
            if (_lastErrorTick != 0 && now - _lastErrorTick < LauncherConfig.ErrorSoundCooldownMs) return;
            _lastErrorTick = now;
        }
        Enqueue(SoundCue.Error);
    }

    private static void Enqueue(SoundCue cue) => Write(new SoundRequest(cue, Interlocked.Read(ref _errorSequence)));

    private static void Write(SoundRequest request)
    {
        lock (Sync)
        {
            if (!_stopped && Queue.Writer.TryWrite(request)) return;
        }
        request.Completion?.TrySetResult(new SoundPlaybackResult(false, "Audio playback is busy or has stopped."));
    }

    private static async Task PlayQueuedAsync()
    {
        await foreach (var request in Queue.Reader.ReadAllAsync())
        {
            CancellationTokenSource? playback = null;
            GCHandle pinned = default;
            var result = new SoundPlaybackResult(false, "Playback was cancelled.");
            try
            {
                if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Audio playback requires Windows.");
                var wave = LoadWave(request.Cue);
                // Fixed by the launcher, including when an old settings file contains mute/volume keys.
                var bytes = wave.WithVolume(LauncherConfig.EventSoundVolumePercent);
                pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
                lock (Sync)
                {
                    // Closing or a newer error cannot race a late ready sound.
                    if (_stopped ||
                        (request.Cue == SoundCue.ServerReady && request.ErrorSequence != Interlocked.Read(ref _errorSequence)))
                        continue;
                    playback = new CancellationTokenSource();
                    playback.Token.ThrowIfCancellationRequested();
                    if (!PlaySound(pinned.AddrOfPinnedObject(), IntPtr.Zero, SoundMemory | SoundAsync | SoundNoDefault))
                        throw new InvalidOperationException("Windows could not play the event sound. Check the selected audio output.");
                    _activePlayback = playback;
                    _activeCue = request.Cue;
                }
                // SND_MEMORY needs this buffer alive until Windows has finished playing it.
                await Task.Delay(wave.Duration + TimeSpan.FromMilliseconds(PlaybackTailMilliseconds), playback.Token).ConfigureAwait(false);
                result = new SoundPlaybackResult(true);
            }
            catch (OperationCanceledException) { result = new SoundPlaybackResult(false, "Playback was interrupted."); }
            catch (Exception ex)
            {
                result = new SoundPlaybackResult(false, ex.Message);
                LogFailure(request.Cue + ": " + ex);
            }
            finally
            {
                lock (Sync)
                {
                    if (playback is not null && ReferenceEquals(_activePlayback, playback))
                    {
                        StopActive();
                        _activePlayback = null;
                    }
                }
                playback?.Dispose();
                if (pinned.IsAllocated) pinned.Free();
                request.Completion?.TrySetResult(result);
            }
        }
    }

    private static PcmWave LoadWave(SoundCue cue)
    {
        var file = cue switch
        {
            SoundCue.Startup => "startup.wav", SoundCue.Error => "error.wav",
            SoundCue.DownloadSuccess or SoundCue.ServerReady => "success.wav", _ => throw new ArgumentOutOfRangeException(nameof(cue))
        };
        var path = Path.Combine(AppPaths.AppRoot, "Assets", "Sounds", file);
        if (File.Exists(path))
        {
            try
            {
                if (new FileInfo(path).Length > MaximumSoundBytes) throw new InvalidDataException("The event sound is too large.");
                return PcmWave.Parse(File.ReadAllBytes(path));
            }
            catch (Exception ex) { LogFailure("Using the embedded sound because " + file + " could not be read: " + ex.Message); }
        }
        using var resource = AppAssets.OpenSound(file);
        if (resource.Length > MaximumSoundBytes) throw new InvalidDataException("The embedded event sound is too large.");
        using var memory = new MemoryStream();
        resource.CopyTo(memory);
        return PcmWave.Parse(memory.ToArray());
    }

    // Caller holds Sync. Stop Windows playback before its pinned memory can be freed.
    private static void StopActive()
    {
        if (_activePlayback is null) return;
        if (OperatingSystem.IsWindows()) PlaySound(IntPtr.Zero, IntPtr.Zero, 0);
        _activePlayback.Cancel();
    }

    private static void LogFailure(string message)
    {
        try { File.AppendAllText(Path.Combine(AppPaths.AppRoot, ErrorLogFileName), $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}"); }
        catch { /* Audio diagnostics must never interrupt server management. */ }
    }

    public static void Shutdown()
    {
        lock (Sync)
        {
            _stopped = true;
            Queue.Writer.TryComplete();
            StopActive();
        }
        _ = Worker.ContinueWith(task => LogFailure(task.Exception!.ToString()), TaskContinuationOptions.OnlyOnFaulted);
    }
}
