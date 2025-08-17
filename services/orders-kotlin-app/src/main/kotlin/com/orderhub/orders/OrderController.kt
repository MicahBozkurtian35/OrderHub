package com.orderhub.orders

import org.springframework.web.bind.annotation.*
import java.util.UUID
import jakarta.validation.Valid

@RestController
@RequestMapping("/api/orders")
class OrderController(private val svc: OrderService) {

    @PostMapping
    fun create(@Valid @RequestBody req: CreateOrderReq): OrderDto = svc.create(req)

    @GetMapping
    fun list(): List<OrderDto> = svc.list()

    @GetMapping("/{id}")
    fun get(@PathVariable id: UUID): OrderDto = svc.get(id)
}
