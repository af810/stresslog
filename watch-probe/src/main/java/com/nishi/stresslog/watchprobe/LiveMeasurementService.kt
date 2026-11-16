package com.nishi.stresslog.watchprobe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
import java.io.ByteArrayOutputStream
import java.net.URL
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.zip.GZIPOutputStream
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory

/** Visible user-started service. No boot start, no off-body sensor reconfiguration, no cross-thread wait locks. */
class LiveMeasurementService : Service(), SensorEventListener {
    companion object {
        internal const val SENDING_STATUS = "PCへ送信中"
        @Volatile internal var lastAcknowledgedAt: Long? = null; private set
        @Volatile internal var stopAtElapsed: Long? = null; private set
        @Volatile internal var liveStatus: String? = null; private set
        @Volatile internal var batteryPercent = -1; private set
    }
    private data class Sample(val type: String, val time: Long, val values: FloatArray, val accuracy: Int) {
        fun json() = JSONObject().put("sensorStringType", type).put("sensorTimestampNs", time.toString())
            .put("values", JSONArray().also { a -> values.forEach { a.put(it.toDouble()) } }).put("accuracy", accuracy)
    }
    private lateinit var sensors: SensorManager
    private lateinit var connectivity: ConnectivityManager
    private var sensorThread: HandlerThread? = null
    private var sensorHandler: Handler? = null
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private val queue = java.util.ArrayDeque<Sample>()
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var active = false
    @Volatile private var stopping = false
    @Volatile private var network: Network? = null
    @Volatile private var callback: ConnectivityManager.NetworkCallback? = null
    @Volatile private var finalStatus = "停止中"
    private var wakeLock: PowerManager.WakeLock? = null
    private var wakeRenewedAt = 0L
    private var batteryRegistered = false
    private var stopPercent = 20
    private val sessionId = UUID.randomUUID().toString()
    private val dropped = AtomicLong()
    private var sequence = 0L
    private var sent = 0L
    private var pending: JSONArray? = null
    private var pendingSequence = 0L
    private var retryDelay = 6000L
    private var nextAttempt = 0L
    private var lastDiscovery = -60000L
    private var receiver = ""
    private var token = ""
    private var pinnedCertificate = byteArrayOf()
    private var certificate: X509Certificate? = null
    private var tls: SSLSocketFactory? = null
    private var registrations = JSONObject()
    private var lastPersistedAt = 0L
    @Volatile private var latestWear: Sample? = null
    private val endCapture = Runnable { end("7分間の計測が終了しました") }
    private val battery = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != Intent.ACTION_BATTERY_CHANGED) return
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            batteryPercent = if (level >= 0 && scale > 0) level * 100 / scale else -1
            if (active && LongRunPolicy.lowBattery(batteryPercent, stopPercent)) end("電池${stopPercent}％以下のため停止しました")
        }
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (BuildConfig.WATCH_UI_PREVIEW) { stopSelf(); return START_NOT_STICKY }
        if (intent?.action == "STOP") { end("停止しました"); return START_NOT_STICKY }
        if (active || stopping) return START_NOT_STICKY // Opening the app never resets a running session.
        val prefs = getSharedPreferences("live", MODE_PRIVATE)
        stopPercent = LongRunPolicy.threshold(prefs.getInt("batteryStopPercent", 20))
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("live", "StressLog 計測", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, LiveActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, LiveMeasurementService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, "live").setSmallIcon(R.drawable.ic_probe).setContentTitle("StressLog 計測中")
            .setContentText("電池${stopPercent}％で停止 · 登録済みPCへ送信").setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "停止", stop).build()).setOngoing(true).build()
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(20, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH) else startForeground(20, notification)
            receiver = prefs.getString("receiver", "").orEmpty()
            token = prefs.getString("token", "").orEmpty()
            require(URL(receiver).protocol == "https" && token.matches(Regex("[a-f0-9]{64}")))
            val cert = CertificateFactory.getInstance("X.509").generateCertificate(Base64.decode(prefs.getString("certificate", ""), Base64.DEFAULT).inputStream())
            pinnedCertificate = cert.encoded
            certificate = cert as X509Certificate
            certificate!!.checkValidity()
            val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("pc", cert) }
            val trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
            tls = SSLContext.getInstance("TLS").apply { init(null, trust.trustManagers, null) }.socketFactory
            active = true; lastAcknowledgedAt = null; liveStatus = "接続を準備しています"
            val initialBattery = registerReceiver(battery, IntentFilter(Intent.ACTION_BATTERY_CHANGED)); batteryRegistered = true
            // The sticky Intent is available immediately; onReceive itself may be queued.
            // Do not mistake a callback that has not run yet for an unreadable battery.
            initialBattery?.let { battery.onReceive(this, it) }
            if (batteryPercent !in 0..100) batteryPercent = (getSystemService(BATTERY_SERVICE) as BatteryManager).getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            if (stopping) return START_NOT_STICKY
            if (batteryPercent !in 0..100) { end("電池残量を確認できないため停止しました"); return START_NOT_STICKY }
            prefs.edit().putBoolean("autoStartBlocked", false).apply()
            stopAtElapsed = if (intent?.getBooleanExtra("limitedCapture", false) == true) SystemClock.elapsedRealtime() + 420000L else null
            if (stopAtElapsed != null) main.postDelayed(endCapture, 420000L)
            sensors = getSystemService(SENSOR_SERVICE) as SensorManager
            sensorThread = HandlerThread("StressLog sensors").apply { start() }; sensorHandler = Handler(sensorThread!!.looper)
            connectivity = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
            val listener = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(n: Network) { if (active && callback === this) network = n }
                override fun onLost(n: Network) { if (network == n) network = null }
            }
            callback = listener
            connectivity.requestNetwork(NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), listener)
            wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "StressLog:long").apply { setReferenceCounted(false); acquire(600000L) }
            wakeRenewedAt = SystemClock.elapsedRealtime()
            sensorHandler!!.post {
                if (!active) return@post
                try {
                    val ppg = sensors.getSensorList(Sensor.TYPE_ALL).filter { it.stringType == "com.google.wear.sensor.ppg" }.sortedBy { it.isWakeUpSensor }.firstOrNull()
                    fun register(sensor: Sensor?, period: Int) = sensor != null && sensors.registerListener(this, sensor, period, 0, sensorHandler)
                    registrations = JSONObject().put("ppg", register(ppg, 10000))
                        .put("heartRate", register(sensors.getDefaultSensor(Sensor.TYPE_HEART_RATE), SensorManager.SENSOR_DELAY_NORMAL))
                        .put("acceleration", register(sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER), 40000))
                    register(sensors.getDefaultSensor(Sensor.TYPE_LOW_LATENCY_OFFBODY_DETECT), SensorManager.SENSOR_DELAY_NORMAL)
                    if (!registrations.getBoolean("ppg")) end("PPGセンサーに接続できません")
                    else { updateStatus("計測開始。PCへ自動接続します"); executor.scheduleWithFixedDelay({ flush() }, 6, 6, TimeUnit.SECONDS) }
                } catch (e: RuntimeException) { end("開始失敗: ${e.javaClass.simpleName}") }
            }
        } catch (e: Exception) { end("開始失敗: ${e.javaClass.simpleName}") }
        return START_NOT_STICKY
    }
    override fun onSensorChanged(event: SensorEvent) {
        if (!active) return
        if (expired()) { end("7分間の計測が終了しました"); return }
        val values = event.values.copyOf(minOf(16, event.values.size)); if (values.any { !it.isFinite() }) return
        val sample = Sample(event.sensor.stringType, event.timestamp, values, event.accuracy)
        if (event.sensor.type == Sensor.TYPE_LOW_LATENCY_OFFBODY_DETECT && values.firstOrNull() in listOf(0f, 1f)) latestWear = sample
        synchronized(queue) { if (queue.size >= 5000) { queue.removeFirst(); dropped.incrementAndGet() }; queue.addLast(sample) }
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    private fun expired() = stopAtElapsed?.let { SystemClock.elapsedRealtime() >= it } == true
    private fun flush() {
        if (!active) return
        if (expired()) { end("7分間の計測が終了しました"); return }
        if (LongRunPolicy.lowBattery(batteryPercent, stopPercent)) { end("電池${stopPercent}％以下のため停止しました"); return }
        try {
            val now = SystemClock.elapsedRealtime()
            if (wakeLock?.isHeld == false || now - wakeRenewedAt >= 300000L) { wakeLock?.acquire(600000L); wakeRenewedAt = now }
            if (now < nextAttempt) return
            val n = network ?: run { updateStatus("Wi-Fi待ち。PCと同じWi-Fiへ接続してください"); return }
            if (pending == null) {
                val rows = JSONArray()
                synchronized(queue) { repeat(minOf(queue.size, 2000)) { rows.put(queue.removeFirst().json()) } }
                pending = rows; pendingSequence = sequence++
            }
            val payload = JSONObject().put("sessionId", sessionId).put("model", Build.MODEL).put("sequence", pendingSequence)
                .put("sentAtEpochMs", System.currentTimeMillis()).put("sentElapsedNs", SystemClock.elapsedRealtimeNanos().toString())
                .put("droppedEvents", dropped.get()).put("registrations", registrations).put("events", pending).put("batteryPercent", batteryPercent)
            latestWear?.let { payload.put("wearState", JSONObject().put("value", it.values[0].toInt()).put("sensorTimestampNs", it.time.toString())) }
            val response = post(n, payload.toString().toByteArray(Charsets.UTF_8))
            if (response != 200) error("PC response $response")
            if (!active) return
            sent += pending!!.length(); pending = null; retryDelay = 6000L; nextAttempt = 0
            lastAcknowledgedAt = SystemClock.elapsedRealtime()
            updateStatus("$SENDING_STATUS\n送信 $sent 件 / 破棄 ${dropped.get()} 件\n電池 $batteryPercent％ · ${stopPercent}％で停止")
        } catch (_: Exception) {
            if (!active) return
            val now = SystemClock.elapsedRealtime()
            if (now - lastDiscovery >= 60000L) {
                lastDiscovery = now
                try { network?.let { n -> ReceiverDiscovery.find(n, connectivity, token)?.let { found -> receiver = found; getSharedPreferences("live", MODE_PRIVATE).edit().putString("receiver", found).apply() } } } catch (_: Exception) { }
            }
            nextAttempt = now + retryDelay; retryDelay = LongRunPolicy.retryDelay(retryDelay)
            updateStatus("PCへの接続待ち。自動で再接続します\nPCのStressLogと同じWi-Fiを確認してください。未送信データは一部失われる場合があります。")
        }
    }
    private fun post(network: Network, bytes: ByteArray): Int {
        certificate?.checkValidity() ?: error("Missing pinned certificate")
        val body = ByteArrayOutputStream().use { buffer -> GZIPOutputStream(buffer).use { it.write(bytes) }; buffer.toByteArray() }
        val connection = network.openConnection(URL(receiver)) as HttpsURLConnection
        try {
            connection.sslSocketFactory = tls ?: error("TLS not configured")
            // Endpoint addresses can change; only the EXACT provisioned certificate is accepted.
            // TLS chain/expiry is still validated by the dedicated TrustManager above.
            connection.hostnameVerifier = javax.net.ssl.HostnameVerifier { _, session ->
                try { MessageDigest.isEqual(session.peerCertificates.first().encoded, pinnedCertificate) } catch (_: Exception) { false }
            }
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"; connection.connectTimeout = 3000; connection.readTimeout = 3000; connection.doOutput = true
            connection.setFixedLengthStreamingMode(body.size); connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Content-Encoding", "gzip"); connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { it.write(body) }
            val code = connection.responseCode
            (if (code < 400) connection.inputStream else connection.errorStream)?.use { stream -> val buffer=ByteArray(256); var total=0; while(total<4096){val n=stream.read(buffer);if(n<0)break;total+=n} }
            return code
        } finally { connection.disconnect() }
    }
    private fun updateStatus(value: String, force: Boolean = false) {
        liveStatus = value
        val now = SystemClock.elapsedRealtime()
        if (force || now - lastPersistedAt >= 30000L) {
            getSharedPreferences("live", MODE_PRIVATE).edit().putString("status", value).apply(); lastPersistedAt = now
        }
    }
    private fun end(reason: String) {
        if (stopping) return
        stopping = true; active = false; finalStatus = reason
        main.post { getSharedPreferences("live", MODE_PRIVATE).edit().putBoolean("autoStartBlocked", true).apply(); stopSelf() }
    }
    override fun onDestroy() {
        active = false; stopping = true
        main.removeCallbacks(endCapture)
        if (batteryRegistered) { unregisterReceiver(battery); batteryRegistered = false }
        val listener = callback; callback = null; network = null
        if (listener != null && ::connectivity.isInitialized) try { connectivity.unregisterNetworkCallback(listener) } catch (_: Exception) { }
        val worker = sensorHandler; val thread = sensorThread
        // Do not wait for another thread while holding a lifecycle lock on main.
        if (worker != null) worker.post { if (::sensors.isInitialized) sensors.unregisterListener(this); thread?.quitSafely() }
        executor.shutdownNow()
        if (wakeLock?.isHeld == true) wakeLock?.release()
        stopAtElapsed = null; lastAcknowledgedAt = null
        updateStatus(finalStatus, true); super.onDestroy()
    }
}
