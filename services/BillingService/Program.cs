using BillingService.Data;
using BillingService.Messaging;
using BillingService;
using Microsoft.AspNetCore.Mvc;
using BillingService.Models;

var builder = WebApplication.CreateBuilder(args);

// ---- CORS for the React dev server ----
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:5173")
     .AllowAnyHeader()
     .AllowAnyMethod()
));

// ---- Options / DI ----
builder.Services.Configure<MongoSettings>(builder.Configuration.GetSection("Mongo"));
builder.Services.Configure<RabbitSettings>(builder.Configuration.GetSection("Rabbit"));
builder.Services.AddSingleton<InvoiceRepository>();
builder.Services.AddHostedService<OrderConsumer>();

// ---- Swagger ----
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();

// ---------- Routes ----------

// Health
app.MapGet("/api/health", async (InvoiceRepository repo) =>
{
    try
    {
        await repo.CountAsync();
        return Results.Ok(new { status = "ok" });
    }
    catch (Exception ex)
    {
        return Results.Problem(
            title: "mongo unreachable",
            detail: ex.Message,
            statusCode: 503
        );
    }
});

// List invoices (newest first), with optional ?limit (default 50)
app.MapGet("/api/invoices", async ([FromQuery] int? limit, InvoiceRepository repo) =>
{
    var n = (limit is > 0) ? limit!.Value : 50;
    var rows = await repo.ListAsync(n);
    return Results.Ok(rows);
});

// Recent invoices since ?minutes (default 30)
app.MapGet("/api/invoices/recent", async ([FromQuery] int? minutes, InvoiceRepository repo) =>
{
    var m = (minutes is > 0) ? minutes!.Value : 30;
    var since = DateTime.UtcNow.AddMinutes(-m);
    var rows = await repo.ListSinceAsync(since, 200);
    return Results.Ok(rows);
});

// Delete one invoice by orderId
app.MapDelete("/api/invoices/{orderId}", async (string orderId, InvoiceRepository repo) =>
{
    var deleted = await repo.DeleteByOrderAsync(orderId);
    return deleted > 0 ? Results.NoContent() : Results.NotFound();
});

// Bulk delete: either all=true OR olderThanMinutes=N
app.MapDelete("/api/invoices", async ([FromQuery] bool all, [FromQuery] int? olderThanMinutes, InvoiceRepository repo) =>
{
    if (all)
    {
        var n = await repo.DeleteAllAsync();
        return Results.Ok(new { deleted = n });
    }

    if (olderThanMinutes is int m && m > 0)
    {
        var cutoff = DateTime.UtcNow.AddMinutes(-m);
        var n = await repo.DeleteOlderThanAsync(cutoff);
        return Results.Ok(new { deleted = n });
    }

    return Results.BadRequest(new { message = "Specify ?all=true or ?olderThanMinutes=N" });
});


app.Run("http://localhost:8082");
