using System.Text.Json;
using System.Text.Json.Serialization;
using DeskHub.Api.Hubs;
using DeskHub.Api.Models;

var builder = WebApplication.CreateBuilder(args);

// Единые правила JSON для REST и SignalR: camelCase, enum строками ("heavy")
var enumConverter = new JsonStringEnumConverter(JsonNamingPolicy.CamelCase);
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(enumConverter));

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services
    .AddSignalR(o =>
    {
        // Согласовано с клиентом (withKeepAliveInterval / withServerTimeout)
        o.KeepAliveInterval = TimeSpan.FromSeconds(10);
        o.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
        o.EnableDetailedErrors = builder.Environment.IsDevelopment();
    })
    .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(enumConverter));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<DashboardNotifier>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// React-билд из wwwroot (см. knowledge/Backend_dotnet/Core_Architecture.md, раздел 3)
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
        ctx.Context.Response.Headers.CacheControl = ctx.Context.Request.Path.StartsWithSegments("/assets")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
});

app.MapHealthChecks("/health");

app.MapGet("/api/dashboard/snapshot", (TimeProvider time) => StubData.CreateSnapshot(time.GetUtcNow()))
    .WithName("GetDashboardSnapshot");

app.MapHub<DashboardHub>("/hubs/dashboard");

// Неизвестные /api/* и /hubs/* — 404, а не index.html
app.Map("/api/{**path}", () => Results.NotFound());
app.Map("/hubs/{**path}", () => Results.NotFound());

// SPA fallback — всегда последним
app.MapFallbackToFile("index.html", new StaticFileOptions
{
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
});

app.Run();
