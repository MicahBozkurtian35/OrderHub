# OrderHub

OrderHub is a microservices learning project that demonstrates service-to-service communication, event handling, and persistence.  
It includes:

- **OrdersService** (Kotlin + Gradle) — handles creation, storage, and management of orders using a Postgres database.  
- **BillingService** (C#/.NET) — processes invoices and payment updates, using in-memory storage by default.  
- **RabbitMQ** — enables asynchronous communication between Orders and Billing.  
- **React + Vite Frontend** — provides a simple UI for creating orders, viewing invoices, and marking payments.  
- **Infrastructure** — RabbitMQ, Postgres, and optional MongoDB are containerized with Docker Compose.

This project showcases concepts like RESTful APIs, message queues, microservices architecture, database persistence, and frontend-backend integration.
