## Slingshot input: touch (or click) anywhere, drag back, release to launch.
## Works with mouse on desktop and touch on mobile (touch is emulated as mouse).
## Also draws the on-screen drag gizmo. Lives on the HUD CanvasLayer so its
## coordinates are screen coordinates.
extends Node2D

signal aim_changed(velocity: Vector2)
signal aim_released(velocity: Vector2)
signal aim_cancelled

const GP = preload("res://scripts/physics/gravity_physics.gd")
const Tuning = preload("res://scripts/config/tuning.gd")

var enabled := true:
	set(value):
		enabled = value
		if not value and _dragging:
			_dragging = false
			aim_cancelled.emit()
			queue_redraw()

var _dragging := false
var _start := Vector2.ZERO
var _current := Vector2.ZERO


## A drag STARTS only on touches the UI did not use (buttons win)...
func _unhandled_input(event: InputEvent) -> void:
	if not enabled or _dragging:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_dragging = true
		_start = event.position
		_current = event.position
		queue_redraw()
		get_viewport().set_input_as_handled()


## ...but once dragging, we see moves/releases BEFORE the UI, so releasing
## over a button never leaves the aim stuck.
func _input(event: InputEvent) -> void:
	if not _dragging:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		_dragging = false
		var v := GP.drag_to_velocity(_current - _start)
		if v == Vector2.ZERO:
			aim_cancelled.emit()
		else:
			aim_released.emit(v)
		queue_redraw()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion:
		_current = event.position
		var v := GP.drag_to_velocity(_current - _start)
		if v == Vector2.ZERO:
			aim_cancelled.emit()
		else:
			aim_changed.emit(v)
		queue_redraw()
		get_viewport().set_input_as_handled()


func _draw() -> void:
	if not _dragging:
		return
	var drag := _current - _start
	var length := minf(drag.length(), Tuning.MAX_DRAG)
	var power := clampf(length / Tuning.MAX_DRAG, 0.0, 1.0)
	var knob := _start + drag.limit_length(Tuning.MAX_DRAG)
	var c := Tuning.COLOR_ACCENT.lerp(Tuning.COLOR_ACCENT_2, power)
	draw_circle(_start, 10.0, Color(1, 1, 1, 0.25))
	draw_arc(_start, Tuning.MAX_DRAG, 0.0, TAU, 96, Color(1, 1, 1, 0.05), 2.0, true)
	if length >= Tuning.MIN_DRAG:
		draw_line(_start, knob, Color(c, 0.55), 4.0, true)
	draw_circle(knob, 22.0, Color(c, 0.18))
	draw_arc(knob, 22.0, 0.0, TAU, 48, Color(c, 0.8), 3.0, true)
	draw_circle(knob, 6.0, Color(c, 0.9))
