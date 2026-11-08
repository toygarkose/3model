## In-game overlay: level info, restart/home buttons, hint, toasts,
## screen flash, off-screen target indicator and the result panel.
extends CanvasLayer

signal home_pressed
signal restart_pressed
signal next_pressed

const UiKit = preload("res://scripts/ui/ui_kit.gd")
const Widgets = preload("res://scripts/ui/widgets.gd")
const Tuning = preload("res://scripts/config/tuning.gd")

var target_node: Node2D           # set by game.gd for the indicator

var _root: Control
var _level_label: Label
var _name_label: Label
var _attempt_label: Label
var _hint: Label
var _toast: Label
var _flash: ColorRect
var _indicator: Control
var _result: Control


func _ready() -> void:
	layer = 10
	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.theme = UiKit.theme()
	add_child(_root)

	_indicator = TargetIndicator.new()
	_indicator.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_indicator.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_indicator)

	_build_top_bar()

	_hint = UiKit.label("", 26, Tuning.COLOR_TEXT_DIM)
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	UiKit.bottom_strip(_hint, 70.0, 110.0)
	_hint.offset_left = 50
	_hint.offset_right = -50
	_root.add_child(_hint)

	_toast = UiKit.label("", 54, Color.WHITE)
	_toast.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_toast.modulate.a = 0.0
	_root.add_child(_toast)

	_flash = ColorRect.new()
	_flash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash.color = Color(1, 1, 1, 0)
	_root.add_child(_flash)


func _build_top_bar() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_top", 44)
	_root.add_child(margin)

	var bar := HBoxContainer.new()
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(bar)

	var home := Widgets.IconButton.new("home")
	home.pressed.connect(func(): home_pressed.emit())
	UiKit.add_press_feedback(home)
	bar.add_child(home)

	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	info.add_theme_constant_override("separation", 0)
	bar.add_child(info)

	_level_label = UiKit.label("LEVEL 1", 40, Color.WHITE)
	UiKit.glow(_level_label, Color(0.37, 0.91, 1.0, 0.35), 10)
	info.add_child(_level_label)
	_name_label = UiKit.label("", 22, Tuning.COLOR_TEXT_DIM)
	info.add_child(_name_label)
	_attempt_label = UiKit.label("", 20, Tuning.COLOR_ACCENT)
	info.add_child(_attempt_label)

	var restart := Widgets.IconButton.new("restart")
	restart.pressed.connect(func(): restart_pressed.emit())
	UiKit.add_press_feedback(restart)
	bar.add_child(restart)


func set_level(index: int, level_name: String, hint: String) -> void:
	_level_label.text = "LEVEL %d" % (index + 1)
	_name_label.text = level_name.to_upper()
	_hint.text = hint
	_hint.modulate.a = 1.0
	UiKit.appear(_hint, 0.4, 0.6)


