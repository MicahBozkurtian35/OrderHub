package com.orderhub.orders

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface OrderRepo : JpaRepository<Order, UUID>
interface OrderItemRepo : JpaRepository<OrderItem, UUID> {
    fun findByOrderId(orderId: UUID): List<OrderItem>
}
