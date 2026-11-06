package com.nishi.stresslog.watchprobe

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.content.res.ColorStateList
import android.view.Gravity
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Small native views: no animation loops, bitmap assets or new UI dependencies. */
internal object WatchUi {
    val background = Color.rgb(8, 17, 20)
    val surface = Color.rgb(23, 40, 44)
    val mint = Color.rgb(173, 239, 212)
    val ink = Color.rgb(13, 44, 35)
    val white = Color.rgb(239, 247, 244)
    val muted = Color.rgb(152, 175, 174)
    val amber = Color.rgb(245, 204, 135)
    val red = Color.rgb(249, 174, 169)

    fun dp(context: Context, value: Int) = (context.resources.displayMetrics.density * value).toInt()
    @Suppress("DEPRECATION")
    fun measurementRunning(context: Context): Boolean = (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager)
        .getRunningServices(20).any { it.service.className == LiveMeasurementService::class.java.name }
    fun shape(context: Context, color: Int, radius: Int = 24) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(context, radius).toFloat()
    }
    fun page(activity: Activity): LinearLayout {
        activity.window.setDecorFitsSystemWindows(false)
        activity.window.decorView.post {
            activity.window.insetsController?.apply {
                hide(WindowInsets.Type.systemBars())
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
        activity.window.statusBarColor = background
        activity.window.navigationBarColor = background
        val column = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(activity, 24), dp(activity, 28), dp(activity, 24), dp(activity, 40))
        }
        val scroll = ScrollView(activity).apply {
            setBackgroundColor(WatchUi.background); isVerticalScrollBarEnabled = false
            clipToPadding = false; overScrollMode = View.OVER_SCROLL_NEVER
            addView(column); isFocusableInTouchMode = true
            setOnGenericMotionListener { _, event ->
                if (event.action == MotionEvent.ACTION_SCROLL && event.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
                    scrollBy(0, (-event.getAxisValue(MotionEvent.AXIS_SCROLL) * ViewConfiguration.get(activity).scaledVerticalScrollFactor).toInt())
                    true
                } else false
            }
        }
        activity.setContentView(scroll)
        return column
    }
    fun text(parent: LinearLayout, value: String, size: Float = 13f, color: Int = white, bold: Boolean = false): TextView =
        TextView(parent.context).apply {
            text = value; textSize = size; gravity = Gravity.CENTER; setTextColor(color)
            typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
            includeFontPadding = false
            setLineSpacing(dp(context, 3).toFloat(), 1f)
            parent.addView(this, LinearLayout.LayoutParams(-1, -2))
        }
    fun gap(parent: LinearLayout, size: Int) { parent.addView(View(parent.context), LinearLayout.LayoutParams(1, dp(parent.context, size))) }
    fun scrollTop(view: View) {
        var parent = view.parent
        while (parent != null && parent !is ScrollView) parent = parent.parent
        (parent as? ScrollView)?.let { scroll -> scroll.post { scroll.smoothScrollTo(0, 0) } }
    }
    fun button(parent: LinearLayout, label: String, primary: Boolean = false, action: () -> Unit): Button =
        Button(parent.context).apply {
            text = label; textSize = 14f; isAllCaps = false; gravity = Gravity.CENTER
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            minWidth = 0; minimumWidth = 0; minHeight = 0; minimumHeight = 0
            setPadding(dp(context, 10), dp(context, 9), dp(context, 10), dp(context, 9))
            stateListAnimator = null
            setTextColor(if (primary) ink else white)
            backgroundTintList = null
            background = RippleDrawable(ColorStateList.valueOf(0x24FFFFFF), shape(context, if (primary) mint else surface), null)
            setOnClickListener { action() }
            parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { height = dp(context, 46) })
        }
    fun badge(parent: LinearLayout, value: String): TextView = text(parent, value, 11f, mint).apply {
        background = shape(context, surface)
        setPadding(dp(context, 11), dp(context, 5), dp(context, 11), dp(context, 5))
        layoutParams = LinearLayout.LayoutParams(-2, -2)
    }
    fun previewLabel(parent: LinearLayout) {
        if (BuildConfig.WATCH_UI_PREVIEW) {
            text(parent, "UIプレビュー · 計測しません", 10f, amber)
            gap(parent, 8)
        }
    }
}

/** Draws only when its displayed value changes; never starts its own timer. */
internal class MeasurementDial(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    var value: String = "7:00"
        set(next) { if (field != next) { field = next; invalidate() } }
    var caption: String = "自動で終了"
        set(next) { if (field != next) { field = next; invalidate() } }
    var progress: Float = 1f
        set(next) { if (field != next) { field = next; invalidate() } }
    var accent: Int = WatchUi.mint
        set(next) { if (field != next) { field = next; invalidate() } }
    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val unit = width / 104f
        paint.style = Paint.Style.STROKE; paint.strokeWidth = 3f * unit; paint.strokeCap = Paint.Cap.ROUND
        paint.color = WatchUi.surface
        canvas.drawCircle(width / 2f, height / 2f, width / 2f - 4f * unit, paint)
        paint.color = accent
        canvas.drawArc(4f * unit, 4f * unit, width - 4f * unit, height - 4f * unit, -90f, 360f * progress.coerceIn(0f, 1f), false, paint)
        paint.style = Paint.Style.FILL; paint.textAlign = Paint.Align.CENTER; paint.color = WatchUi.white
        paint.typeface = Typeface.create("sans-serif-light", Typeface.NORMAL); paint.textSize = 29f * unit
        canvas.drawText(value, width / 2f, height / 2f + 3f * unit, paint)
        paint.typeface = Typeface.create("sans-serif", Typeface.NORMAL); paint.textSize = 9f * unit; paint.color = WatchUi.muted
        canvas.drawText(caption, width / 2f, height / 2f + 21f * unit, paint)
    }
}
