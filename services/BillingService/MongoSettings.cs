namespace BillingService
{
  // Binds to appsettings.json section: "Mongo": { "ConnectionString": "...", "Database": "..." }
  public class MongoSettings
  {
    public string ConnectionString { get; set; } = "mongodb://localhost:27017";
    public string Database { get; set; } = "billingdb";
  }
}
