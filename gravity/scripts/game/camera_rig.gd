## Game camera: fits the level on screen, leans gently towards the flying
## ship, and adds trauma-based screen shake + zoom punches.
extends Camera2D

const Tuning = preload("res://scripts/config/tuning.gd")

var follow_target: Node2D
var home := Vector2.ZERO
var base_zoom := 1.0
var field_size := Vector2(720, 1280)

var _trauma := 0.0
var _zoom_punch := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	get_viewport().size_changed.connect(fit)
	fit()
	position = home


## Zoom so the whole playfield is visible on any aspect ratio.
func fit() -> void:
	var vp := get_viewport_rect().size
	base_zoom = minf(vp.x / field_size.x, vp.y / field_size.y)
	zoom = Vector2.ONE * base_zoom


func shake(amount: float) -> void:
	_trauma = clampf(_trauma + amount, 0.0, 1.0)


func punch(amount: float) -> void:
	_zoom_punch = amount


func _process(delta: float) -> void:
	var goal := home
	if follow_target and is_instance_valid(follow_target) and follow_target.visible:
		goal = home.lerp(follow_target.global_position, Tuning.CAMERA_FOLLOW)
	position = position.lerp(goal, clampf(delta * Tuning.CAMERA_SMOOTH, 0.0, 1.0))

	_trauma = maxf(_trauma - delta * Tuning.SHAKE_DECAY, 0.0)
	var s := _trauma * _trauma * Tuning.SHAKE_MAX_OFFSET
	offset = Vector2(_rng.randf_range(-1.0, 1.0), _rng.randf_range(-1.0, 1.0)) * s

	_zoom_punch = move_toward(_zoom_punch, 0.0, delta * 0.6)
	zoom = Vector2.ONE * base_zoom * (1.0 + _zoom_punch)

	for bg in get_tree().get_nodes_in_group("background"):
		bg.call("set_parallax", position - home + offset)
