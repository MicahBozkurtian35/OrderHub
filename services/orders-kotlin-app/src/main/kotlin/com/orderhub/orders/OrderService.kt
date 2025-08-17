package com.orderhub.orders

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.springframework.amqp.core.MessageDeliveryMode
import org.springframework.amqp.core.MessagePostProcessor
import org.springframework.amqp.rabbit.core.RabbitTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.math.BigDecimal
import java.util.UUID

// Minimal, stable event schema for consumers
data class OrderCreatedEvent(val orderId: UUID, val amount: BigDecimal)

@Service
class OrderService(
    private val orders: OrderRepo,
    private val items: OrderItemRepo,
    private val rabbit: RabbitTemplate
) {
    private val mapper = jacksonObjectMapper()

    private val persistentJson = MessagePostProcessor { msg ->
        msg.messageProperties.deliveryMode = MessageDeliveryMode.PERSISTENT
        msg.messageProperties.contentType = "application/json"
        msg
    }

    @Transactional
    fun create(req: CreateOrderReq): OrderDto {
        // ---- Validate request ----
        require(req.items.isNotEmpty()) { "items must not be empty" }
        req.items.forEachIndexed { idx, it ->
            require(it.qty > 0) { "items[$idx].qty must be > 0" }
            require(it.unitPrice > BigDecimal.ZERO) { "items[$idx].unitPrice must be > 0" }
        }

        // ---- Compute total & persist ----
        val total = req.items.fold(BigDecimal.ZERO) { acc, i -> acc + (i.unitPrice * i.qty.toBigDecimal()) }

        val order = orders.save(Order(customerId = req.customerId, total = total))
        val orderItems = req.items.map { i ->
            OrderItem(orderId = order.id, sku = i.sku, qty = i.qty, unitPrice = i.unitPrice)
        }
        items.saveAll(orderItems)

        // ---- Publish the event AFTER the DB commit ----
        val oid = order.id
        TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
            override fun afterCommit() {
                publishOrderCreated(oid, total)
            }
        })

        return OrderDto(order.id, order.customerId, order.total, order.createdAt)
    }

    private fun publishOrderCreated(orderId: UUID, total: BigDecimal) {
        val evt = OrderCreatedEvent(orderId = orderId, amount = total)
        val json = mapper.writeValueAsString(evt)

        rabbit.convertAndSend(
            "order.events",
            "order.created",
            json,
            MessagePostProcessor { msg ->
                // durable + useful header for tracing
                msg.messageProperties.deliveryMode = MessageDeliveryMode.PERSISTENT
                msg.messageProperties.contentType = "application/json"
                msg.messageProperties.headers["orderId"] = orderId.toString()
                msg
            }
        )
    }

    fun list(): List<OrderDto> =
        orders.findAll().map { OrderDto(it.id, it.customerId, it.total, it.createdAt) }

    fun get(id: UUID): OrderDto =
        orders.findById(id)
            .map { OrderDto(it.id, it.customerId, it.total, it.createdAt) }
            .orElseThrow { NoSuchElementException("Order $id not found") }
}
