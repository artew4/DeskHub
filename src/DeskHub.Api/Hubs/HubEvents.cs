namespace DeskHub.Api.Hubs;

/// <summary>Имена событий хаба. Должны совпадать с HubEvents во фронтенде (src/services/signalrConnection.ts).</summary>
public static class HubEvents
{
    public const string WeatherUpdated = nameof(WeatherUpdated);
    public const string TrafficUpdated = nameof(TrafficUpdated);
    public const string TelemetryTick = nameof(TelemetryTick);
    public const string CalendarUpdated = nameof(CalendarUpdated);
    public const string PowerModeChanged = nameof(PowerModeChanged);
}
