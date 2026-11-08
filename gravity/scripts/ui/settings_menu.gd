## Settings: sound, vibration, reset progress.
extends Control

signal back_pressed

const UiKit = preload("res://scripts/ui/ui_kit.gd")
const Tuning = preload("res://scripts/config/tuning.gd")

var _sound: Button
var _vibration: Button
var _reset: Button
var _reset_armed := false


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

	var title := UiKit.label("SETTINGS", 72, Color.WHITE)
	UiKit.glow(title, Color(0.37, 0.91, 1.0, 0.35), 16)
	box.add_child(title)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 30)
	box.add_child(spacer)

	_sound = UiKit.button("")
	_sound.pressed.connect(func():
		GameState.set_sound(not GameState.sound_enabled)
		_refresh())
	box.add_child(_sound)

	_vibration = UiKit.button("")
	_vibration.pressed.connect(func():
		GameState.set_vibration(not GameState.vibration_enabled)
		GameState.vibrate(30)
		_refresh())
	box.add_child(_vibration)

	_reset = UiKit.button("")
	_reset.pressed.connect(_on_reset)
	box.add_child(_reset)

	var help := UiKit.label("Drag back anywhere on screen to aim.\nRelease to launch. Fewer attempts = more stars.", 24, Tuning.COLOR_TEXT_DIM)
	help.custom_minimum_size = Vector2(0, 120)
	box.add_child(help)

	var back := UiKit.button("BACK", true)
	back.pressed.connect(func(): back_pressed.emit())
	box.add_child(back)

	_refresh()
	UiKit.appear(box, 0.0)


func _on_reset() -> void:
	if _reset_armed:
		GameState.reset_progress()
		_reset_armed = false
		_reset.text = "PROGRESS RESET"
		return
	_reset_armed = true
	_reset.text = "TAP AGAIN TO CONFIRM"


func _refresh() -> void:
	_sound.text = "SOUND:  " + ("ON" if GameState.sound_enabled else "OFF")
	_vibration.text = "VIBRATION:  " + ("ON" if GameState.vibration_enabled else "OFF")
	if not _reset_armed:
		_reset.text = "RESET PROGRESS"
