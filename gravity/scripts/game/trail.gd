## Glowing motion trail behind the ship, plus a faint "ghost" of the
## previous attempt so the player can learn from it.
extends Node2D

const MAX_POINTS := 120
const MIN_SPACING := 5.0

var _points := PackedVector2Array()
var _ghost := PackedVector2Array()
var _fade := 1.0


func start(at: Vector2) -> void:
	_points.clear()
	_points.append(at)
	_fade = 1.0
	queue_redraw()


func add(at: Vector2, _speed: float) -> void:
	if _points.size() > 0 and _points[_points.size() - 1].distance_to(at) < MIN_SPACING:
		return
	_points.append(at)
	if _points.size() > MAX_POINTS:
		_points.remove_at(0)
	queue_redraw()


## Turn the current trail into the ghost of the last attempt.
func to_ghost() -> void:
	if _points.size() > 1:
		_ghost = _points.duplicate()
	_points.clear()
	queue_redraw()


func clear_all() -> void:
	_points.clear()
	_ghost.clear()
	queue_redraw()


func _draw() -> void:
	if _ghost.size() > 1:
		draw_polyline(_ghost, Color(1, 1, 1, 0.10), 2.0, true)
	var n := _points.size()
	if n < 2:
		return
	var cols := PackedColorArray()
	cols.resize(n)
	for i in n:
		var t := float(i) / float(n - 1)
		cols[i] = Color(0.37, 0.91, 1.0, t * t * 0.85 * _fade)
	draw_polyline_colors(_points, cols, 6.0, true)
	var core := PackedColorArray()
	core.resize(n)
	for i in n:
		var t := float(i) / float(n - 1)
		core[i] = Color(1, 1, 1, t * t * t * 0.9 * _fade)
	draw_polyline_colors(_points, core, 2.0, true)
