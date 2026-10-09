using Microsoft.Extensions.Options;

namespace DeskHub.Api.Services.Power;

/// <summary>
/// Аппаратное питание дисплея через демон на хосте (display_manager.py, knowledge/Infrastructure/Hardware_Display_Power.md).
/// Матрица не поддерживает DDC/CI — хост гасит HDMI-сигнал (wlr-randr --off), матрица уходит в «No Signal»,
/// тачскрин продолжает работать и будит экран.
///
/// - <c>POST {DisplayHostUrl}sleep</c> — при переходе в Sleep; <c>POST {DisplayHostUrl}wake</c> — при выходе из Sleep
///   (утро по расписанию, касание в браузере), чтобы HDMI включился и без касания, которое ловит демон.
/// - Fire-and-forget: запросы выстраиваются в цепочку (sleep/wake не обгоняют друг друга), таймаут 2 с, любые ошибки —
///   только предупреждение в лог. Демона нет (разработка на Mac) — бэкенд работает как обычно.
/// </summary>
public sealed class DisplayHostClient(IHttpClientFactory httpClientFactory, IOptions<PowerOptions> options, ILogger<DisplayHostClient> logger)
{
    public const string HttpClientName = "DisplayHost";
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(2);

    private readonly Lock _lock = new();
    private Task _chain = Task.CompletedTask;

    public bool Enabled => !string.IsNullOrWhiteSpace(options.Value.DisplayHostUrl);

    /// <summary>Поставить в очередь команду демону: true — погасить HDMI, false — включить.</summary>
    public void Send(bool sleep)
    {
        if (!Enabled) return;
        lock (_lock) _chain = _chain.ContinueWith(_ => PostAsync(sleep ? "sleep" : "wake"), TaskScheduler.Default).Unwrap();
    }

    private async Task PostAsync(string command)
    {
        try
        {
            using var cts = new CancellationTokenSource(Timeout);
            using var response = await httpClientFactory.CreateClient(HttpClientName).PostAsync(command, content: null, cts.Token);
            if (response.IsSuccessStatusCode)
                logger.LogInformation("Display host: {Command} OK", command);
            else
                logger.LogWarning("Display host: {Command} → HTTP {Status}", command, (int)response.StatusCode);
        }
        catch (Exception ex)
        {
            // Демон не запущен / хоста нет (локальная разработка) / таймаут — не критично
            logger.LogWarning("Display host unavailable ({Command}): {Error}", command, ex.Message);
        }
    }
}
