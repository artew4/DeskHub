namespace DeskHub.Api.Models;

/// <summary>Текущая погода для виджета дашборда.</summary>
/// <param name="Temperature">Температура воздуха, °C.</param>
/// <param name="Description">Текстовое описание («Облачно»).</param>
/// <param name="Icon">Ключ иконки для фронтенда (например, "cloud", "sun").</param>
/// <param name="UpdatedAt">Когда бэкенд получил данные (UTC).</param>
public sealed record WeatherModel(
    double Temperature,
    string Description,
    string Icon,
    DateTimeOffset UpdatedAt);
