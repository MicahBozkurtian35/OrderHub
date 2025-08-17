package com.orderhub.orders

import org.springframework.amqp.core.TopicExchange
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class RabbitConfig {
    @Bean
    fun ordersExchange() = TopicExchange("order.events", true, false)
}
