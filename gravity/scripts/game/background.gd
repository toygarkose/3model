## Persistent deep-space backdrop: nebula shader + twinkling parallax stars
## + an occasional shooting star. Lives behind every screen.
extends CanvasLayer

const NEBULA_SHADER = preload("res://shaders/nebula.gdshader")

const STAR_COUNT := 230

var _nebula: ColorRect
var _stars: Control
var _parallax := Vector2.ZERO
var _parallax_target := Vector2.ZERO


func _ready() -> void:
	layer = -10
	add_to_group("background")

	_nebula = ColorRect.new()
	_nebula.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_nebula.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var mat := ShaderMaterial.new()
	mat.shader = NEBULA_SHADER
	_nebula.material = mat
	add_child(_nebula)

	_stars = StarField.new()
	_stars.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stars.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_stars)


## Called by the game camera so the sky drifts slightly as the view moves.
func set_parallax(offset: Vector2) -> void:
	_parallax_target = offset


func _process(delta: float) -> void:
	_parallax = _parallax.lerp(_parallax_target, clampf(delta * 3.0, 0.0, 1.0))
	var size := _nebula.size
	var mat := _nebula.material as ShaderMaterial
	mat.set_shader_parameter("parallax", _parallax * 0.0004)
	if size.y > 0.0:
		mat.set_shader_parameter("aspect", size.x / size.y)
	(_stars as StarField).parallax = _parallax


class StarField extends Control:
	var parallax := Vector2.ZERO
	var _stars: Array = []
	var _time := 0.0
	var _shoot_timer := 3.0
	var _shoot_pos := Vector2.ZERO
	var _shoot_vel := Vector2.ZERO
	var _shoot_life := 0.0
	var _rng := RandomNumberGenerator.new()

	func _ready() -> void:
		_rng.randomize()
		for i in STAR_COUNT:
			var depth := _rng.randf_range(0.05, 0.6)
			var tint_roll := _rng.randf()
			var tint := Color(1, 1, 1)
			if tint_roll < 0.15:
				tint = Color(0.7, 0.82, 1.0)
			elif tint_roll < 0.25:
				tint = Color(1.0, 0.9, 0.7)
			_stars.append({
				"uv": Vector2(_rng.randf(), _rng.randf()),
				"r": lerpf(0.6, 2.1, depth / 0.6) * _rng.randf_range(0.7, 1.1),
				"depth": depth,
				"phase": _rng.randf() * TAU,
				"speed": _rng.randf_range(0.6, 2.4),
				"color": tint,
			})

	func _process(delta: float) -> void:
		_time += delta
		_shoot_timer -= delta
		if _shoot_timer <= 0.0:
			_shoot_timer = _rng.randf_range(4.0, 9.0)
			_shoot_pos = Vector2(_rng.randf_range(0.1, 0.9) * size.x, _rng.randf_range(0.0, 0.4) * size.y)
			var ang := _rng.randf_range(0.3, 0.9) * (1.0 if _rng.randf() < 0.5 else -1.0) + PI * 0.5
			_shoot_vel = Vector2.from_angle(ang) * _rng.randf_range(700.0, 1000.0)
			_shoot_life = 0.7
		if _shoot_life > 0.0:
			_shoot_life -= delta
			_shoot_pos += _shoot_vel * delta
		queue_redraw()

	func _draw() -> void:
		var w := maxf(size.x, 1.0)
		var h := maxf(size.y, 1.0)
		for s in _stars:
			var uv: Vector2 = s.uv
			var depth: float = s.depth
			var pos := Vector2(fposmod(uv.x * w - parallax.x * depth, w), fposmod(uv.y * h - parallax.y * depth, h))
			var tw := 0.55 + 0.45 * sin(_time * float(s.speed) + float(s.phase))
			var c: Color = s.color
			c.a = tw * clampf(depth * 2.0, 0.35, 1.0)
			var r: float = s.r
			if r > 1.5:
				draw_circle(pos, r * 2.6, Color(c.r, c.g, c.b, c.a * 0.12))
			draw_circle(pos, r, c)
		if _shoot_life > 0.0:
			var a := clampf(_shoot_life / 0.7, 0.0, 1.0)
			var tail := _shoot_pos - _shoot_vel.normalized() * 120.0
			var pts := PackedVector2Array([tail, _shoot_pos])
			var cols := PackedColorArray([Color(0.8, 0.9, 1.0, 0.0), Color(1, 1, 1, a)])
			draw_polyline_colors(pts, cols, 2.0, true)
			draw_circle(_shoot_pos, 2.0, Color(1, 1, 1, a))
