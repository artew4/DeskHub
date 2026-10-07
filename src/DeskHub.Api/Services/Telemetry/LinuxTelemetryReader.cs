using System.Globalization;
using DeskHub.Api.Models;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Services.Telemetry;

/// <summary>Чтение метрик Raspberry Pi из procfs/sysfs.</summary>
public sealed class LinuxTelemetryReader(IOptions<TelemetryOptions> options) : ITelemetryReader
{
    private readonly string _procRoot = options.Value.ProcRoot;
    private readonly string _sysRoot = options.Value.SysRoot;

    // Загрузка CPU считается по разнице двух замеров /proc/stat
    private CpuTimes? _previousCpu;

    public TelemetryModel Read(DateTimeOffset now)
    {
        var cpu = CpuTimes.Parse(File.ReadLines(Path.Combine(_procRoot, "stat")).First());
        var cpuPercent = _previousCpu is { } previous ? cpu.UsagePercentSince(previous) : 0;
        _previousCpu = cpu;

        var (usedMb, totalMb) = ParseMemInfo(File.ReadLines(Path.Combine(_procRoot, "meminfo")));

        return new TelemetryModel(
            CpuPercent: Math.Round(cpuPercent, 1),
            RamUsedMb: usedMb,
            RamTotalMb: totalMb,
            TemperatureC: ReadTemperature(),
            UptimeSeconds: ParseUptime(File.ReadAllText(Path.Combine(_procRoot, "uptime"))),
            Timestamp: now);
    }

    private double? ReadTemperature()
    {
        // Значение в миллиградусах: "54250" → 54.3 °C. В контейнере без датчика файла может не быть.
        var path = Path.Combine(_sysRoot, "class/thermal/thermal_zone0/temp");
        return File.Exists(path) && int.TryParse(File.ReadAllText(path).Trim(), CultureInfo.InvariantCulture, out var milli)
            ? Math.Round(milli / 1000.0, 1)
            : null;
    }

    /// <summary>used = MemTotal − MemAvailable (MemFree не учитывает кэш, который ядро может освободить).</summary>
    internal static (int UsedMb, int TotalMb) ParseMemInfo(IEnumerable<string> lines)
    {
        long totalKb = 0, availableKb = 0;
        foreach (var line in lines)
        {
            if (line.StartsWith("MemTotal:", StringComparison.Ordinal)) totalKb = ParseKb(line);
            else if (line.StartsWith("MemAvailable:", StringComparison.Ordinal)) availableKb = ParseKb(line);
            if (totalKb > 0 && availableKb > 0) break;
        }
        return ((int)((totalKb - availableKb) / 1024), (int)(totalKb / 1024));

        static long ParseKb(string line) =>
            long.Parse(line.Split(' ', StringSplitOptions.RemoveEmptyEntries)[1], CultureInfo.InvariantCulture);
    }

    /// <summary>Первое число /proc/uptime — секунды с загрузки (дробное).</summary>
    internal static long ParseUptime(string content) =>
        (long)double.Parse(content.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0], CultureInfo.InvariantCulture);

    /// <summary>Строка "cpu  user nice system idle iowait irq softirq steal guest guest_nice".</summary>
    internal readonly record struct CpuTimes(long Idle, long Total)
    {
        public static CpuTimes Parse(string line)
        {
            var values = line.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Skip(1)
                .Take(8) // guest/guest_nice уже входят в user/nice
                .Select(v => long.Parse(v, CultureInfo.InvariantCulture))
                .ToArray();
            return new CpuTimes(Idle: values[3] + values[4], Total: values.Sum());
        }

        public double UsagePercentSince(CpuTimes previous)
        {
            var totalDelta = Total - previous.Total;
            return totalDelta <= 0 ? 0 : 100.0 * (1 - (double)(Idle - previous.Idle) / totalDelta);
        }
    }
}
