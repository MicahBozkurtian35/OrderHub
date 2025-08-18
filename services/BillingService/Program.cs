using Microsoft.AspNetCore.Routing;

var builder = WebApplication.CreateBuilder(args);

// Core services
builder.Services.AddHealthChecks();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .AllowAnyHeader()
    .AllowAnyMethod()
    .WithOrigins(
        "http://localhost:5173","http://127.0.0.1:5173",
        "http://localhost:3000","http://127.0.0.1:3000")));

// ✅ Controllers (attribute routing: /api/..., /invoices/...)
builder.Services.AddControllers();

// ✅ Dev-friendly in-memory invoice store via DI (swap later for your real repo)
builder.Services.AddSingleton<IInvoiceStore, InMemoryInvoiceStore>();

var app = builder.Build();

app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Health + root
app.MapHealthChecks("/health");
app.MapGet("/", () => Results.Redirect("/swagger"));

// ✅ Map controllers
app.MapControllers();

// Route inspector (helps verify what’s mapped)
if (app.Environment.IsDevelopment())
{
    app.MapGet("/_routes", (IEnumerable<EndpointDataSource> sources) =>
    {
        var routes = sources.SelectMany(s => s.Endpoints)
            .OfType<RouteEndpoint>()
            .Select(e => e.RoutePattern.RawText)
            .Distinct()
            .OrderBy(x => x);
        return Results.Ok(routes);
    });
}

app.Run();

// ===== Contracts =====
public record CreateInvoiceDto(string OrderId, decimal Amount);
public record InvoiceDto(Guid Id, string OrderId, decimal Amount, string Status, DateTime CreatedAt);

// ===== Minimal store abstraction =====
public interface IInvoiceStore
{
    IEnumerable<InvoiceDto> List(int take = 100);
    InvoiceDto? Get(Guid id);
    InvoiceDto Add(CreateInvoiceDto req);
    InvoiceDto? MarkPaid(Guid id);
}

// ===== In-memory impl (replace later with your repository/DB) =====
public class InMemoryInvoiceStore : IInvoiceStore
{
    private readonly Dictionary<Guid, InvoiceDto> _data = new();
    private readonly object _lock = new();

    public IEnumerable<InvoiceDto> List(int take = 100)
    {
        lock (_lock) { return _data.Values.OrderByDescending(x => x.CreatedAt).Take(take).ToArray(); }
    }

    public InvoiceDto? Get(Guid id)
    {
        lock (_lock) { return _data.TryGetValue(id, out var v) ? v : null; }
    }

    public InvoiceDto Add(CreateInvoiceDto req)
    {
        lock (_lock)
        {
            var inv = new InvoiceDto(Guid.NewGuid(), req.OrderId, req.Amount, "unpaid", DateTime.UtcNow);
            _data[inv.Id] = inv;
            return inv;
        }
    }

    public InvoiceDto? MarkPaid(Guid id)
    {
        lock (_lock)
        {
            if (!_data.TryGetValue(id, out var inv)) return null;
            var updated = inv with { Status = "paid" };
            _data[id] = updated;
            return updated;
        }
    }
}
