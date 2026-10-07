using System.ComponentModel.DataAnnotations;

namespace DeskHub.Api.Services.Telemetry;

public sealed class TelemetryOptions
{
    public const string SectionName = "Telemetry";

    [Range(1, 60)]
    public int IntervalSeconds { get; init; } = 1;

    /// <summary>Корень procfs. В Docker — смонтированный хостовый /proc (/host/proc).</summary>
    [Required]
    public string ProcRoot { get; init; } = "/proc";

    /// <summary>Корень sysfs. В Docker — смонтированный хостовый /sys (/host/sys).</summary>
    [Required]
    public string SysRoot { get; init; } = "/sys";
}
