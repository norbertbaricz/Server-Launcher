namespace Server_Launcher.Services;

public readonly record struct ServerLogSignal(bool IsError, bool BecameReady, bool PlayReadySound);

public sealed class ServerSessionMonitor
{
    private IServerBackend? _backend;
    private bool _startupHadError;
    private bool _readySeen;
    public int ErrorCount { get; private set; }
    public void Reset(IServerBackend backend) { _backend = backend; _startupHadError = false; _readySeen = false; ErrorCount = 0; }
    public ServerLogSignal Observe(string cleanLine)
    {
        if (_backend is null) return default;
        var error = _backend.IsErrorLine(cleanLine);
        if (error) ErrorCount++;
        if (error && !_readySeen) _startupHadError = true;
        var becameReady = !_readySeen && _backend.IsReadyLine(cleanLine);
        if (becameReady) _readySeen = true;
        return new ServerLogSignal(error, becameReady, becameReady && !_startupHadError);
    }
}
