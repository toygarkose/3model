## Root of the app. Owns the persistent space background and switches
## between screens (menu, levels, settings, game) with a quick fade.
extends Node

const Background = preload("res://scripts/game/background.gd")
const MainMenu = preload("res://scripts/ui/main_menu.gd")
const LevelSelect = preload("res://scripts/ui/level_select.gd")
const SettingsMenu = preload("res://scripts/ui/settings_menu.gd")
const Game = preload("res://scripts/levels/game.gd")

var _screen: Node
var _fade_layer: CanvasLayer
var _fade: ColorRect
var _busy := false


func _ready() -> void:
	add_child(Background.new())

	_fade_layer = CanvasLayer.new()
	_fade_layer.layer = 100
	add_child(_fade_layer)
	_fade = ColorRect.new()
	_fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fade.color = Color(0.01, 0.01, 0.04, 1.0)
	_fade.mouse_filter = Control.MOUSE_FILTER_STOP
	_fade_layer.add_child(_fade)

	show_menu()


func show_menu() -> void:
	_go(func():
		var m := MainMenu.new()
		m.play_pressed.connect(func(): start_level(GameState.next_unfinished_level()))
		m.levels_pressed.connect(show_levels)
		m.settings_pressed.connect(show_settings)
		return m)


func show_levels() -> void:
	_go(func():
		var s := LevelSelect.new()
		s.level_chosen.connect(start_level)
		s.back_pressed.connect(show_menu)
		return s)


func show_settings() -> void:
	_go(func():
		var s := SettingsMenu.new()
		s.back_pressed.connect(show_menu)
		return s)


func start_level(index: int) -> void:
	_go(func():
		GameState.current_level = index
		var g := Game.new()
		g.level_index = index
		g.go_home.connect(show_menu)
		g.go_next.connect(start_level)
		return g)


## Fade out, swap the screen built by `factory`, fade back in.
func _go(factory: Callable) -> void:
	if _busy:
		return
	_busy = true
	_fade.mouse_filter = Control.MOUSE_FILTER_STOP
	var tw := create_tween()
	if _screen != null:
		tw.tween_property(_fade, "color:a", 1.0, 0.18)
	tw.tween_callback(func():
		if _screen != null:
			_screen.queue_free()
		Engine.time_scale = 1.0
		_screen = factory.call()
		add_child(_screen)
		move_child(_fade_layer, -1))
	tw.tween_property(_fade, "color:a", 0.0, 0.3)
	tw.tween_callback(func():
		_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_busy = false)


## Android back button / Esc key.
func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_on_back()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		_on_back()


func _on_back() -> void:
	if _screen is MainMenu:
		get_tree().quit()
	else:
		show_menu()
