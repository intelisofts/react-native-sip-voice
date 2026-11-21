package expo.modules.sipvoice

import android.animation.ValueAnimator
import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Views shared by the native call screens, drawn to match the app's own call screens (src/ui: LandmarkBackground,
 * Avatar, ControlButton, EndCallBar), so a call looks the same whether it was answered in the app or from the
 * lock screen. Built in code so the host app has no layouts or themes to merge.
 */
internal object CallScreenUi {
  // Same values as src/ui/theme.ts (defaultCallUITheme) and LandmarkBackground.tsx.
  const val BACKGROUND = "#111B21"
  private const val GLOW_BLUE = "#2563EB"
  private const val GLOW_VIOLET = "#7C3AED"
  const val TEXT_SECONDARY = "#BFFFFFFF" // rgba(255,255,255,0.75)
  private const val CONTROL = "#29FFFFFF" // rgba(255,255,255,0.16)
  private const val CONTROL_ACTIVE = "#FFFFFF"
  const val RED = "#E5484D"
  const val GREEN = "#25D366"
  const val CONNECTED = "#4ADE80"
  const val HELD = "#FBBF24"
  const val TEXT = "#FFFFFF"
  const val CAPTION = "#E6FFFFFF" // rgba(255,255,255,0.9)

  fun showOverLockScreen(activity: Activity) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      activity.setShowWhenLocked(true)
      activity.setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      activity.window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  fun dp(activity: Activity, v: Int) = (v * activity.resources.displayMetrics.density).toInt()

  private fun color(hex: String) = Color.parseColor(hex)

