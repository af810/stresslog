package com.nishi.stresslog.watchprobe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.AlarmManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.io.ByteArrayOutputStream
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.zip.GZIPOutputStream
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.SSLSocketFactory

/** User-started, visible health foreground service. No automatic start at boot. */
class LiveMeasurementService : Service(), SensorEventListener {
    companion object {
        internal const val SENDING_STATUS = "PCへ送信中"
        @Volatile internal var lastAcknowledgedAt: Long? = null
            private set
        @Volatile internal var stopAtElapsed: Long? = null
            private set
    }
    private data class Sample(val type: String, val time: Long, val values: FloatArray, val accuracy: Int) {
        fun json(): JSONObject {
            val array = JSONArray()
            values.forEach { array.put(it.toDouble()) }
            return JSONObject().put("sensorStringType", type).put("sensorTimestampNs", time.toString())
                .put("values", array).put("accuracy", accuracy)
        }
    }
    private data class ConnectionSettings(val receiver: String, val certificate: String, val token: String)
    private var connectionSettings: ConnectionSettings? = null
    private var socketFactory: SSLSocketFactory? = null
    private var useCompression = true
    private lateinit var sensors: SensorManager
    private lateinit var connectivity: ConnectivityManager
    private var sensorThread: HandlerThread? = null
    private var sensorHandler: Handler? = null
    private var ppgSensor: Sensor? = null
    private var heartSensor: Sensor? = null
    private var accelerationSensor: Sensor? = null
    private val lifecycleLock = Any()
    @Volatile private var offBodyPaused = false
    @Volatile private var lastWearValue = -1
    private var wearCanWake = false
    private var wifiRequested = false
    private val pauseIfUnworn = Runnable {
        synchronized(lifecycleLock) {
            if (active && lastWearValue == 0 && !offBodyPaused) pauseForWear()
        }
    }
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private val queue = java.util.ArrayDeque<Sample>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var finalStatus = "停止中"
    private var stopAlarm: PendingIntent? = null
    private val stopAfterCapture = Runnable { finalStatus = "7分間の計測が終了しました"; stopSelf() }
    @Volatile private var network: Network? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wakeRenewedAt = 0L
    @Volatile private var active = false
    private val dropped = AtomicLong()
    private var sent = 0L
    private var sequence = 0L
    private var pendingRows: JSONArray? = null
    private var pendingSequence = 0L
    private var retryDelayMs = 6000L
    private var nextAttemptAt = 0L
    private val sessionId = UUID.randomUUID().toString()
    private var registrations = JSONObject()
    @Volatile private var networkCallback: ConnectivityManager.NetworkCallback? = null
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { finalStatus = "停止しました"; stopSelf(); return START_NOT_STICKY }
        if (intent?.action == "LIMIT_EXPIRED") {
            if (!active || captureExpired()) { finalStatus = "7分間の計測が終了しました"; stopSelf() }
            return START_NOT_STICKY
        }
        if (active) {
            try { setCaptureLimit(intent?.getBooleanExtra("limitedCapture", false) == true) }
            catch (e: RuntimeException) { finalStatus = "自動停止の予約に失敗: ${e.javaClass.simpleName}"; stopSelf() }
            return START_NOT_STICKY
        }
        val notifications = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        notifications.createNotificationChannel(NotificationChannel("live", "StressLog 自動計測", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, LiveActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, LiveMeasurementService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, "live").setSmallIcon(com.nishi.stresslog.watchprobe.R.drawable.ic_probe)
            .setContentTitle("StressLog 計測中").setContentText("PPG・心拍・体動を登録済みPCへ送信")
            .setContentIntent(open).addAction(Notification.Action.Builder(null, "停止", stop).build()).setOngoing(true).build()
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(20, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
            else startForeground(20, notification)
            active = true
            sensors = getSystemService(SENSOR_SERVICE) as SensorManager
            sensorThread = HandlerThread("StressLog sensors").apply { start() }
            sensorHandler = Handler(sensorThread!!.looper)
            ppgSensor = sensors.getSensorList(Sensor.TYPE_ALL).filter { it.stringType == "com.google.wear.sensor.ppg" }.sortedBy { it.isWakeUpSensor }.firstOrNull()
            heartSensor = sensors.getDefaultSensor(Sensor.TYPE_HEART_RATE)
            accelerationSensor = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
            if (!registerPhysiology()) { finalStatus = "PPGセンサーに接続できません"; stopSelf(); return START_NOT_STICKY }
            connectivity = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
            requestWifi()
            wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "StressLog:live").apply { setReferenceCounted(false); acquire(10*60*1000L) }
            wakeRenewedAt = SystemClock.elapsedRealtime()
            // Only a wake-up contact sensor may resume us after releasing the CPU
            // lock. Devices without it retain the existing continuous behavior.
            val wear = sensors.getDefaultSensor(Sensor.TYPE_LOW_LATENCY_OFFBODY_DETECT, true)
                ?: sensors.getDefaultSensor(Sensor.TYPE_LOW_LATENCY_OFFBODY_DETECT)
            wearCanWake = wear?.isWakeUpSensor == true
            if (wear != null && !sensors.registerListener(this, wear, SensorManager.SENSOR_DELAY_NORMAL, 0, sensorHandler)) wearCanWake = false
            setCaptureLimit(intent?.getBooleanExtra("limitedCapture", false) == true)
            updateStatus("計測開始。Wi-Fi接続を待っています")
            executor.scheduleWithFixedDelay({ flush() }, 6, 6, TimeUnit.SECONDS)
        } catch (e: RuntimeException) { finalStatus = "開始失敗: ${e.javaClass.simpleName}"; android.util.Log.w("StressLogLive", finalStatus, e); stopSelf() }
        return START_NOT_STICKY
    }
    override fun onSensorChanged(event: SensorEvent) {
        if (!active) return
        if (captureExpired()) { finalStatus = "7分間の計測が終了しました"; stopSelf(); return }
        val values = event.values.copyOf(minOf(event.values.size, 16))
        if (values.any { !it.isFinite() }) return
        val row = Sample(event.sensor.stringType, event.timestamp, values, event.accuracy)
        if (event.sensor.type == Sensor.TYPE_LOW_LATENCY_OFFBODY_DETECT) {
            val value = values.firstOrNull()
            if (value == 0f || value == 1f) {
                lastWearValue = if (value == 1f) 1 else 0
                mainHandler.removeCallbacks(pauseIfUnworn)
                if (lastWearValue == 0 && wearCanWake) mainHandler.postDelayed(pauseIfUnworn, 5000)
                else synchronized(lifecycleLock) {
                    if (active && offBodyPaused) resumeForWear()
                }
            }
        } else if (offBodyPaused) return
        synchronized(queue) {
            if (queue.size >= 5000) { queue.removeFirst(); dropped.incrementAndGet() }
            queue.addLast(row)
        }
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    private fun registerPhysiology(): Boolean {
        fun register(sensor: Sensor?, period: Int) = sensor != null && sensors.registerListener(this, sensor, period, 0, sensorHandler)
        registrations = JSONObject().put("ppg", register(ppgSensor, 10000))
            .put("heartRate", register(heartSensor, SensorManager.SENSOR_DELAY_NORMAL))
            .put("acceleration", register(accelerationSensor, 40000))
        return registrations.getBoolean("ppg")
    }
    private fun requestWifi() {
        if (wifiRequested) return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(n: Network) { if (networkCallback === this && active && !offBodyPaused) network = n }
            override fun onLost(n: Network) { if (networkCallback === this && network == n) network = null }
        }
        networkCallback = callback
        connectivity.requestNetwork(NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), callback)
        wifiRequested = true
    }
    private fun releaseWifi() {
        val callback = networkCallback; networkCallback = null
        if (callback != null) try { connectivity.unregisterNetworkCallback(callback) } catch (_: Exception) {}
        wifiRequested = false; network = null
    }
    // Called under lifecycleLock; only the wake-up off-body listener remains.
    private fun pauseForWear() {
        offBodyPaused = true
        listOfNotNull(ppgSensor, heartSensor, accelerationSensor).forEach { sensors.unregisterListener(this, it) }
        registrations = JSONObject().put("ppg", false).put("heartRate", false).put("acceleration", false)
        updateStatus("装着待ち（省電力）。時計を着けると再開します")
        executor.execute {
            if (active && offBodyPaused) {
                // Pending samples from before detachment must not arrive as a
                // fresh post-resume batch. Keep the contact marker for the PC.
                dropped.addAndGet((pendingRows?.length() ?: 0).toLong()); pendingRows = null
                synchronized(queue) {
                    val contact = queue.lastOrNull { it.type == "android.sensor.low_latency_offbody_detect" }
                    dropped.addAndGet(queue.count { it !== contact }.toLong())
                    queue.clear(); if (contact != null) queue.addLast(contact)
                }
                flush()
                synchronized(lifecycleLock) {
                    if (active && offBodyPaused) {
                        releaseWifi()
                        if (wakeLock?.isHeld == true) wakeLock?.release()
                    }
                }
            }
        }
    }
    private fun resumeForWear() {
        try {
            wakeLock?.acquire(10*60*1000L); wakeRenewedAt = SystemClock.elapsedRealtime()
            if (!registerPhysiology()) { finalStatus = "再開失敗: PPGセンサーに接続できません"; stopSelf(); return }
            offBodyPaused = false
            requestWifi()
            // Queue ownership remains on the send executor.
            executor.execute { nextAttemptAt = 0; retryDelayMs = 6000L }
            updateStatus("装着を確認。PCへの送信を再開します")
        } catch (e: RuntimeException) {
            finalStatus = "再開失敗: ${e.javaClass.simpleName}"; android.util.Log.w("StressLogLive", finalStatus, e); stopSelf()
        }
    }
    private fun flush() {
        if (!active) return
        if (captureExpired()) { finalStatus = "7分間の計測が終了しました"; stopSelf(); return }
        if (offBodyPaused && synchronized(queue) { queue.isEmpty() } && pendingRows == null) return
        try {
            if (!offBodyPaused && (wakeLock?.isHeld == false || SystemClock.elapsedRealtime()-wakeRenewedAt>5*60*1000L)) {
                wakeLock?.acquire(10*60*1000L)
                wakeRenewedAt = SystemClock.elapsedRealtime()
            }
            if (SystemClock.elapsedRealtime() < nextAttemptAt) return
            val n = network ?: run { updateStatus("Wi-Fi待ち。時計とPCを同じネットワークへ接続してください"); return }
            val prefs = getSharedPreferences("live", MODE_PRIVATE)
            val settings = ConnectionSettings(prefs.getString("receiver", null) ?: error("PC設定なし"),
                prefs.getString("certificate", "").orEmpty(), prefs.getString("token", "").orEmpty())
            if (settings != connectionSettings) {
                val certBytes = Base64.decode(settings.certificate, Base64.DEFAULT)
                val cert = CertificateFactory.getInstance("X.509").generateCertificate(certBytes.inputStream())
                val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("pc", cert) }
                val managers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
                socketFactory = SSLContext.getInstance("TLS").apply { init(null, managers.trustManagers, null) }.socketFactory
                connectionSettings = settings
                useCompression = true
            }
            val rows = pendingRows ?: run {
                val batch = JSONArray()
                val samples = synchronized(queue) { List(minOf(queue.size, 2000)) { queue.removeFirst() } }
                samples.forEach { batch.put(it.json()) }
                pendingRows = batch
                pendingSequence = sequence++
                batch
            }
            val payload = JSONObject().put("sessionId", sessionId).put("model", Build.MODEL).put("sequence", pendingSequence)
                .put("sentAtEpochMs", System.currentTimeMillis()).put("sentElapsedNs", SystemClock.elapsedRealtimeNanos().toString())
                .put("droppedEvents", dropped.get()).put("registrations", registrations).put("events", rows)
                .put("batteryPercent", (getSystemService(BATTERY_SERVICE) as BatteryManager).getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
            try {
                val bytes = payload.toString().toByteArray(Charsets.UTF_8)
                var response = post(n, settings, bytes)
                // An older PC receiver accepts the original, uncompressed protocol.
                if ((response == 415 || response == 400) && useCompression) {
                    useCompression = false
                    response = post(n, settings, bytes)
                }
                if (response != 200) error("PC応答 $response")
                if (!active) return
                pendingRows = null
                sent += rows.length()
                retryDelayMs = 6000L
                nextAttemptAt = 0L
                lastAcknowledgedAt = SystemClock.elapsedRealtime()
                updateStatus("$SENDING_STATUS\n送信 $sent 件 / 破棄 ${dropped.get()} 件")
            } catch (e: Exception) {
                if (!active) return
                nextAttemptAt = SystemClock.elapsedRealtime() + retryDelayMs
                retryDelayMs = minOf(retryDelayMs * 2, 60_000L)
                android.util.Log.w("StressLogLive", "Telemetry send failed", e)
                updateStatus("送信待ち: ${e.javaClass.simpleName}\nPCの起動・Wi-Fi・接続許可を確認")
            }
        } catch (e: Exception) { if (active) updateStatus("計測エラー: ${e.javaClass.simpleName}") }
    }
    private fun setCaptureLimit(limited: Boolean) {
        mainHandler.removeCallbacks(stopAfterCapture)
        val alarms = getSystemService(ALARM_SERVICE) as AlarmManager
        stopAlarm?.let { alarms.cancel(it) }; stopAlarm = null
        stopAtElapsed = if (limited) SystemClock.elapsedRealtime() + 7 * 60 * 1000L else null
        if (limited) {
            // Handler uptime excludes deep sleep. An elapsed-time alarm is the
            // idle fallback; callbacks also reject acquisition past the deadline.
            val pending = PendingIntent.getService(this, 2, Intent(this, LiveMeasurementService::class.java).setAction("LIMIT_EXPIRED"), PendingIntent.FLAG_IMMUTABLE)
            stopAlarm = pending
            alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, stopAtElapsed!!, pending)
            mainHandler.postDelayed(stopAfterCapture, 7 * 60 * 1000L)
        }
    }
    private fun captureExpired() = stopAtElapsed?.let { SystemClock.elapsedRealtime() >= it } == true
    private fun post(network: Network, settings: ConnectionSettings, bytes: ByteArray): Int {
        val body = if (useCompression) ByteArrayOutputStream().use { buffer ->
            GZIPOutputStream(buffer).use { it.write(bytes) }
            buffer.toByteArray()
        } else bytes
        val connection = network.openConnection(URL(settings.receiver)) as HttpsURLConnection
        try {
            connection.sslSocketFactory = socketFactory ?: error("暗号通信の設定なし")
            connection.requestMethod = "POST"
            connection.connectTimeout = 3000
            connection.readTimeout = 3000
            connection.doOutput = true
            connection.setFixedLengthStreamingMode(body.size)
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Authorization", "Bearer " + settings.token)
            if (useCompression) connection.setRequestProperty("Content-Encoding", "gzip")
            connection.outputStream.use { it.write(body) }
            val code = connection.responseCode
            val response = if (code < 400) connection.inputStream else connection.errorStream
            response?.use { stream ->
                val buffer = ByteArray(256)
                while (stream.read(buffer) != -1) { /* Drain to permit connection reuse. */ }
            }
            return code
        } finally { connection.disconnect() }
    }
    private fun updateStatus(text: String) {
        val shown = if (active && offBodyPaused) "装着待ち（省電力）。時計を着けると再開します" else text
        getSharedPreferences("live", MODE_PRIVATE).edit().putString("status", shown).apply()
    }
    override fun onDestroy() {
        synchronized(lifecycleLock) {
            active = false
            if (::sensors.isInitialized) sensors.unregisterListener(this)
            if (::connectivity.isInitialized) releaseWifi()
            if (wakeLock?.isHeld == true) wakeLock?.release()
        }
        mainHandler.removeCallbacks(stopAfterCapture)
        mainHandler.removeCallbacks(pauseIfUnworn)
        stopAlarm?.let { (getSystemService(ALARM_SERVICE) as AlarmManager).cancel(it) }; stopAlarm = null
        stopAtElapsed = null
        executor.shutdownNow(); sensorThread?.quitSafely()
        lastAcknowledgedAt = null
        updateStatus(finalStatus); super.onDestroy()
    }
}
