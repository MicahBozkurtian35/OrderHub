using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using BillingService.Models;

namespace BillingService.Data
{
  public class InvoiceRepository
  {
    private readonly IMongoCollection<Invoice> _col;

    public InvoiceRepository(IOptions<MongoSettings> settings)
    {
      var cfg = settings.Value;
      var client = new MongoClient(cfg.ConnectionString);
      var db = client.GetDatabase(cfg.Database);

      _col = db.GetCollection<Invoice>("invoices");

      // Ensure UNIQUE index on OrderId for idempotence
      EnsureOrderIdUniqueIndex();
    }

    private void EnsureOrderIdUniqueIndex()
    {
      // Find an index whose key is exactly { OrderId: 1 }
      var indexes = _col.Indexes.List().ToList();
      BsonDocument? orderIdIndex = null;

      foreach (var ix in indexes)
      {
        if (ix.TryGetValue("key", out var keyVal) && keyVal.IsBsonDocument)
        {
          var keyDoc = keyVal.AsBsonDocument;
          if (keyDoc.ElementCount == 1 &&
              keyDoc.TryGetValue(nameof(Invoice.OrderId), out var v) &&
              v.IsInt32 && v.AsInt32 == 1)
          {
            orderIdIndex = ix;
            break;
          }
        }
      }

      const string desiredName = "OrderId_1";

      if (orderIdIndex is null)
      {
        // Create unique index if none exists
        var model = new CreateIndexModel<Invoice>(
          Builders<Invoice>.IndexKeys.Ascending(i => i.OrderId),
          new CreateIndexOptions { Unique = true, Name = desiredName }
        );
        _col.Indexes.CreateOne(model);
        return;
      }

      // If it exists but isn't unique, drop & recreate as unique
      var isUnique = orderIdIndex.TryGetValue("unique", out var uniqVal) &&
                     uniqVal.IsBoolean && uniqVal.AsBoolean;

      if (!isUnique)
      {
        var currentName = orderIdIndex.TryGetValue("name", out var nameVal) && nameVal.IsString
          ? nameVal.AsString
          : desiredName;

        _col.Indexes.DropOne(currentName);

        var uniqueModel = new CreateIndexModel<Invoice>(
          Builders<Invoice>.IndexKeys.Ascending(i => i.OrderId),
          new CreateIndexOptions { Unique = true, Name = desiredName }
        );
        _col.Indexes.CreateOne(uniqueModel);
      }
    }

    // ---------- Queries ----------
    public async Task<Invoice?> GetByOrderAsync(string orderId) =>
      await _col.Find(i => i.OrderId == orderId).FirstOrDefaultAsync();

    public Task<long> CountAsync() =>
      _col.CountDocumentsAsync(FilterDefinition<Invoice>.Empty);

    public Task<List<Invoice>> ListAsync(int limit = 200) =>
      _col.Find(FilterDefinition<Invoice>.Empty)
          .SortByDescending(i => i.CreatedAt)
          .Limit(limit)
          .ToListAsync();

    public Task<List<Invoice>> ListSinceAsync(DateTime sinceUtc, int limit = 200) =>
      _col.Find(i => i.CreatedAt >= sinceUtc)
          .SortByDescending(i => i.CreatedAt)
          .Limit(limit)
          .ToListAsync();

    // ---------- Commands ----------
    public Task AddAsync(Invoice invoice) =>
      _col.InsertOneAsync(invoice);

    public async Task<bool> UpdateStatusAsync(string orderId, string status)
    {
      var update = Builders<Invoice>.Update.Set(i => i.Status, status);
      var res = await _col.UpdateOneAsync(i => i.OrderId == orderId, update);
      return res.ModifiedCount > 0;
    }

    public async Task<long> DeleteAllAsync()
    {
      var res = await _col.DeleteManyAsync(Builders<Invoice>.Filter.Empty);
      return res.DeletedCount;
    }

    public async Task<long> DeleteByOrderAsync(string orderId)
    {
      var res = await _col.DeleteOneAsync(i => i.OrderId == orderId);
      return res.DeletedCount;
    }

    public async Task<long> DeleteOlderThanAsync(DateTime cutoffUtc)
    {
      var filter = Builders<Invoice>.Filter.Lt(i => i.CreatedAt, cutoffUtc);
      var res = await _col.DeleteManyAsync(filter);
      return res.DeletedCount;
    }
  }
}
