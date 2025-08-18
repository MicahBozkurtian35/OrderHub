package com.orderhub.orders

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.reactive.function.client.WebClient

@Configuration
class BillingClientConfig {
    @Bean
    fun billingWebClient(
        builder: WebClient.Builder,
        @Value("\${BILLING_BASE_URL:http://localhost:5102}") baseUrl: String
    ): WebClient = builder.baseUrl(baseUrl).build()
}
