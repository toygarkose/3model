## Level select grid with stars and locks.
extends Control

signal level_chosen(index: int)
signal back_pressed

const UiKit = preload("res://scripts/ui/ui_kit.gd")
const Widgets = preload("res://scripts/ui/widgets.gd")
const Tuning = preload("res://scripts/config/tuning.gd")
const LevelData = preload("res://scripts/levels/level_data.gd")


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
	box.add_theme_constant_override("separation", 40)
	center.add_child(box)

	var title := UiKit.label("LEVELS", 72, Color.WHITE)
	UiKit.glow(title, Color(0.37, 0.91, 1.0, 0.35), 16)
	box.add_child(title)

	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 24)
	grid.add_theme_constant_override("v_separation", 24)
	box.add_child(grid)

	for i in GameState.level_count():
		var tile := LevelTile.new(i, GameState.is_unlocked(i), GameState.stars_for(i))
		tile.pressed.connect(func(): level_chosen.emit(i))
		UiKit.add_press_feedback(tile)
		grid.add_child(tile)
		UiKit.appear(tile, 0.05 * i)

	var back := UiKit.button("BACK")
	back.pressed.connect(func(): back_pressed.emit())
	box.add_child(back)


class LevelTile extends Button:
	var index := 0
	var locked := false

	func _init(p_index: int, p_unlocked: bool, p_stars: int) -> void:
		index = p_index
		locked = not p_unlocked
		disabled = locked
		focus_mode = Control.FOCUS_NONE
		custom_minimum_size = Vector2(190, 210)
		text = ""
		var stars := Widgets.StarRow.new(p_stars, 13.0)
		UiKit.bottom_strip(stars, 20.0, 50.0)
		stars.visible = not locked
		add_child(stars)

	func _draw() -> void:
		var font := get_theme_default_font()
		var c := size / 2.0
		if locked:
			var col := Color(1, 1, 1, 0.3)
			draw_arc(c + Vector2(0, -14), 14.0, PI, TAU, 16, col, 5.0, true)
			draw_rect(Rect2(c + Vector2(-20, -14), Vector2(40, 32)), col)
			return
		var t := str(index + 1)
		var fs := 72
		var w := font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string(font, Vector2(c.x - w / 2.0, c.y + 6.0), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)
