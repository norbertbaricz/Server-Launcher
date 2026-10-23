using System.Buffers.Binary;

namespace Server_Launcher.Services;

internal sealed class PcmWave
{
    // Supported event audio: signed 16-bit PCM, mono or stereo.
    private const int PcmFormat = 1;
    private const int BitsPerSample = 16;
    private const int BytesPerSample = BitsPerSample / 8;
    private const int MinimumSampleRate = 8000;
    private const int MaximumSampleRate = 192000;
    private readonly byte[] _bytes;
    private readonly int _dataOffset;
    private readonly int _dataLength;
    public TimeSpan Duration { get; }

    private PcmWave(byte[] bytes, int offset, int length, int rate, int blockAlign)
    {
        _bytes = bytes;
        _dataOffset = offset;
        _dataLength = length;
        Duration = TimeSpan.FromSeconds(length / (double)blockAlign / rate);
    }

    public static PcmWave Parse(byte[] bytes)
    {
        var data = bytes.AsSpan();
        if (data.Length < 44 || !data[..4].SequenceEqual("RIFF"u8) || !data.Slice(8, 4).SequenceEqual("WAVE"u8))
            throw new InvalidDataException("The event sound is not a WAV file.");
        var containerLength = BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(4, 4)) + 8L;
        if (containerLength > data.Length || containerLength < 44)
            throw new InvalidDataException("The WAV file is incomplete.");
        var end = (int)containerLength;
        var rate = 0;
        var blockAlign = 0;
        var dataOffset = -1;
        var dataLength = 0;
        for (var offset = 12; offset <= end - 8;)
        {
            var chunkLength = BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(offset + 4, 4));
            var payload = offset + 8;
            if (chunkLength > end - payload)
                throw new InvalidDataException("The WAV contains an incomplete chunk.");
            var length = (int)chunkLength;
            var id = data.Slice(offset, 4);
            if (id.SequenceEqual("fmt "u8))
            {
                if (length < 16 || rate != 0) throw new InvalidDataException("The WAV format header is invalid.");
                var format = BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(payload, 2));
                var channels = BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(payload + 2, 2));
                var sampleRate = BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(payload + 4, 4));
                var byteRate = BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(payload + 8, 4));
                blockAlign = BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(payload + 12, 2));
                var bits = BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(payload + 14, 2));
                if (format != PcmFormat || channels is not (1 or 2) || bits != BitsPerSample ||
                    sampleRate is < MinimumSampleRate or > MaximumSampleRate ||
                    blockAlign != channels * BytesPerSample || byteRate != sampleRate * blockAlign)
                    throw new InvalidDataException("Event sounds must use 16-bit PCM WAV, mono or stereo.");
                rate = (int)sampleRate;
            }
            else if (id.SequenceEqual("data"u8))
            {
                if (dataOffset >= 0 || length == 0) throw new InvalidDataException("The WAV audio data is invalid.");
                dataOffset = payload;
                dataLength = length;
            }
            var next = payload + (long)length + (length & 1);
            if (next > end) throw new InvalidDataException("The WAV chunk padding is invalid.");
            offset = (int)next;
        }
        if (rate == 0 || dataOffset < 0 || dataLength % blockAlign != 0)
            throw new InvalidDataException("The WAV does not contain complete PCM audio frames.");
        return new PcmWave(bytes, dataOffset, dataLength, rate, blockAlign);
    }

    public byte[] WithVolume(int percent)
    {
        percent = Math.Clamp(percent, 0, 100);
        var result = (byte[])_bytes.Clone();
        if (percent == 100) return result;
        var samples = result.AsSpan(_dataOffset, _dataLength);
        for (var offset = 0; offset < samples.Length; offset += BytesPerSample)
        {
            var sample = BinaryPrimitives.ReadInt16LittleEndian(samples.Slice(offset, BytesPerSample));
            BinaryPrimitives.WriteInt16LittleEndian(samples.Slice(offset, BytesPerSample), (short)(sample * percent / 100));
        }
        return result;
    }
}
