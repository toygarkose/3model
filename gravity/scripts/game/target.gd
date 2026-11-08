## The goal portal: pulsing rings, rotating dashes and a label.
extends Node2D

const Tuning = preload("res://scripts/config/tuning.gd")

var radius := 44.0
var _time := 0.0
var _celebrate := 0.0


func setup(p_pos: Vector2, p_radius: float) -> void:
	position = p_pos
	radius = p_radius


func celebrate() -> void:
	_celebrate = 1.0


func _process(delta: float) -> void:
	_time += delta
	_celebrate = move_toward(_celebrate, 0.0, delta * 0.8)
	queue_redraw()


func _draw() -> void:
	var c := Tuning.COLOR_SUCCESS
	var boost := 1.0 + _celebrate * 1.5
	# Inner glow
	for i in 5:
		var k := 1.0 - i / 5.0
		draw_circle(Vector2.ZERO, radius * k, Color(c.r, c.g, c.b, 0.05 * boost))
	# Main ring
	var pulse := 0.5 + 0.5 * sin(_time * 3.0)
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 72, Color(c.r, c.g, c.b, 0.75), 3.0, true)
	# Expanding beacon rings
	for i in 2:
		var t := fposmod(_time * 0.6 + i * 0.5, 1.0)
		draw_arc(Vector2.ZERO, radius * (1.0 + t * 1.2), 0.0, TAU, 72, Color(c.r, c.g, c.b, (1.0 - t) * 0.35 * boost), 2.0, true)
	# Rotating dashes
	var dashes := 8
	for i in dashes:
		var a0 := _time * 0.8 + i * TAU / dashes
		draw_arc(Vector2.ZERO, radius * 0.68, a0, a0 + 0.35, 8, Color(1, 1, 1, 0.45 + pulse * 0.3), 2.5, true)
	# Core
	draw_circle(Vector2.ZERO, 5.0 + pulse * 2.0, Color(1, 1, 1, 0.9))
	# Label
	var font := ThemeDB.fallback_font
	var fs := 18
	var text := "TARGET"
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string(font, Vector2(-w / 2.0, radius + 30.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(c.r, c.g, c.b, 0.7))
