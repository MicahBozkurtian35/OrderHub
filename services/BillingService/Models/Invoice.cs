using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;

namespace BillingService.Models {
  public class Invoice {
    [BsonId] public ObjectId Id { get; set; }
    public string InvoiceId { get; set; } = Guid.NewGuid().ToString();
    public string OrderId { get; set; } = "";
    public decimal Amount { get; set; }
    public string Status { get; set; } = "OPEN";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  }
}
