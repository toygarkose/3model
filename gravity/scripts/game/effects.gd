## Small reusable visual effects: particle bursts and shockwave rings.
extends RefCounted

static var _dot_texture: Texture2D


static func dot_texture() -> Texture2D:
	if _dot_texture == null:
		var size := 32
		var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
		var c := Vector2(size, size) / 2.0
		for y in size:
			for x in size:
				var d := Vector2(x + 0.5, y + 0.5).distance_to(c) / (size / 2.0)
				var a := clampf(1.0 - d, 0.0, 1.0)
				img.set_pixel(x, y, Color(1, 1, 1, a * a))
		_dot_texture = ImageTexture.create_from_image(img)
	return _dot_texture


## One-shot particle explosion that frees itself.
static func burst(parent: Node, at: Vector2, color: Color, amount := 48, speed := 380.0, life := 0.9) -> void:
	var p := CPUParticles2D.new()
	p.position = at
	p.texture = dot_texture()
	p.amount = amount
	p.lifetime = life
	p.one_shot = true
	p.explosiveness = 1.0
	p.direction = Vector2.RIGHT
	p.spread = 180.0
	p.gravity = Vector2.ZERO
	p.initial_velocity_min = speed * 0.35
	p.initial_velocity_max = speed
	p.damping_min = speed * 0.4
	p.damping_max = speed * 0.9
	p.scale_amount_min = 0.25
	p.scale_amount_max = 0.7
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1, 1, 1, 1))
	ramp.set_color(1, Color(color.r, color.g, color.b, 0.0))
	ramp.add_point(0.25, color)
	p.color_ramp = ramp
	parent.add_child(p)
	p.emitting = true
	parent.get_tree().create_timer(life + 0.4).timeout.connect(p.queue_free)


## Expanding ring.
static func shockwave(parent: Node, at: Vector2, color: Color, max_radius := 320.0, duration := 0.7) -> void:
	var ring := Shockwave.new()
	ring.position = at
	ring.color = color
	parent.add_child(ring)
	var tw := ring.create_tween()
	tw.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tw.tween_property(ring, "radius", max_radius, duration)
	tw.parallel().tween_property(ring, "alpha", 0.0, duration)
	tw.tween_callback(ring.queue_free)


class Shockwave extends Node2D:
	var color := Color.WHITE
	var radius := 4.0:
		set(v):
			radius = v
			queue_redraw()
	var alpha := 1.0

	func _draw() -> void:
		draw_arc(Vector2.ZERO, radius, 0.0, TAU, 96, Color(color.r, color.g, color.b, alpha), 6.0 * alpha + 1.0, true)
		draw_circle(Vector2.ZERO, radius, Color(color.r, color.g, color.b, alpha * 0.08))
