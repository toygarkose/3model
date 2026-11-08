## Shared UI building blocks: theme, big touch-friendly buttons, labels.
## All menus use these so the look stays consistent and is easy to restyle.
extends RefCounted

const Tuning = preload("res://scripts/config/tuning.gd")

## Minimum comfortable touch size (px at 720 x 1280 base resolution).
const BUTTON_SIZE := Vector2(440, 104)
const FONT_BUTTON := 34

static var _theme: Theme


static func theme() -> Theme:
	if _theme:
		return _theme
	var t := Theme.new()
	t.set_font_size("font_size", "Button", FONT_BUTTON)
	t.set_font_size("font_size", "Label", 28)
	t.set_color("font_color", "Label", Tuning.COLOR_TEXT)
	t.set_color("font_color", "Button", Tuning.COLOR_TEXT)
	t.set_color("font_hover_color", "Button", Color.WHITE)
	t.set_color("font_pressed_color", "Button", Color.WHITE)
	t.set_color("font_focus_color", "Button", Tuning.COLOR_TEXT)
	t.set_color("font_disabled_color", "Button", Color(1, 1, 1, 0.3))
	t.set_stylebox("normal", "Button", _box(Color(0.08, 0.10, 0.20, 0.72), Color(0.37, 0.91, 1.0, 0.35)))
	t.set_stylebox("hover", "Button", _box(Color(0.12, 0.16, 0.30, 0.85), Color(0.37, 0.91, 1.0, 0.7)))
	t.set_stylebox("pressed", "Button", _box(Color(0.16, 0.30, 0.45, 0.95), Color(0.37, 0.91, 1.0, 1.0)))
	t.set_stylebox("disabled", "Button", _box(Color(0.06, 0.07, 0.12, 0.5), Color(1, 1, 1, 0.08)))
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	t.set_stylebox("panel", "PanelContainer", _box(Color(0.05, 0.06, 0.13, 0.92), Color(0.37, 0.91, 1.0, 0.3), 36))
	_theme = t
	return t


static func _box(bg: Color, border: Color, radius := 28) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 24
	sb.content_margin_right = 24
	sb.content_margin_top = 14
	sb.content_margin_bottom = 14
	sb.anti_aliasing = true
	return sb


## Accent style for the main call-to-action button.
static func make_primary(button: Button) -> void:
	var n := _box(Color(0.20, 0.75, 0.95, 0.95), Color(0.75, 0.97, 1.0, 1.0))
	var p := _box(Color(0.14, 0.55, 0.75, 1.0), Color(1, 1, 1, 1))
	button.add_theme_stylebox_override("normal", n)
	button.add_theme_stylebox_override("hover", n)
	button.add_theme_stylebox_override("pressed", p)
	button.add_theme_color_override("font_color", Color(0.02, 0.05, 0.12))
	button.add_theme_color_override("font_hover_color", Color(0.02, 0.05, 0.12))
	button.add_theme_color_override("font_pressed_color", Color(0.02, 0.05, 0.12))
	button.add_theme_color_override("font_focus_color", Color(0.02, 0.05, 0.12))


## Big button with press "squish" animation and click sound.
static func button(text: String, primary := false, min_size := BUTTON_SIZE) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.focus_mode = Control.FOCUS_NONE
	if primary:
		make_primary(b)
	add_press_feedback(b)
	return b


static func add_press_feedback(b: Button) -> void:
	b.resized.connect(func(): b.pivot_offset = b.size / 2.0)
	b.button_down.connect(func():
		var tw := b.create_tween()
		tw.tween_property(b, "scale", Vector2(0.94, 0.94), 0.06)
		play_sfx("click", -4.0, randf_range(0.95, 1.05)))
	b.button_up.connect(func():
		var tw := b.create_tween()
		tw.tween_property(b, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT))


static func label(text: String, font_size := 28, color := Tuning.COLOR_TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## Add a soft glow to a label (shadow with outline, no offset).
static func glow(l: Label, color: Color, size := 16) -> void:
	l.add_theme_color_override("font_shadow_color", color)
	l.add_theme_constant_override("shadow_offset_x", 0)
	l.add_theme_constant_override("shadow_offset_y", 0)
	l.add_theme_constant_override("shadow_outline_size", size)


## Fade a control in (alpha only, safe inside containers).
static func appear(c: Control, delay := 0.0, duration := 0.35) -> void:
	c.modulate.a = 0.0
	var tw := c.create_tween()
	tw.tween_interval(delay)
	tw.tween_property(c, "modulate:a", 1.0, duration)


## Play a sound through the Sfx autoload (safe from static code).
static func play_sfx(sound: String, volume_db := 0.0, pitch := 1.0) -> void:
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		return
	var sfx = tree.root.get_node_or_null("Sfx")
	if sfx:
		sfx.play(sound, volume_db, pitch)


## Anchor a control as a full-width strip `height` tall, `from_bottom` px above the bottom edge.
static func bottom_strip(c: Control, from_bottom: float, height: float) -> void:
	c.anchor_left = 0.0
	c.anchor_right = 1.0
	c.anchor_top = 1.0
	c.anchor_bottom = 1.0
	c.offset_left = 0.0
	c.offset_right = 0.0
	c.offset_top = -from_bottom - height
	c.offset_bottom = -from_bottom
