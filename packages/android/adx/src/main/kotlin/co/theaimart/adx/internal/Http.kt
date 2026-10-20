package co.theaimart.adx.internal

import co.theaimart.adx.Guard
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

internal data class HttpResponse(
    val status: Int,
    val body: String,
    val retryAfter: Int?,
    val setCookie: String?,
)

/**
 * Minimal HTTP built on [HttpURLConnection] — no third-party dependency (avoids OkHttp and its
 * bot-blocklisted default User-Agent). The request URL is sent verbatim, so the fully
 * percent-encoded (WAF-safe) query reaches the server intact.
 *
 * Redirects are never followed (no serve endpoint redirects, and following one would replay the
 * `Cookie` to another host), and a body larger than [Guard.MAX_RESPONSE_BYTES] is an error.
 */
internal object Http {

    @Throws(Exception::class)
    fun get(url: String, headers: Map<String, String>, timeoutMs: Int): HttpResponse =
        request("GET", url, headers, null, timeoutMs)

    @Throws(Exception::class)
    fun post(url: String, headers: Map<String, String>, body: ByteArray, timeoutMs: Int): HttpResponse =
        request("POST", url, headers, body, timeoutMs)

    private fun request(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: ByteArray?,
        timeoutMs: Int,
    ): HttpResponse {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.instanceFollowRedirects = false
            conn.useCaches = false
            for ((k, v) in headers) conn.setRequestProperty(k, v)
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body) }
            }
            val status = conn.responseCode
            val stream: InputStream? = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.use { readAll(it) } ?: ""
            val retryAfter = conn.getHeaderField("Retry-After")?.trim()?.toIntOrNull()
            val setCookie = conn.getHeaderField("Set-Cookie")
            return HttpResponse(status, text, retryAfter, setCookie)
        } finally {
            conn.disconnect()
        }
    }

    private fun readAll(input: InputStream): String {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(8 * 1024)
        var total = 0
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            total += n
            if (total > Guard.MAX_RESPONSE_BYTES) throw IOException("response too large")
            out.write(buffer, 0, n)
        }
        return out.toString("UTF-8")
    }
}
