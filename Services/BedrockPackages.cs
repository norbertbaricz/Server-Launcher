using System.Buffers.Binary;
using System.IO.Compression;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

internal static class BedrockPackages
{
    // Validate the official Windows x64 package before extracting its native server.
    private const int MaximumPeHeaderOffset = 1024 * 1024;
    public static void Validate(string path)
    {
        using var zip = ZipFile.OpenRead(path);
        var executable = zip.GetEntry(BackendConfig.BedrockExecutable) ?? throw new InvalidDataException("The official Windows Bedrock package is missing bedrock_server.exe at its root.");
        using var input = executable.Open();
        Span<byte> dos = stackalloc byte[64]; input.ReadExactly(dos);
        if (dos[0] != 'M' || dos[1] != 'Z') throw new InvalidDataException("The Bedrock server is not a Windows executable.");
        var offset = BinaryPrimitives.ReadInt32LittleEndian(dos[60..]);
        if (offset < dos.Length || offset > MaximumPeHeaderOffset) throw new InvalidDataException("The Bedrock executable header is invalid.");
        var remaining = offset - dos.Length;
        var skip = new byte[8192];
        while (remaining > 0) { var read = input.Read(skip, 0, Math.Min(skip.Length, remaining)); if (read == 0) throw new EndOfStreamException(); remaining -= read; }
        Span<byte> pe = stackalloc byte[6]; input.ReadExactly(pe);
        if (BinaryPrimitives.ReadUInt32LittleEndian(pe) != 0x4550 || BinaryPrimitives.ReadUInt16LittleEndian(pe[4..]) != 0x8664)
            throw new InvalidDataException("A Windows x64 Bedrock server package is required.");
    }
}
