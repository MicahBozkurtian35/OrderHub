package com.orderhub.orders

import jakarta.persistence.*
import jakarta.validation.Valid
import jakarta.validation.constraints.*
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

// ===== JPA entities (unchanged) =====
@Entity
@Table(name = "orders")
data class Order(
    @Id val id: UUID = UUID.randomUUID(),
    val customerId: UUID,
    val total: BigDecimal,
    val createdAt: OffsetDateTime = OffsetDateTime.now()
)

@Entity
@Table(name = "order_items")
data class OrderItem(
    @Id val id: UUID = UUID.randomUUID(),
    val orderId: UUID,
    val sku: String,
    val qty: Int,
    val unitPrice: BigDecimal
)

// ===== Request DTOs (validation added) =====
data class CreateOrderItemReq(
    @field:NotBlank(message = "sku is required")
    @field:Size(max = 64, message = "sku too long")
    val sku: String,

    @field:Positive(message = "qty must be > 0")
    val qty: Int,

    @field:DecimalMin(value = "0.01", inclusive = true, message = "unitPrice must be >= 0.01")
    val unitPrice: BigDecimal
)

data class CreateOrderReq(
    @field:NotNull(message = "customerId is required")
    val customerId: UUID,

    @field:Size(min = 1, message = "at least one item is required")
    val items: List<@Valid CreateOrderItemReq>
)

// ===== Response DTO (unchanged) =====
data class OrderDto(
    val id: UUID,
    val customerId: UUID,
    val total: BigDecimal,
    val createdAt: OffsetDateTime
)
