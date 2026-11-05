package com.nishi.stresslog.watchprobe

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import java.net.URI
import java.security.cert.CertificateFactory

/** Only the authenticated ADB shell (DUMP permission) can provision this entry point. */
class LiveSetupActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            val receiver = intent.getStringExtra("receiver") ?: error("Missing receiver")
            val certificate = intent.getStringExtra("certificate") ?: error("Missing certificate")
            val token = intent.getStringExtra("authToken") ?: error("Missing token")
            val uri = URI(receiver)
            require(uri.scheme == "https" && uri.host != null && uri.path == "/ingest" && uri.userInfo == null)
            require(token.matches(Regex("[a-f0-9]{64}")))
            val pem = Base64.decode(certificate, Base64.DEFAULT)
            CertificateFactory.getInstance("X.509").generateCertificate(pem.inputStream())
            getSharedPreferences("live", MODE_PRIVATE).edit().putString("receiver", receiver)
                .putString("certificate", certificate).putString("token", token).commit()
            startActivity(Intent(this, LiveActivity::class.java).putExtra("resumeAfterSetup", intent.getBooleanExtra("resume", false)))
        } catch (_: Exception) {
            android.widget.Toast.makeText(this, "PC接続の設定に失敗しました", android.widget.Toast.LENGTH_LONG).show()
        }
        finish()
    }
}
