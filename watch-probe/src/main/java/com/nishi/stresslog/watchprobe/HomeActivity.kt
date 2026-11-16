package com.nishi.stresslog.watchprobe

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.widget.TextView
import android.widget.Button
import android.widget.Toast

/** Everyday entry point; sensor diagnostics stay behind a secondary action. */
class HomeActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var connection: TextView
    private lateinit var primary: Button
    private var launchHandled = false
    private val refresh = object : Runnable {
        override fun run() {
            val ack = LiveMeasurementService.lastAcknowledgedAt
            val configured = getSharedPreferences("live", MODE_PRIVATE).contains("receiver")
            val connected = ack != null && SystemClock.elapsedRealtime() - ack < 15_000L
            primary.text = if (!BuildConfig.WATCH_UI_PREVIEW && WatchUi.measurementRunning(this@HomeActivity)) "計測をひらく" else "長時間計測を開始"
            connection.text = when {
                BuildConfig.WATCH_UI_PREVIEW -> "時計 → Wi-Fi → PC"
                connected -> "● PCへデータを送信中"
                configured -> "PCへの接続設定済み"
                else -> "はじめにPCで接続を設定"
            }
            connection.setTextColor(if (connected) WatchUi.mint else WatchUi.muted)
            handler.postDelayed(this, 5000)
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val column = WatchUi.page(this)
        column.setPadding(WatchUi.dp(this, 24), WatchUi.dp(this, 24), WatchUi.dp(this, 24), WatchUi.dp(this, 40))
        WatchUi.text(column, if (BuildConfig.WATCH_UI_PREVIEW) "StressLog · UI" else "StressLog", 11f, WatchUi.mint, true)
        WatchUi.gap(column, 9)
        WatchUi.text(column, "いまを、知る。", 18f, bold = true)
        WatchUi.gap(column, 7)
        WatchUi.text(column, "時計のデータから\nストレス反応をチェック", 11f, WatchUi.muted)
        WatchUi.gap(column, 12)
        primary = WatchUi.button(column, "長時間計測を開始", primary = true) {
            val open = Intent(this, LiveActivity::class.java)
            if (BuildConfig.WATCH_UI_PREVIEW || !WatchUi.measurementRunning(this)) open.putExtra("startContinuousCapture", true)
            startActivity(open)
        }
        WatchUi.gap(column, 24)
        connection = WatchUi.text(column, "", 10f, WatchUi.muted)
        WatchUi.gap(column, 20)
        WatchUi.text(column, "結果はPCのアプリで", 12f, bold = true)
        WatchUi.gap(column, 5)
        WatchUi.text(column, "計測中は文字盤に戻っても\nデータを送信します。", 11f, WatchUi.muted)
        WatchUi.gap(column, 14)
        WatchUi.button(column, "計測モードを選ぶ") {
            startActivity(Intent(this, LiveActivity::class.java))
        }
        WatchUi.gap(column, 8)
        WatchUi.button(column, "センサー・詳細") {
            if (BuildConfig.WATCH_UI_PREVIEW) Toast.makeText(this, "プレビューではセンサーを動かしません", Toast.LENGTH_SHORT).show()
            else startActivity(Intent(this, ProbeActivity::class.java))
        }
        WatchUi.gap(column, 12)
        WatchUi.previewLabel(column)
        WatchUi.text(column, "v${BuildConfig.VERSION_NAME}", 9f, WatchUi.muted)
    }
    override fun onResume() {
        super.onResume(); handler.removeCallbacks(refresh); handler.post(refresh)
        val prefs = getSharedPreferences("live", MODE_PRIVATE)
        if (!launchHandled && intent.action == Intent.ACTION_MAIN) {
            launchHandled = true
            if (!BuildConfig.WATCH_UI_PREVIEW && prefs.getBoolean("autoStartOnOpen", false) && !prefs.getBoolean("autoStartBlocked", false) &&
                prefs.contains("receiver") && !WatchUi.measurementRunning(this)) {
                startActivity(Intent(this, LiveActivity::class.java).putExtra("startContinuousCapture", true))
            }
        }
    }
    override fun onPause() { handler.removeCallbacks(refresh); super.onPause() }
    override fun onNewIntent(intent: Intent?) { super.onNewIntent(intent); setIntent(intent); launchHandled = false }
}
