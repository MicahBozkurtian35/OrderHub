package com.orderhub.orders

import jakarta.validation.Valid
import org.springframework.web.bind.annotation.*
import java.math.BigDecimal
import java.util.UUID

@RestController
@RequestMapping("/api/orders")
class OrderController(
    private val svc: OrderService,
    private val billing: BillingGateway
) {

    @PostMapping
    fun create(@Valid @RequestBody req: CreateOrderReq): OrderDto {
        val created = svc.create(req)

        // Compute amount from items (qty * unitPrice)
        val amount = req.items.fold(BigDecimal.ZERO) { acc, it ->
            acc + it.unitPrice.multiply(BigDecimal(it.qty))
        }

        // Fire-and-forget: if Billing is down, we log but do not fail the order
        billing.createInvoice(created.id, amount)

        return created
    }

    @GetMapping
    fun list(): List<OrderDto> = svc.list()

    @GetMapping("/{id}")
    fun get(@PathVariable id: UUID): OrderDto = svc.get(id)
}
