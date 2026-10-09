using System.ComponentModel.DataAnnotations;

namespace DeskHub.Api.Services.Power;

public sealed class PowerOptions
{
    public const string SectionName = "Power";

    /// <summary>Часовой пояс расписания (IANA).</summary>
    [Required] public string TimeZone { get; init; } = "Europe/Moscow";

    /// <summary>Начало затемнения (Dimmed).</summary>
    public TimeSpan DimFrom { get; init; } = TimeSpan.Zero; // 00:00

    /// <summary>Начало сна (Sleep).</summary>
    public TimeSpan SleepFrom { get; init; } = new(1, 30, 0); // 01:30

    /// <summary>Начало обычной работы (Normal).</summary>
    public TimeSpan NormalFrom { get; init; } = new(8, 0, 0); // 08:00

    /// <summary>Сколько длится временное пробуждение по WakeScreen().</summary>
    [Range(1, 60)] public int WakeMinutes { get; init; } = 5;

    /// <summary>
    /// Демон питания дисплея на хосте (POST sleep / wake), с завершающим «/». Пусто — аппаратное отключение HDMI выключено.
    /// </summary>
    public string DisplayHostUrl { get; init; } = "http://host.docker.internal:5055/";
}
