package com.orderhub.orders

import org.springframework.http.HttpStatus
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.*

@RestControllerAdvice
class ApiErrors {
  data class Err(val message: String, val details: Map<String,String> = emptyMap())

  @ExceptionHandler(HttpMessageNotReadableException::class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  fun unreadable(ex: HttpMessageNotReadableException) =
    Err("Invalid JSON", mapOf("cause" to (ex.mostSpecificCause?.message ?: "unreadable request")))
}