func set_attempt(n: int) -> void:
	_attempt_label.text = "ATTEMPT %d" % n
	_attempt_label.pivot_offset = _attempt_label.size / 2.0
	_attempt_label.scale = Vector2(1.25, 1.25)
	_attempt_label.create_tween().tween_property(_attempt_label, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func hide_hint() -> void:
	if _hint.modulate.a > 0.0:
		_hint.create_tween().tween_property(_hint, "modulate:a", 0.0, 0.4)


func toast(text: String, color: Color) -> void:
	_toast.text = text
	_toast.add_theme_color_override("font_color", color)
	UiKit.glow(_toast, Color(color, 0.4), 18)
	_toast.pivot_offset = _toast.size / 2.0
	_toast.scale = Vector2(0.7, 0.7)
	_toast.modulate.a = 0.0
	var tw := _toast.create_tween()
	tw.set_parallel(true)
	tw.tween_property(_toast, "modulate:a", 1.0, 0.12)
	tw.tween_property(_toast, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.chain().tween_interval(0.55)
	tw.chain().tween_property(_toast, "modulate:a", 0.0, 0.3)


func flash(color: Color, strength := 0.4) -> void:
	_flash.color = Color(color, strength)
	_flash.create_tween().tween_property(_flash, "color:a", 0.0, 0.45)


func _process(_delta: float) -> void:
	var ind := _indicator as TargetIndicator
	if target_node and is_instance_valid(target_node):
		ind.target_screen_pos = target_node.get_global_transform_with_canvas().origin
		ind.active = true
	else:
		ind.active = false
	ind.queue_redraw()


# --- Result panel --------------------------------------------------------------

func show_result(level_index: int, level_name: String, stars: int, attempts: int, has_next: bool) -> void:
	hide_result()
	_hint.modulate.a = 0.0
	_result = Control.new()
	_result.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_result.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.add_child(_result)

	var dim := ColorRect.new()
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.0, 0.0, 0.03, 0.6)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_result.add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_result.add_child(center)

	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(580, 0)
	center.add_child(panel)

	var pad := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		pad.add_theme_constant_override("margin_" + side, 36)
	panel.add_child(pad)

	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 20)
	pad.add_child(box)

	var title := UiKit.label("TARGET REACHED", 52, Tuning.COLOR_SUCCESS)
	UiKit.glow(title, Color(Tuning.COLOR_SUCCESS, 0.4), 18)
	box.add_child(title)
	box.add_child(UiKit.label("LEVEL %d  ·  %s" % [level_index + 1, level_name.to_upper()], 24, Tuning.COLOR_TEXT_DIM))

	var star_row := Widgets.StarRow.new(0, 34.0)
	box.add_child(star_row)

	var word := "attempt" if attempts == 1 else "attempts"
	box.add_child(UiKit.label("%d %s" % [attempts, word], 26, Tuning.COLOR_TEXT))

	var btn_size := Vector2(480, 96)
	if has_next:
		var next := UiKit.button("NEXT LEVEL", true, btn_size)
		next.pressed.connect(func(): next_pressed.emit())
		box.add_child(next)
	else:
		box.add_child(UiKit.label("All test levels cleared!", 26, Tuning.COLOR_ACCENT_2))
	var retry := UiKit.button("RETRY", not has_next, btn_size)
	retry.pressed.connect(func(): restart_pressed.emit())
	box.add_child(retry)
	var menu := UiKit.button("MENU", false, btn_size)
	menu.pressed.connect(func(): home_pressed.emit())
	box.add_child(menu)

	# Animate in: fade, panel pop, then stars one by one.
	_result.modulate.a = 0.0
	var tw := _result.create_tween()
	tw.tween_property(_result, "modulate:a", 1.0, 0.25)
	panel.resized.connect(func(): panel.pivot_offset = panel.size / 2.0)
	panel.scale = Vector2(0.85, 0.85)
	tw.parallel().tween_property(panel, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	for i in stars:
		tw.tween_interval(0.18)
		tw.tween_callback(func():
			star_row.filled = i + 1
			UiKit.play_sfx("star", -2.0, 1.0 + i * 0.12)
			GameState.vibrate(20))
		tw.tween_method(func(v: float): star_row.set_pop(i, v), 1.7, 1.0, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func hide_result() -> void:
	if _result and is_instance_valid(_result):
		_result.queue_free()
	_result = null


## Arrow at the screen edge pointing at the target when it is off-screen.
class TargetIndicator extends Control:
	var target_screen_pos := Vector2.ZERO
	var active := false
	var _time := 0.0

	func _process(delta: float) -> void:
		_time += delta

	func _draw() -> void:
		if not active:
			return
		var margin := 60.0
		var rect := Rect2(Vector2.ZERO, size).grow(-margin)
		if rect.has_point(target_screen_pos):
			return
		var center := size / 2.0
		var dir := (target_screen_pos - center).normalized()
		# Intersect ray from center with the inset rect.
		var tx := INF if is_zero_approx(dir.x) else (rect.size.x / 2.0) / absf(dir.x)
		var ty := INF if is_zero_approx(dir.y) else (rect.size.y / 2.0) / absf(dir.y)
		var p := center + dir * minf(tx, ty)
		var c := Tuning.COLOR_SUCCESS
		var bob := 4.0 * sin(_time * 6.0)
		var tip := p + dir * (14.0 + bob)
		var side := dir.orthogonal() * 14.0
		draw_circle(p, 26.0, Color(c, 0.15))
		draw_colored_polygon(PackedVector2Array([tip, p - dir * 8.0 + side, p - dir * 8.0 - side]), c)
