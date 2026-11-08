## Draws the predicted flight path as marching dots while the player aims.
## Uses GravityPhysics.predict(), i.e. the exact same math as the real flight.
extends Node2D

const GP = preload("res://scripts/physics/gravity_physics.gd")
const Tuning = preload("res://scripts/config/tuning.gd")

var world: GP.World
var preview_time := 3.0

var _prediction: GP.Prediction
var _distances := PackedFloat32Array()
var _total := 0.0
var _time := 0.0
var _alpha := 0.0
var _alpha_target := 0.0


func show_for(start: Vector2, velocity: Vector2) -> void:
	_prediction = GP.predict(start, velocity, world, preview_time)
	var pts := _prediction.points
	_distances.resize(pts.size())
	_total = 0.0
	for i in pts.size():
		if i > 0:
			_total += pts[i].distance_to(pts[i - 1])
		_distances[i] = _total
	_alpha_target = 1.0


func hide_preview() -> void:
	_alpha_target = 0.0


func _process(delta: float) -> void:
	_time += delta
	_alpha = move_toward(_alpha, _alpha_target, delta * 6.0)
	if _alpha > 0.0 or _alpha_target > 0.0:
		queue_redraw()


func _draw() -> void:
	if _prediction == null or _alpha <= 0.0:
		return
	var pts := _prediction.points
	if pts.size() < 2 or _total <= 0.0:
		return
	var spacing := Tuning.PREVIEW_DOT_SPACING
	var d := fposmod(_time * Tuning.PREVIEW_MARCH_SPEED, spacing) + spacing * 0.6
	var idx := 1
	while d < _total:
		while idx < pts.size() - 1 and _distances[idx] < d:
			idx += 1
		var seg := _distances[idx] - _distances[idx - 1]
		var t := 0.0 if seg <= 0.0 else (d - _distances[idx - 1]) / seg
		var p := pts[idx - 1].lerp(pts[idx], clampf(t, 0.0, 1.0))
		var k := 1.0 - d / _total               # fade towards the end
		var r := lerpf(1.6, 4.2, k)
		draw_circle(p, r, Color(1, 1, 1, (0.15 + 0.75 * k) * _alpha))
		d += spacing

	var end := _prediction.end_pos
	if _prediction.outcome == GP.Outcome.CRASH:
		var c := Color(Tuning.COLOR_DANGER, 0.9 * _alpha)
		draw_line(end + Vector2(-9, -9), end + Vector2(9, 9), c, 3.0, true)
		draw_line(end + Vector2(-9, 9), end + Vector2(9, -9), c, 3.0, true)
	elif _prediction.outcome == GP.Outcome.TARGET:
		var c2 := Color(Tuning.COLOR_SUCCESS, 0.9 * _alpha)
		draw_arc(end, 12.0 + 3.0 * sin(_time * 8.0), 0.0, TAU, 32, c2, 3.0, true)
