package com.orderhub.orders

import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import reactor.core.publisher.Mono
import java.math.BigDecimal
import java.time.Duration
import java.util.UUID

@Component
class BillingGateway(private val billing: WebClient) {

    data class CreateInvoicePayload(val orderId: String, val amount: BigDecimal)

    /** Fire-and-forget: logs on failure, never breaks order creation */
    fun createInvoice(orderId: UUID, amount: BigDecimal) {
        runCatching {
            billing.post()
                .uri("/api/invoices")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(CreateInvoicePayload(orderId.toString(), amount))
                .retrieve()
                .toBodilessEntity()
                .timeout(Duration.ofSeconds(3))
                .onErrorResume { Mono.empty() }
                .block()
        }.onFailure { e ->
            log.warn("Billing createInvoice failed for order {}: {}", orderId, e.message)
        }
    }

    private companion object {
        val log = LoggerFactory.getLogger(BillingGateway::class.java)
    }
}
