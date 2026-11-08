## Small custom-drawn widgets (no font glyph dependencies, crisp at any size).
extends RefCounted

const Tuning = preload("res://scripts/config/tuning.gd")


## Row of 0..3 stars.
class StarRow extends Control:
	var count := 3
	var filled := 0:
		set(v):
			filled = v
			queue_redraw()
	var star_size := 26.0
	var pops: Array = [1.0, 1.0, 1.0]   # per-star scale, animatable

	func _init(p_filled := 0, p_size := 26.0) -> void:
		filled = p_filled
		star_size = p_size
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		custom_minimum_size = Vector2(star_size * 2.4 * count, star_size * 2.2)

	func set_pop(i: int, v: float) -> void:
		pops[i] = v
		queue_redraw()

	func _draw() -> void:
		var gap := star_size * 2.4
		var start_x := size.x / 2.0 - gap * (count - 1) / 2.0
		for i in count:
			var c := Vector2(start_x + gap * i, size.y / 2.0)
			var s := star_size * float(pops[i])
			var on := i < filled
			var pts := _star_points(c, s, s * 0.45)
			if on:
				draw_circle(c, s * 1.15, Color(1.0, 0.82, 0.4, 0.12))
				draw_colored_polygon(pts, Tuning.COLOR_ACCENT_2)
			else:
				draw_colored_polygon(pts, Color(1, 1, 1, 0.08))
			var outline := pts.duplicate()
			outline.append(pts[0])
			draw_polyline(outline, Tuning.COLOR_ACCENT_2 if on else Color(1, 1, 1, 0.25), 2.0, true)

	func _star_points(c: Vector2, outer: float, inner: float) -> PackedVector2Array:
		var pts := PackedVector2Array()
		for k in 10:
			var a := -PI / 2.0 + k * PI / 5.0
			var r := outer if k % 2 == 0 else inner
			pts.append(c + Vector2.from_angle(a) * r)
		return pts


## Square icon button (home / restart / back) drawn with lines.
class IconButton extends Button:
	var kind := "restart"

	func _init(p_kind := "restart") -> void:
		kind = p_kind
		custom_minimum_size = Vector2(96, 96)
		focus_mode = Control.FOCUS_NONE

	func _draw() -> void:
		var c := size / 2.0
		var col := Tuning.COLOR_TEXT
		var w := 4.0
		match kind:
			"restart":
				draw_arc(c, 20.0, -PI * 0.15, PI * 1.45, 32, col, w, true)
				var tip := c + Vector2.from_angle(-PI * 0.15) * 20.0
				draw_colored_polygon(PackedVector2Array([tip + Vector2(-11, -5), tip + Vector2(9, -9), tip + Vector2(3, 10)]), col)
			"home":
				draw_polyline(PackedVector2Array([c + Vector2(-20, 2), c + Vector2(0, -18), c + Vector2(20, 2)]), col, w, true)
				draw_polyline(PackedVector2Array([c + Vector2(-14, -3), c + Vector2(-14, 18), c + Vector2(14, 18), c + Vector2(14, -3)]), col, w, true)
			"back":
				draw_polyline(PackedVector2Array([c + Vector2(8, -16), c + Vector2(-8, 0), c + Vector2(8, 16)]), col, w + 1.0, true)
			"lock":
				draw_arc(c + Vector2(0, -6), 11.0, PI, TAU, 16, col, w, true)
				draw_rect(Rect2(c + Vector2(-16, -6), Vector2(32, 26)), col)


## Animated logo mark: a planet with a ship tracing an orbit around it.
class LogoMark extends Control:
	var _time := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		custom_minimum_size = Vector2(420, 220)

	func _process(delta: float) -> void:
		_time += delta
		queue_redraw()

	func _draw() -> void:
		var c := size / 2.0
		var rx := 170.0
		var ry := 58.0
		var tilt := -0.22
		var pts_back := PackedVector2Array()
		var pts_front := PackedVector2Array()
		for i in 65:
			var a := i / 64.0 * TAU
			var p := _orbit(c, a, rx, ry, tilt)
			if sin(a) < 0.0:
				pts_back.append(p)
			else:
				pts_front.append(p)
		# back half of orbit, planet, front half (fake depth)
		if pts_back.size() > 1:
			draw_polyline(pts_back, Color(0.37, 0.91, 1.0, 0.25), 2.0, true)
		draw_circle(c, 64.0, Color(0.37, 0.91, 1.0, 0.07))
		draw_circle(c, 52.0, Color(0.10, 0.25, 0.65))
		draw_circle(c + Vector2(-10, -10), 40.0, Color(0.18, 0.42, 0.85))
		draw_circle(c + Vector2(-20, -20), 22.0, Color(0.45, 0.75, 1.0, 0.6))
		if pts_front.size() > 1:
			draw_polyline(pts_front, Color(0.37, 0.91, 1.0, 0.7), 2.5, true)
		var sa := fposmod(_time * 1.3, TAU)
		var sp := _orbit(c, sa, rx, ry, tilt)
		if sin(sa) >= 0.0 or sp.distance_to(c) > 54.0:
			draw_circle(sp, 14.0, Color(1.0, 0.82, 0.4, 0.2))
			draw_circle(sp, 6.0, Color(1.0, 0.9, 0.6))

	func _orbit(c: Vector2, a: float, rx: float, ry: float, tilt: float) -> Vector2:
		return c + Vector2(cos(a) * rx, sin(a) * ry).rotated(tilt)
