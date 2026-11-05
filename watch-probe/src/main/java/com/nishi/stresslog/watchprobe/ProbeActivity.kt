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
import java.util.Locale

/** Checks public sensor access; it does not infer HRV from averaged heart rate. */
class ProbeActivity : Activity(), SensorEventListener {
    private lateinit var sensors: SensorManager
    private lateinit var status: TextView
    private lateinit var inventoryText: TextView
    private lateinit var start: Button
    private lateinit var ppgStart: Button
    private lateinit var longPpgStart: Button
    private var ppgDuration = 30L
    private lateinit var stop: Button
    private val handler = Handler(Looper.getMainLooper())
    private var heartBeat: Sensor? = null
    private var heartRate: Sensor? = null
    private var ppg: Sensor? = null
    private var ppgMode = false
    private var ppgCount = 0
    private var ppgRegistered = false
    private var registrationErrors = JSONArray()
    private var recording = false
    private var startedWallMs = 0L
    private var startedElapsedNs = 0L
    private var events = JSONArray()
    private var beatCount = 0
    private var rateCount = 0
    private var beatRegistered = false
    private var rateRegistered = false
    private var lastBpm: Float? = null
    private var lastConfidence: Float? = null
    private var message = "測定前です"
    private val tick = object : Runnable {
        override fun run() {
            if (!recording) return
            if (elapsedSeconds() >= sessionDuration()) finishSession("completed_${sessionDuration()}_seconds")
            else { renderStatus(); handler.postDelayed(this, 1000) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sensors = getSystemService(SENSOR_SERVICE) as SensorManager
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(32), dp(38), dp(32), dp(44))
        }
        fun text(size: Float) = TextView(this).apply {
            textSize = size; setTextColor(Color.WHITE); setPadding(0, dp(7), 0, dp(7))
            column.addView(this)
        }
        text(17f).text = "StressLog v${BuildConfig.VERSION_NAME}"
        Button(this).apply {
            text = "精度確認（心電図と脈波）"
            setOnClickListener { if (!recording) startActivity(Intent(this@ProbeActivity, ReferenceProbeActivity::class.java)) }
            column.addView(this)
        }
        Button(this).apply {
            text = "時計で自動計測"
            setOnClickListener { if (!recording) startActivity(Intent(this@ProbeActivity, LiveActivity::class.java)) }
            column.addView(this)
        }
        text(12f).text = "時計を着けて座り、腕を動かさず測定します。画面を開いたままにしてください。"
        status = text(13f)
        start = Button(this).apply {
            text = "2分間測定"
            setOnClickListener { requestAndStart(false) }
            column.addView(this)
        }
        ppgStart = Button(this).apply {
            text = "PPGを30秒確認"
            setOnClickListener { requestAndStart(true) }
            column.addView(this)
        }
        stop = Button(this).apply {
            text = "停止して保存"; isEnabled = false
            setOnClickListener { finishSession("user_stopped") }
            column.addView(this)
        }
        longPpgStart = Button(this).apply {
            text = "PPGを5分30秒測定"
            setOnClickListener { requestAndStart(true, 330L) }
            column.addView(this)
        }
        Button(this).apply {
            text = "一覧を再確認"
            setOnClickListener { if (!recording) refreshInventory() }
            column.addView(this)
        }
        inventoryText = text(11f)
        text(11f).text = "拍動データが出ても、HRVとしての精度は別途確認が必要です。診断結果は時計内に保存します。"
        val scroll = ScrollView(this).apply { isFillViewport = true; addView(column) }
        setContentView(scroll)
        refreshInventory()
        renderStatus()
    }

    private fun hasPermission() = checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED

    private fun refreshInventory() {
        val all = sensors.getSensorList(Sensor.TYPE_ALL)
        heartBeat = sensors.getDefaultSensor(Sensor.TYPE_HEART_BEAT)
        heartRate = sensors.getDefaultSensor(Sensor.TYPE_HEART_RATE)
        // Match the exact string found in the actual watch inventory. Do not guess
        // private control commands, channel meanings, or privileged permissions.
        ppg = all.filter { it.stringType == PPG_STRING_TYPE }
            .sortedBy { it.isWakeUpSensor }.firstOrNull()
        val report = deviceInfo().apply {
            put("bodySensorsPermission", hasPermission())
            put("heartBeatSensorPresent", heartBeat != null)
            put("heartRateSensorPresent", heartRate != null)
            put("ppgSensorPresent", ppg != null)
            put("sensors", JSONArray().also { list -> all.forEach { list.put(sensorInfo(it)) } })
            put("interpretation", "Sensor presence alone does not establish access. In the optional PPG probe, raw vendor values are collected without interpreting their format or issuing private control commands.")
        }
        save("inventory.json", report)
        inventoryText.text = buildString {
            append("拍動時刻センサー: ${if (heartBeat != null) "あり" else "なし"}\n")
            append("心拍数センサー: ${if (heartRate != null) "あり" else "なし"}\n")
            append("PPGセンサー: ${if (ppg != null) "あり" else "なし"}\n")
            append("権限: ${if (hasPermission()) "許可済み" else "測定開始時に確認"}\n")
            if (heartBeat == null) append("標準APIの拍動時刻は取得未確認。心拍数だけからHRVは計算できません。\n")
            append("\n公開センサー ${all.size}件\n")
            all.forEach { append("${it.name}\n${it.stringType}\n\n") }
        }
    }

