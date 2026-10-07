using DeskHub.Api.Models;

namespace DeskHub.Api.Services.Telemetry;

public interface ITelemetryReader
{
    /// <summary>Снимает метрики. Вызывается последовательно из одного потока (TelemetryWorker).</summary>
    TelemetryModel Read(DateTimeOffset now);
}
