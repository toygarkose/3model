## Main menu: animated logo, PLAY / LEVELS / SETTINGS.
extends Control

signal play_pressed
signal levels_pressed
signal settings_pressed

const UiKit = preload("res://scripts/ui/ui_kit.gd")
const Widgets = preload("res://scripts/ui/widgets.gd")
const Tuning = preload("res://scripts/config/tuning.gd")


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiKit.theme()

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 22)
	center.add_child(box)

	var logo := Widgets.LogoMark.new()
	box.add_child(logo)

	var title := UiKit.label("GRAVITY", 112, Color.WHITE)
	UiKit.glow(title, Color(0.37, 0.91, 1.0, 0.45), 22)
	box.add_child(title)

	var subtitle := UiKit.label("bend space  ·  reach the target", 28, Tuning.COLOR_TEXT_DIM)
	box.add_child(subtitle)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 50)
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(spacer)

	var play := UiKit.button("PLAY", true)
	play.pressed.connect(func(): play_pressed.emit())
	box.add_child(play)

	var levels := UiKit.button("LEVELS")
	levels.pressed.connect(func(): levels_pressed.emit())
	box.add_child(levels)

	var settings := UiKit.button("SETTINGS")
	settings.pressed.connect(func(): settings_pressed.emit())
	box.add_child(settings)

	var footer := UiKit.label("MVP 0.1", 20, Color(1, 1, 1, 0.25))
	UiKit.bottom_strip(footer, 40.0, 40.0)
	add_child(footer)

	var items := [logo, title, subtitle, play, levels, settings]
	for i in items.size():
		UiKit.appear(items[i], 0.08 * i)

	# Gentle breathing on the PLAY button to draw the eye.
	var tw := play.create_tween().set_loops()
	tw.tween_property(play, "self_modulate", Color(1.18, 1.18, 1.18), 0.9).set_trans(Tween.TRANS_SINE)
	tw.tween_property(play, "self_modulate", Color(1, 1, 1), 0.9).set_trans(Tween.TRANS_SINE)
