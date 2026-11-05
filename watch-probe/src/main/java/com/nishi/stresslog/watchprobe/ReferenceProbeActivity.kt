package com.nishi.stresslog.watchprobe

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Optional, user-started access probe, not an ECG interpretation or stress test.
 * Copies unmodified electrical/optical sensor events on the same monotonic clock.
 * No private controller commands, network requests or automatic restart.
 */
class ReferenceProbeActivity : Activity(), SensorEventListener {
    private data class Sample(val type: String, val time: Long, val values: FloatArray, val accuracy: Int)
    private lateinit var manager: SensorManager
    private lateinit var status: TextView
    private lateinit var start: Button
    private lateinit var stop: Button
    private val handler = Handler(Looper.getMainLooper())
    private val samples = ArrayList<Sample>()
    private val counts = mutableMapOf<String, Int>()
    private var registrations = JSONArray()
    private var recording = false
    private var saving = false
    private var startedNs = 0L
    private var startedWall = 0L
    private var message = "開始するまでセンサーは動きません。"
    private val tick = object : Runnable {
        override fun run() {
            if (!recording) return
            if (SystemClock.elapsedRealtimeNanos() - startedNs >= DURATION_NS) finish("completed_reference_60_seconds")
            else { render(); handler.postDelayed(this, 1000) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        manager = getSystemService(SENSOR_SERVICE) as SensorManager
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(30), dp(38), dp(30), dp(42))
        }
        fun text(size: Float, value: String = "") = TextView(this).apply {
            textSize = size; text = value; setTextColor(Color.WHITE); setPadding(0, dp(6), 0, dp(6)); column.addView(this)
        }
        text(17f, "拍動の精度確認")
        text(12f, "両腕を机に置き、反対の手の指をリューズに軽く触れたまま60秒。押し込まず、画面を開いたままにしてください。")
        text(11f, "心電図と脈波を同時に取得できるか調べます。心電図の判定やストレス計算は行いません。")
        status = text(13f)
        start = Button(this).apply {
            text = "連続計測を止めて60秒確認"
            setOnClickListener {
                if (!recording && !saving) {
                    if (checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) begin()
                    else requestPermissions(arrayOf(Manifest.permission.BODY_SENSORS), 1)
                }
            }
            column.addView(this)
        }
        stop = Button(this).apply {
            text = "確認を中止"; isEnabled = false
            setOnClickListener { finish("user_stopped") }; column.addView(this)
        }
        text(11f, "終了・画面を閉じたときはセンサーを停止します。データは時計内に保存します。")
        setContentView(ScrollView(this).apply { isFillViewport = true; addView(column) })
        render()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1 && checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) begin()
        else { message = "センサーの許可が必要です。"; render() }
    }

    private fun begin() {
        if (recording || saving) return
        stopService(Intent(this, LiveMeasurementService::class.java))
        samples.clear(); counts.clear(); registrations = JSONArray()
        startedNs = SystemClock.elapsedRealtimeNanos(); startedWall = System.currentTimeMillis()
        recording = true; start.isEnabled = false; stop.isEnabled = true
        fun register(type: String, periodUs: Int): Boolean {
            val sensor = manager.getSensorList(Sensor.TYPE_ALL).filter { it.stringType == type }
                .sortedBy { it.isWakeUpSensor }.firstOrNull()
            val info = JSONObject().put("sensorStringType", type).put("requestedPeriodUs", periodUs)
            val registered = try {
                sensor != null && manager.registerListener(this, sensor, periodUs, 0, handler)
            } catch (error: RuntimeException) {
                info.put("exception", error.javaClass.simpleName); false
            }
            info.put("present", sensor != null).put("registered", registered)
            registrations.put(info)
            return registered
        }
        val ecg = register(ECG, 4000)
        val ppg = register(PPG, 10000)
        register(LEAD, 200000)
        register("android.sensor.accelerometer", 40000)
        register("android.sensor.heart_rate", 1000000)
        if (!ecg || !ppg) {
            message = "心電図または脈波の取得を開始できませんでした。"
            finish("registration_failed"); return
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        message = "指をリューズに軽く触れてください。件数だけでは波形の品質は判断できません。"
        handler.post(tick)
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!recording || event.timestamp < startedNs || event.timestamp > startedNs + DURATION_NS) return
        samples.add(Sample(event.sensor.stringType, event.timestamp, event.values.copyOf(), event.accuracy))
        counts[event.sensor.stringType] = (counts[event.sensor.stringType] ?: 0) + 1
        if (samples.size >= 40000) finish("event_limit_reached")
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun finish(reason: String) {
        if (!recording) return
        recording = false; saving = true
        manager.unregisterListener(this); handler.removeCallbacks(tick)
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        start.isEnabled = false; stop.isEnabled = false
        val snapshot = samples.toList()
        val endedNs = SystemClock.elapsedRealtimeNanos()
        message = "センサーを停止しました。保存しています…"; render()
        Thread({
            val saved = try {
                val events = JSONArray()
                snapshot.forEach { sample ->
                    val values = JSONArray()
                    sample.values.forEach { values.put(if (it.isFinite()) it.toDouble() else JSONObject.NULL) }
                    events.put(JSONObject().put("sensorStringType", sample.type).put("sensorTimestampNs", sample.time.toString())
                        .put("accuracy", sample.accuracy).put("values", values))
                }
                val report = JSONObject().put("schemaVersion", 1).put("probeVersion", BuildConfig.VERSION_NAME)
                    .put("model", Build.MODEL).put("mode", "simultaneous_ecg_ppg_access_probe")
                    .put("reason", reason).put("startedAtEpochMs", startedWall).put("startedElapsedNs", startedNs.toString())
                    .put("endedElapsedNs", endedNs.toString()).put("requestedDurationSeconds", 60)
                    .put("durationSeconds", (endedNs - startedNs) / 1_000_000_000.0)
                    .put("ecgEventCount", counts[ECG] ?: 0).put("ppgEventCount", counts[PPG] ?: 0)
                    .put("registrations", registrations).put("events", events).put("hrvValidated", false)
                    .put("vendorValueFormatKnown", false)
                val directory = File(filesDir, "diagnostics").apply { mkdirs() }
                val target = File(directory, "latest-reference-session.json")
                val temporary = File(directory, "latest-reference-session.json.tmp")
                temporary.writeText(report.toString(), Charsets.UTF_8)
                if (!temporary.renameTo(target)) throw java.io.IOException("Cannot replace reference report")
                true
            } catch (_: Exception) { false }
            handler.post {
                saving = false; start.isEnabled = true
                message = if (saved && (counts[ECG] ?: 0) == 0) "心電図は0件でした。結果を保存しました。再計測せずPCで確認します。"
                    else if (saved) "確認を終了して保存しました。PCで取得可否と波形を確認します。"
                    else "保存できませんでした。センサーは停止しています。"
                render()
            }
        }, "stresslog-reference-save").start()
    }

    private fun render() {
        val elapsed = ((SystemClock.elapsedRealtimeNanos() - startedNs) / 1_000_000_000L).coerceIn(0, 60)
        status.text = buildString {
            if (recording) append("確認中 $elapsed / 60 秒\n")
            append("心電図 ${counts[ECG] ?: 0}件\n脈波 ${counts[PPG] ?: 0}件\n")
            append(message)
        }
    }

    override fun onPause() {
        finish("activity_paused"); super.onPause()
    }

    override fun onDestroy() {
        manager.unregisterListener(this); handler.removeCallbacks(tick); super.onDestroy()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    companion object {
        private const val ECG = "com.google.sensor.ecg"
        private const val LEAD = "com.google.sensor.ecg_lead_detector"
        private const val PPG = "com.google.wear.sensor.ppg"
        private const val DURATION_NS = 60_000_000_000L
    }
}