  /**
   * The call background (dark base with a soft blue glow top-right and a violet one bottom-left, as
   * LandmarkBackground) and the column the screen's content goes in. Set the returned frame as the content view.
   */
  fun screen(activity: Activity): Pair<FrameLayout, LinearLayout> {
    val frame = FrameLayout(activity).apply { setBackgroundColor(color(BACKGROUND)) }
    val glow = dp(activity, 420)
    frame.addView(glow(activity, GLOW_BLUE, 0x8C), FrameLayout.LayoutParams(glow, glow, Gravity.TOP or Gravity.END).apply {
      topMargin = -dp(activity, 170); marginEnd = -dp(activity, 150)
    })
    frame.addView(glow(activity, GLOW_VIOLET, 0x66), FrameLayout.LayoutParams(glow, glow, Gravity.BOTTOM or Gravity.START).apply {
      bottomMargin = -dp(activity, 190); marginStart = -dp(activity, 170)
    })
    val column = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(activity, 24), dp(activity, 72), dp(activity, 24), dp(activity, 40))
    }
    frame.addView(column, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    return frame to column
  }

  /** A radial glow fading to transparent: stands in for the blurred gradient blob of the app screen. */
  private fun glow(activity: Activity, hex: String, alpha: Int) = View(activity).apply {
    val c = color(hex)
    background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
      intArrayOf(Color.argb(alpha, Color.red(c), Color.green(c), Color.blue(c)), Color.TRANSPARENT)).apply {
      gradientType = GradientDrawable.RADIAL_GRADIENT
      gradientRadius = dp(activity, 210).toFloat()
    }
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  fun text(activity: Activity, value: String, sp: Float, hex: String, bold: Boolean = false) = TextView(activity).apply {
    text = value
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
    setTextColor(color(hex))
    gravity = Gravity.CENTER
    maxLines = 1
    ellipsize = android.text.TextUtils.TruncateAt.END
    if (bold) typeface = Typeface.DEFAULT_BOLD
    setShadowLayer(dp(activity, 8).toFloat(), 0f, 0f, color("#73000000"))
  }

  fun displayName(record: CallRecord?) = record?.displayName?.ifBlank { null } ?: record?.handle.orEmpty()

  /**
   * Initials in a translucent circle, as the app's Avatar. With [pulsing] a ring grows out of it and fades
   * (ringing, connecting); [Avatar.stop] ends that once the call is up.
   */
  class Avatar(activity: Activity, name: String, pulsing: Boolean) {
    private val size = dp(activity, 128)
    val view = FrameLayout(activity).apply { importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }
    private val ring = View(activity).apply {
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setStroke(dp(activity, 2), Color.WHITE) }
      alpha = 0f
    }
    private var pulse: ValueAnimator? = null

    init {
      view.addView(ring, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
      view.addView(TextView(activity).apply {
        text = initials(name)
        setTextSize(TypedValue.COMPLEX_UNIT_PX, size * 0.36f)
        setTextColor(Color.WHITE)
        gravity = Gravity.CENTER
        letterSpacing = 0.04f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        background = GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor(color("#38FFFFFF")) // rgba(255,255,255,0.22)
          setStroke(1, color("#59FFFFFF"))
        }
      }, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
      if (pulsing) start()
    }

    /** The avatar's box: room for the ring to grow to 1.6×, as in the app. */
    fun params() = LinearLayout.LayoutParams((size * 1.6f).toInt(), (size * 1.6f).toInt())

    private fun start() {
      pulse = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 1800
        repeatCount = ValueAnimator.INFINITE
        addUpdateListener {
          val p = it.animatedValue as Float
          ring.scaleX = 1f + 0.6f * p
          ring.scaleY = 1f + 0.6f * p
          ring.alpha = 0.45f * (1f - p)
        }
        start()
      }
    }

    fun stop() {
      pulse?.cancel()
      pulse = null
      ring.alpha = 0f
    }
  }

  private fun initials(name: String) =
    name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() && it[0].isLetter() }
      .take(2).joinToString("") { it.substring(0, 1).uppercase() }.ifEmpty { "#" }

  /**
   * A round button with its caption under it, as the app's ControlButton. [rotation] turns the icon (the hang-up
   * handset is the call icon at 135°). Returns the column and the circle (to restyle toggles).
   */
  fun roundButton(
    activity: Activity, label: String, fill: String, icon: Int, sizeDp: Int,
    rotation: Float = 0f, onClick: () -> Unit
  ): Pair<LinearLayout, ImageView> {
    val column = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
    val size = dp(activity, sizeDp)
    val circle = ImageView(activity).apply {
      setImageResource(icon)
      setColorFilter(Color.WHITE)
      this.rotation = rotation
      scaleType = ImageView.ScaleType.FIT_CENTER
      val pad = (size * 0.285f).toInt() // icon is 0.43 of the circle, as in the app
      setPadding(pad, pad, pad, pad)
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(color(fill)) }
      contentDescription = label
      isClickable = true
      isFocusable = true
      setOnClickListener { onClick() }
    }
    column.addView(circle, LinearLayout.LayoutParams(size, size))
    column.addView(text(activity, label, 12f, TEXT_SECONDARY).apply {
      setPadding(0, dp(activity, 8), 0, 0)
      setShadowLayer(0f, 0f, 0f, 0)
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    })
    return column to circle
  }

  /** A translucent control (speaker, mute) as on the app's call screen. */
  fun control(activity: Activity, label: String, icon: Int, onClick: () -> Unit) =
    roundButton(activity, label, CONTROL, icon, 60, onClick = onClick)

  /** On/off look for a toggle button (mute, speaker): white with a dark icon when on. */
  fun setToggled(circle: ImageView, on: Boolean) {
    (circle.background as GradientDrawable).setColor(color(if (on) CONTROL_ACTIVE else CONTROL))
    circle.setColorFilter(color(if (on) BACKGROUND else TEXT))
  }

  /** The frosted panel the in-call controls sit on. */
  fun panel(activity: Activity) = LinearLayout(activity).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(activity, 10), dp(activity, 12), dp(activity, 10), dp(activity, 12))
    background = GradientDrawable().apply {
      cornerRadius = dp(activity, 22).toFloat()
      setColor(color("#7514141A")) // rgba(20,20,26,0.46)
      setStroke(1, color("#1AFFFFFF"))
    }
  }

  fun row(activity: Activity, vararg buttons: View) = LinearLayout(activity).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER
    buttons.forEach { addView(it, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)) }
  }

  /** Fills the space between the caller and the buttons, pushing the buttons to the bottom. */
  fun spacer(activity: Activity) = View(activity) to LinearLayout.LayoutParams(0, 0, 1f)
}