    private fun requestAndStart(usePpg: Boolean, seconds: Long = 30L) {
        if (recording) return
        ppgMode = usePpg
        ppgDuration = seconds
        if (!hasPermission()) requestPermissions(arrayOf(Manifest.permission.BODY_SENSORS), 1)
        else beginSession()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1) {
            refreshInventory()
            if (hasPermission()) beginSession()
            else { message = "センサー権限が必要です。未許可のため取得可否は判定できません。"; renderStatus() }
        }
    }

    private fun beginSession() {
        refreshInventory()
        startedWallMs = System.currentTimeMillis()
        startedElapsedNs = SystemClock.elapsedRealtimeNanos()
        events = JSONArray(); beatCount = 0; rateCount = 0; lastBpm = null; lastConfidence = null
        ppgCount = 0; ppgRegistered = false; registrationErrors = JSONArray()
        val failures = mutableListOf<String>()
        fun register(sensor: Sensor?, periodUs: Int = SensorManager.SENSOR_DELAY_NORMAL): Boolean {
            if (sensor == null) return false
            return try {
                val registered = sensors.registerListener(this, sensor, periodUs, 0, handler)
                if (!registered) registrationErrors.put(JSONObject().put("sensor", sensor.stringType).put("result", "registerListener_returned_false"))
                registered
            } catch (e: RuntimeException) {
                failures += "${sensor.stringType}: ${e.javaClass.simpleName}"
                registrationErrors.put(JSONObject().put("sensor", sensor.stringType)
                    .put("exception", e.javaClass.name).put("message", e.message ?: ""))
                false
            }
        }
        recording = true
        beatRegistered = register(heartBeat)
        rateRegistered = register(heartRate)
        if (ppgMode) ppgRegistered = register(ppg, PPG_PERIOD_US)
        message = when {
            failures.isNotEmpty() -> failures.joinToString("\n")
            ppgMode && ppg == null -> "PPGセンサーが見つかりません。"
            ppgMode && !ppgRegistered -> "PPGの購読不可。詳細を保存します。"
            ppgMode -> "PPGデータを待っています。値の意味は未検証です。"
            !beatRegistered && heartBeat != null -> "拍動センサーの購読に失敗しました。"
            heartBeat == null -> "拍動時刻センサーなし。心拍数のみ確認します。"
            else -> "拍動時刻を待っています。"
        }
        start.isEnabled = false; ppgStart.isEnabled = false; longPpgStart.isEnabled = false; stop.isEnabled = true
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        renderStatus()
        saveSession("recording")
        handler.post(tick)
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!recording) return
        // Ignore queued samples from before this session. Keep sensor timestamps,
        // rather than callback arrival times, for future interval analysis.
        if (event.timestamp < startedElapsedNs) return
        if (event.sensor.type == Sensor.TYPE_HEART_BEAT) {
            beatCount++; lastConfidence = event.values.firstOrNull()
        } else if (event.sensor.type == Sensor.TYPE_HEART_RATE) {
            rateCount++; lastBpm = event.values.firstOrNull()
        } else if (ppgMode && event.sensor.stringType == PPG_STRING_TYPE) {
            ppgCount++
        } else return
        val values = JSONArray()
        event.values.forEach { values.put(if (it.isFinite()) it.toDouble() else JSONObject.NULL) }
        events.put(JSONObject().apply {
            put("sensorType", event.sensor.type)
            put("sensorStringType", event.sensor.stringType)
            put("sensorName", event.sensor.name)
            put("valueCount", event.values.size)
            // Strings preserve nanosecond precision when JSON is read in JavaScript.
            put("sensorTimestampNs", event.timestamp.toString())
            put("receivedElapsedNs", SystemClock.elapsedRealtimeNanos().toString())
            put("accuracy", event.accuracy)
            put("values", values)
        })
        // Bound collection even if a driver unexpectedly emits at a high frequency.
        if (events.length() >= 100_000) finishSession("event_limit_reached")
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun finishSession(reason: String) {
        if (!recording) return
        sensors.unregisterListener(this)
        handler.removeCallbacks(tick)
        recording = false
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        start.isEnabled = true; ppgStart.isEnabled = true; longPpgStart.isEnabled = true; stop.isEnabled = false
        message = when {
            ppgMode && ppgCount > 0 -> "PPGイベントを取得。波形や各値の意味は未検証です。"
            ppgMode && !ppgRegistered -> "PPGの購読ができませんでした。結果を保存しました。"
            ppgMode -> "PPG購読は成功しましたがデータは0件です。結果を保存しました。"
            beatCount > 0 -> "拍動イベントを取得。時刻・信頼度の解析が必要です。HRV取得成功の判定ではありません。"
            !beatRegistered -> "拍動時刻を取得できませんでした。心拍数のみではHRVを計算できません。"
            else -> "購読できましたが拍動イベントは0件でした。装着・権限・再測定を確認します。"
        }
        saveSession(reason)
        renderStatus()
    }

    private fun elapsedSeconds() = ((SystemClock.elapsedRealtimeNanos() - startedElapsedNs) / 1_000_000_000L).coerceAtLeast(0)
    private fun sessionDuration() = if (ppgMode) ppgDuration else DURATION_SECONDS

    private fun renderStatus() {
        status.text = buildString {
            if (recording) append("測定中 ${elapsedSeconds()} / ${sessionDuration()} 秒\n")
            if (ppgMode) append("PPGデータ: $ppgCount 件\n")
            append("心拍数データ: $rateCount 件\n")
            lastBpm?.takeIf { it.isFinite() }?.let { append(String.format(Locale.US, "最新心拍数: %.1f bpm\n", it)) }
            append("一拍ごとのイベント: $beatCount 件\n")
            lastConfidence?.takeIf { it.isFinite() }?.let { append(String.format(Locale.US, "最新信頼度: %.3f\n", it)) }
            append(message)
        }
    }

    private fun saveSession(reason: String) {
        val report = deviceInfo().apply {
            put("startedAtEpochMs", startedWallMs)
            put("startedElapsedNs", startedElapsedNs.toString())
            put("endedElapsedNs", SystemClock.elapsedRealtimeNanos().toString())
            put("durationSeconds", elapsedSeconds())
            put("reason", reason)
            put("mode", if (ppgMode) "ppg_access_probe" else "standard_beat_probe")
            put("requestedDurationSeconds", sessionDuration())
            put("ppgRegistered", ppgRegistered)
            put("ppgEventCount", ppgCount)
            put("ppgRequestedSamplingPeriodUs", if (ppgMode) PPG_PERIOD_US else JSONObject.NULL)
            put("ppgSelectedSensor", ppg?.let { sensorInfo(it) } ?: JSONObject.NULL)
            put("registrationErrors", registrationErrors)
            put("heartBeatRegistered", beatRegistered)
            put("heartRateRegistered", rateRegistered)
            put("heartBeatEventCount", beatCount)
            put("heartRateEventCount", rateCount)
            put("events", events)
            put("hrvValidated", false)
            put("vendorValueFormatKnown", false)
            put("interpretation", "Heart-rate BPM is not an inter-beat interval. Beat sensor values[0] is confidence, not RR milliseconds. Only sensorTimestampNs differences can be candidate intervals; accuracy, missed beats and artifacts still require validation.")
        }
        save(if (ppgMode) "latest-ppg-session.json" else "latest-session.json", report)
    }

    private fun deviceInfo() = JSONObject().apply {
        put("schemaVersion", 2)
        put("probeVersion", BuildConfig.VERSION_NAME)
        put("generatedAtEpochMs", System.currentTimeMillis())
        put("manufacturer", Build.MANUFACTURER); put("model", Build.MODEL)
        put("androidRelease", Build.VERSION.RELEASE); put("sdkInt", Build.VERSION.SDK_INT)
        put("buildFingerprint", Build.FINGERPRINT)
    }

    private fun sensorInfo(sensor: Sensor) = JSONObject().apply {
        put("name", sensor.name); put("vendor", sensor.vendor)
        put("type", sensor.type); put("stringType", sensor.stringType)
        put("version", sensor.version); put("reportingMode", sensor.reportingMode)
        put("minDelayUs", sensor.minDelay); put("maxDelayUs", sensor.maxDelay)
        put("resolution", sensor.resolution.toDouble()); put("maximumRange", sensor.maximumRange.toDouble())
        put("wakeUp", sensor.isWakeUpSensor)
    }

    private fun save(name: String, report: JSONObject) {
        try {
            val directory = File(filesDir, "diagnostics").apply { mkdirs() }
            val target = File(directory, name)
            val temporary = File(directory, "$name.tmp")
            temporary.writeText(report.toString(2), Charsets.UTF_8)
            if (!temporary.renameTo(target)) throw java.io.IOException("Cannot replace report")
        } catch (e: Exception) {
            message = "結果の保存に失敗: ${e.javaClass.simpleName}"
            renderStatus()
        }
    }

    override fun onPause() {
        finishSession("activity_paused")
        super.onPause()
    }

    override fun onDestroy() {
        sensors.unregisterListener(this)
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    companion object {
        private const val DURATION_SECONDS = 120L
        private const val PPG_STRING_TYPE = "com.google.wear.sensor.ppg"
        private const val PPG_PERIOD_US = 10_000
    }
}
