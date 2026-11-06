package com.nishi.stresslog.watchprobe

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class LiveActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var phase: TextView
    private lateinit var detail: TextView
    private lateinit var dial: MeasurementDial
    private lateinit var start: Button
    private lateinit var stop: Button
    private lateinit var modeRow: LinearLayout
    private lateinit var shortMode: Button
    private lateinit var continuousMode: Button
    private lateinit var technical: TextView
    private var limitedCapture = true
    private var localMessage: String? = null
    private var previewState = "ready"
    private val refresh = object : Runnable {
        override fun run() { render(); handler.postDelayed(this, 5000) }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.WATCH_UI_PREVIEW) previewState = intent.getStringExtra("previewState") ?: "ready"
        val column = WatchUi.page(this)
        column.setPadding(WatchUi.dp(this, 32), WatchUi.dp(this, 16), WatchUi.dp(this, 32), WatchUi.dp(this, 40))
        WatchUi.text(column, if (BuildConfig.WATCH_UI_PREVIEW) "StressLog · UIプレビュー" else "StressLog", 10f, WatchUi.muted)
        WatchUi.gap(column, 4)
        phase = WatchUi.badge(column, "計測の準備")
        WatchUi.gap(column, 4)
        dial = MeasurementDial(this)
        column.addView(dial, LinearLayout.LayoutParams(WatchUi.dp(this, 72), WatchUi.dp(this, 72)))
        WatchUi.gap(column, 6)
        start = WatchUi.button(column, "7分計測を開始", primary = true) { startMeasurement() }
        stop = WatchUi.button(column, "計測を終了") {
            if (BuildConfig.WATCH_UI_PREVIEW) previewState = "complete"
            else {
                stopService(Intent(this, LiveMeasurementService::class.java))
                getSharedPreferences("live", MODE_PRIVATE).edit().putString("status", "停止しました").apply()
            }
            localMessage = null; render()
        }
        WatchUi.gap(column, 8)
        modeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            column.addView(this, LinearLayout.LayoutParams(-1, -2))
        }
        shortMode = WatchUi.button(modeRow, "7分") { limitedCapture = true; render() }
        shortMode.layoutParams = LinearLayout.LayoutParams(0, WatchUi.dp(this, 40), 1f).apply { marginEnd = WatchUi.dp(this@LiveActivity, 3) }
        continuousMode = WatchUi.button(modeRow, "連続") { limitedCapture = false; render() }
        continuousMode.layoutParams = LinearLayout.LayoutParams(0, WatchUi.dp(this, 40), 1f).apply { marginStart = WatchUi.dp(this@LiveActivity, 3) }
        WatchUi.gap(column, 12)
        detail = WatchUi.text(column, "", 11f, WatchUi.muted)
        WatchUi.gap(column, 18)
        WatchUi.text(column, "結果はPCに届きます", 12f, bold = true)
        WatchUi.gap(column, 6)
        WatchUi.text(column, "文字盤に戻っても計測は続きます。\n体感の入力は必要ありません。", 11f, WatchUi.muted)
        WatchUi.gap(column, 14)
        WatchUi.button(column, "接続の詳細") {
            technical.visibility = if (technical.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }
        WatchUi.gap(column, 8)
        technical = WatchUi.text(column, "", 10f, WatchUi.muted).apply { visibility = View.GONE }
        WatchUi.gap(column, 8)
        WatchUi.previewLabel(column)
        render()
    }

    private fun render() {
        val preview = BuildConfig.WATCH_UI_PREVIEW
        val prefs = getSharedPreferences("live", MODE_PRIVATE)
        val saved = prefs.getString("status", "停止中").orEmpty()
        val running = if (preview) previewState in listOf("sending", "waiting", "wear") else WatchUi.measurementRunning(this)
        val ack = LiveMeasurementService.lastAcknowledgedAt
        val fresh = if (preview) previewState == "sending" else ack != null && SystemClock.elapsedRealtime() - ack <= 15_000L
        val wearing = if (preview) previewState == "wear" else saved.startsWith("装着待ち")
        val complete = if (preview) previewState == "complete" else !running && (saved.contains("終了しました") || saved == "停止しました")
        val remaining = if (preview) {
            if (running && limitedCapture) 324L else null
        } else LiveMeasurementService.stopAtElapsed?.let { maxOf(0L, (it - SystemClock.elapsedRealtime()) / 1000L) }
        val configured = preview || prefs.contains("receiver")
        val error = localMessage ?: if (!running && (saved.contains("失敗") || saved.contains("エラー") || saved.contains("できません"))) "接続を確認してください" else null
        phase.text = when {
            error != null -> "確認が必要です"
            wearing -> "装着を待っています"
            running && fresh -> "● PCへ送信中"
            running -> "PCへの接続待ち"
            complete -> "計測が終わりました"
            !configured -> "PCの設定が必要です"
            else -> "計測の準備"
        }
        val accent = if (wearing || running && !fresh || error != null || !configured) WatchUi.amber else WatchUi.mint
        phase.setTextColor(accent); dial.accent = accent
        dial.value = when {
            complete -> "完了"
            remaining != null && running -> "%d:%02d".format(remaining / 60, remaining % 60)
            running || !limitedCapture -> "連続"
            else -> "7:00"
        }
        dial.caption = when {
            complete -> "おつかれさまでした"
            running && remaining != null -> "自動停止まで"
            running -> "計測しています"
            limitedCapture -> "自動で終了"
            else -> "手動で終了"
        }
        dial.progress = if (running && remaining != null) remaining / 420f else 1f
        dial.contentDescription = "${phase.text}、${dial.caption}、${dial.value}"
        modeRow.visibility = if (running) View.GONE else View.VISIBLE
        start.visibility = if (running) View.GONE else View.VISIBLE
        stop.visibility = if (running) View.VISIBLE else View.GONE
        start.text = if (complete) "もう一度、計測" else if (limitedCapture) "7分計測を開始" else "連続計測を開始"
        for ((button, selected) in listOf(shortMode to limitedCapture, continuousMode to !limitedCapture)) {
            button.backgroundTintList = android.content.res.ColorStateList.valueOf(if (selected) WatchUi.mint else WatchUi.surface)
            button.setTextColor(if (selected) WatchUi.ink else WatchUi.muted)
            button.isSelected = selected
            button.contentDescription = button.text.toString() + if (selected) "、選択中" else "、未選択"
        }
        detail.text = when {
            preview -> "デザイン確認用の表示です。\nセンサー・通信は動きません。"
            error != null -> error
            wearing -> "時計を着け直すと再開します。"
            running && fresh -> "文字盤に戻って大丈夫です。"
            running -> "PCのアプリと時計のWi-Fiを\n確認してください。"
            !configured -> "PCで接続設定を済ませてから\n計測を始めてください。"
            complete -> "結果はPCのアプリで確認できます。"
            limitedCapture -> "7分たつと自動で終了します。"
            else -> "終了ボタンを押すまで続きます。\n電池残量にご注意ください。"
        }
        technical.text = if (preview) "プレビュー表示・実測データなし" else saved
    }

    private fun startMeasurement() {
        if (BuildConfig.WATCH_UI_PREVIEW) {
            previewState = "sending"; localMessage = null; render(); WatchUi.scrollTop(start); return
        }
        if (!getSharedPreferences("live", MODE_PRIVATE).contains("receiver")) {
            localMessage = "最初にPCで接続を設定してください。"; render(); return
        }
        val needed = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.BODY_SENSORS) != PackageManager.PERMISSION_GRANTED) needed += Manifest.permission.BODY_SENSORS
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) needed += Manifest.permission.POST_NOTIFICATIONS
        if (needed.isNotEmpty()) { requestPermissions(needed.toTypedArray(), 10); return }
        launchMeasurement()
    }
    private fun launchMeasurement() {
        try {
            startForegroundService(Intent(this, LiveMeasurementService::class.java).putExtra("limitedCapture", limitedCapture))
            localMessage = null
            WatchUi.scrollTop(start)
            handler.postDelayed({ if (!isFinishing) render() }, 300)
        } catch (_: RuntimeException) { localMessage = "開始できませんでした。接続を確認してください。"; render() }
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 10) {
            if (checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) launchMeasurement()
            else { localMessage = "計測にはセンサーの許可が必要です。"; render() }
        }
    }
    override fun onResume() {
        super.onResume(); handler.removeCallbacks(refresh); handler.post(refresh)
        if (intent.getBooleanExtra("startLimitedCapture", false)) {
            intent.removeExtra("startLimitedCapture")
            limitedCapture = true
            startMeasurement()
        }
        if (!BuildConfig.WATCH_UI_PREVIEW && intent.getBooleanExtra("resumeAfterSetup", false)) {
            intent.removeExtra("resumeAfterSetup")
            handler.postDelayed({ if (!isFinishing) startMeasurement() }, 500)
        }
    }
    override fun onPause() { handler.removeCallbacks(refresh); super.onPause() }
}
