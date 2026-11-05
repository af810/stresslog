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
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class LiveActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var status: TextView
    private var limitedCapture = false
    private val refresh = object : Runnable {
        override fun run() {
            val prefs = getSharedPreferences("live", MODE_PRIVATE)
            val savedStatus = prefs.getString("status", "停止中").orEmpty()
            val lastAck = LiveMeasurementService.lastAcknowledgedAt
            val sendStatus = if (savedStatus.startsWith(LiveMeasurementService.SENDING_STATUS) &&
                (lastAck == null || SystemClock.elapsedRealtime() - lastAck > 15_000L)
            ) "PCへの送信を確認できません。PCのライブ画面と時計のWi-Fiを確認してください。"
            else savedStatus
            val stopAt = LiveMeasurementService.stopAtElapsed
            val remaining = stopAt?.let { maxOf(0L, (it - SystemClock.elapsedRealtime()) / 1000) }
            val mode = remaining?.let { "\n自動停止まで ${it / 60}分${it % 60}秒" }.orEmpty()
            val text = "時計 → PC 自動計測\n\n" + sendStatus + mode +
                "\n\nPCで直近約2分の心拍・体動から参考値を計算します。主観の入力は不要です。HRV相当の指標は条件がそろった場合に加えます。" +
                "\n\n外して5秒たつと装着待ちになり、着けると自動で再開します。7分計測は待機時間を含めて自動停止します。"
            if (status.text.toString() != text) status.text = text
            handler.postDelayed(this, 5000)
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        status = TextView(this).apply { textSize = 14f; column.addView(this) }
        Button(this).apply { text = "7分計測して自動停止"; setOnClickListener { limitedCapture = true; startMeasurement() }; column.addView(this) }
        Button(this).apply { text = "連続計測を開始"; setOnClickListener { limitedCapture = false; startMeasurement() }; column.addView(this) }
        Button(this).apply {
            text = "計測を停止"
            setOnClickListener {
                stopService(Intent(this@LiveActivity, LiveMeasurementService::class.java))
                getSharedPreferences("live", MODE_PRIVATE).edit().putString("status", "停止しました").apply()
            }; column.addView(this)
        }
        setContentView(ScrollView(this).apply { addView(column) })
    }
    private fun startMeasurement() {
        if (getSharedPreferences("live", MODE_PRIVATE).getString("receiver", null) == null) {
            status.text = "最初の1回だけ、PCで自動計測の設定ファイルを実行してください。"; return
        }
        val needed = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.BODY_SENSORS) != PackageManager.PERMISSION_GRANTED) needed += Manifest.permission.BODY_SENSORS
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) needed += Manifest.permission.POST_NOTIFICATIONS
        if (needed.isNotEmpty()) { requestPermissions(needed.toTypedArray(), 10); return }
        try { startForegroundService(Intent(this, LiveMeasurementService::class.java).putExtra("limitedCapture", limitedCapture)) }
        catch (e: RuntimeException) { status.text = "計測の開始に失敗: ${e.javaClass.simpleName}" }
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 10 && checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) {
            // Notification denial must not produce an infinite permission prompt loop.
            try { startForegroundService(Intent(this, LiveMeasurementService::class.java).putExtra("limitedCapture", limitedCapture)) }
            catch (e: RuntimeException) { status.text = "開始失敗: ${e.javaClass.simpleName}" }
        }
    }
    override fun onResume() {
        super.onResume(); handler.post(refresh)
        if (intent.getBooleanExtra("resumeAfterSetup", false)) {
            intent.removeExtra("resumeAfterSetup")
            handler.postDelayed({ if (!isFinishing) startMeasurement() }, 500)
        }
    }
    override fun onPause() { handler.removeCallbacks(refresh); super.onPause() }
}
