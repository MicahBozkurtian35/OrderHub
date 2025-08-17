using System.Text;
using System.Text.Json;
using BillingService.Data;
using BillingService.Models;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace BillingService.Messaging
{
  public class RabbitSettings
  {
    public string Host { get; set; } = "localhost";
    public string User { get; set; } = "guest";
    public string Pass { get; set; } = "guest";
    public string VHost { get; set; } = "/";                 // optional; works for dev
    public string Exchange { get; set; } = "order.events";
    public string RoutingKey { get; set; } = "order.created";
    public string Queue { get; set; } = "billing.invoice.create";
  }

  public class OrderConsumer : BackgroundService
  {
    private readonly InvoiceRepository _repo;
    private readonly RabbitSettings _cfg;
    private IConnection? _conn;
    private IModel? _ch;

    public OrderConsumer(InvoiceRepository repo, IOptions<RabbitSettings> cfg)
    {
      _repo = repo;
      _cfg = cfg.Value;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
      var factory = new ConnectionFactory
      {
        HostName = _cfg.Host,
        UserName = _cfg.User,
        Password = _cfg.Pass,
        VirtualHost = _cfg.VHost,
        DispatchConsumersAsync = true          // important for async handler
      };

      _conn = factory.CreateConnection();
      _ch   = _conn.CreateModel();

      // Prefer fair dispatch & back-pressure
      _ch.BasicQos(0, 20, false);

      // Main exchange/queue (durable) with DLX
      _ch.ExchangeDeclare(_cfg.Exchange, ExchangeType.Topic, durable: true, autoDelete: false, arguments: null);

      var dlxName = $"{_cfg.Exchange}.dlx";
      var dlqRk   = $"{_cfg.RoutingKey}.dead";

      var args = new Dictionary<string, object>
      {
        ["x-dead-letter-exchange"]    = dlxName,
        ["x-dead-letter-routing-key"] = dlqRk
      };

      _ch.QueueDeclare(_cfg.Queue, durable: true, exclusive: false, autoDelete: false, arguments: args);
      _ch.QueueBind(_cfg.Queue, _cfg.Exchange, _cfg.RoutingKey);

      // DLX + DLQ (durable)
      _ch.ExchangeDeclare(dlxName, ExchangeType.Topic, durable: true, autoDelete: false, arguments: null);
      _ch.QueueDeclare("billing.invoice.dead", durable: true, exclusive: false, autoDelete: false, arguments: null);
      _ch.QueueBind("billing.invoice.dead", dlxName, dlqRk);

      var consumer = new AsyncEventingBasicConsumer(_ch);
      consumer.Received += async (_, ea) =>
      {
        try
        {
          var json = Encoding.UTF8.GetString(ea.Body.ToArray());
          using var doc = JsonDocument.Parse(json);
          var root = doc.RootElement;

          if (!root.TryGetProperty("orderId", out var orderIdEl))
            throw new Exception("orderId missing");

          var orderId = orderIdEl.GetString();
          if (string.IsNullOrWhiteSpace(orderId))
            throw new Exception("orderId empty");

          // Support either "amount" or "total" from the producer
          decimal amount =
              (root.TryGetProperty("amount", out var a) ? a.TryGetDecimal(out var ad) ? ad : throw new Exception("amount not decimal") :
              (root.TryGetProperty("total", out var t)  ? t.TryGetDecimal(out var td) ? td : throw new Exception("total not decimal")
                                                         : throw new Exception("amount/total missing")));

          // Idempotence via unique index: try insert, ack duplicate
          try
          {
            await _repo.AddAsync(new Invoice { OrderId = orderId, Amount = amount });
          }
          catch (MongoWriteException mwx) when (mwx.WriteError?.Category == ServerErrorCategory.DuplicateKey)
          {
            // already processed; treat as success
          }

          _ch!.BasicAck(ea.DeliveryTag, false);
        }
        catch
        {
          // send to DLQ
          _ch!.BasicNack(ea.DeliveryTag, multiple: false, requeue: false);
        }
      };

      _ch.BasicConsume(_cfg.Queue, autoAck: false, consumer: consumer);
      return Task.CompletedTask;
    }

    public override void Dispose()
    {
      try { _ch?.Close(); } catch { /* no-op */ }
      try { _conn?.Close(); } catch { /* no-op */ }
      base.Dispose();
    }
  }

  // small helper for System.Text.Json decimals
  internal static class JsonExtensions
  {
    public static bool TryGetDecimal(this JsonElement el, out decimal value)
    {
      try { value = el.GetDecimal(); return true; }
      catch { value = default; return false; }
    }
  }
}
