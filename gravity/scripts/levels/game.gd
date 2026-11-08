## Runs one level: builds the world from LevelData, wires input -> ship ->
## physics -> outcome, and drives win / crash / lost feedback.
extends Node2D

signal go_home
signal go_next(index: int)

const GP = preload("res://scripts/physics/gravity_physics.gd")
const Tuning = preload("res://scripts/config/tuning.gd")
const LevelData = preload("res://scripts/levels/level_data.gd")
const Planet = preload("res://scripts/game/planet.gd")
const Ship = preload("res://scripts/game/ship.gd")
const Trail = preload("res://scripts/game/trail.gd")
const Preview = preload("res://scripts/game/trajectory_preview.gd")
const Target = preload("res://scripts/game/target.gd")
const CameraRig = preload("res://scripts/game/camera_rig.gd")
const LaunchInput = preload("res://scripts/game/launch_input.gd")
const Effects = preload("res://scripts/game/effects.gd")
const Hud = preload("res://scripts/ui/hud.gd")

## Set by main.gd before the node enters the tree.
var level_index := 0

var _data: Dictionary
var _world: GP.World
var _start := Vector2.ZERO
var _ship: Ship
var _trail: Trail
var _preview: Preview
var _target: Target
var _camera: CameraRig
var _input: LaunchInput
var _hud: Hud

var _attempts := 0
var _level_done := false
var _pending: Tween          # delayed reset / result tween
var _ship_tween: Tween       # spawn pop / win spiral


func _ready() -> void:
	_data = LevelData.get_level(level_index)
	_start = _data.start
	_build_world()
	_build_hud()
	_reset_round(true)


func _exit_tree() -> void:
	Engine.time_scale = 1.0


# --- Construction -------------------------------------------------------------

func _build_world() -> void:
	_world = GP.World.new()
	_world.target_pos = _data.target
	_world.target_radius = _data.target_radius
	var half := LevelData.FIELD_SIZE / 2.0
	_world.bounds = Rect2(-half, LevelData.FIELD_SIZE).grow(Tuning.BOUNDS_MARGIN)

	var i := 0
	for pd in _data.planets:
		_world.bodies.append(GP.Body.new(pd.pos, pd.radius, pd.mass))
		var planet := Planet.new()
		planet.setup(pd.pos, pd.radius, pd.mass, pd.style, float(level_index * 7 + i) * 1.37 + 0.5)
		add_child(planet)
		i += 1

	_target = Target.new()
	_target.setup(_world.target_pos, _world.target_radius)
	add_child(_target)

	_preview = Preview.new()
	_preview.world = _world
	_preview.preview_time = _data.preview_time
	add_child(_preview)

	_trail = Trail.new()
	add_child(_trail)

	_ship = Ship.new()
	_ship.world = _world
	_ship.trail = _trail
	_ship.finished.connect(_on_ship_finished)
	add_child(_ship)

	_camera = CameraRig.new()
	_camera.field_size = LevelData.FIELD_SIZE
	_camera.home = Vector2.ZERO
	add_child(_camera)
	_camera.make_current()


func _build_hud() -> void:
	_hud = Hud.new()
	add_child(_hud)
	_hud.target_node = _target
	_hud.set_level(level_index, _data.name, _data.hint)
	_hud.home_pressed.connect(func(): go_home.emit())
	_hud.restart_pressed.connect(func(): _reset_round(true))
	_hud.next_pressed.connect(func(): go_next.emit(level_index + 1))

	# Input lives on the HUD layer so the drag gizmo is drawn in screen space.
	_input = LaunchInput.new()
	_hud.add_child(_input)
	_hud.move_child(_input, 0)
	_input.aim_changed.connect(_on_aim_changed)
	_input.aim_released.connect(_on_aim_released)
	_input.aim_cancelled.connect(_on_aim_cancelled)


# --- Round flow ---------------------------------------------------------------

func _reset_round(full: bool) -> void:
	if _pending and _pending.is_valid():
		_pending.kill()
	Engine.time_scale = 1.0
	_hud.hide_result()
	if full:
		_attempts = 0
		_trail.clear_all()
	else:
		_trail.to_ghost()
	_level_done = false
	_camera.follow_target = null
	_preview.hide_preview()
	if _ship_tween and _ship_tween.is_valid():
		_ship_tween.kill()
	_ship.reset_to(_start)
	_ship.scale = Vector2.ZERO
	_ship_tween = _ship.create_tween()
	_ship_tween.tween_property(_ship, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_hud.set_attempt(_attempts + 1)
	_input.enabled = true


func _on_aim_changed(velocity: Vector2) -> void:
	if _ship.state != Ship.State.READY:
		return
	_ship.set_aim(velocity)
	_preview.show_for(_start, velocity)


func _on_aim_cancelled() -> void:
	_ship.clear_aim()
	_preview.hide_preview()


func _on_aim_released(velocity: Vector2) -> void:
	if _ship.state != Ship.State.READY:
		return
	_input.enabled = false
	_preview.hide_preview()
	_attempts += 1
	_ship.launch(velocity)
	_camera.follow_target = _ship
	_camera.shake(0.18)
	_hud.hide_hint()
	var power := GP.power_of(velocity)
	Sfx.play("launch", 0.0, lerpf(0.9, 1.2, power))
	GameState.vibrate(15)


func _on_ship_finished(outcome: int, at: Vector2) -> void:
	_camera.follow_target = null
	if outcome == GP.Outcome.TARGET:
		_on_win()
	elif outcome == GP.Outcome.CRASH:
		_on_crash(at)
	else:
		_on_lost()


func _on_win() -> void:
	_level_done = true
	var earned: int = GameState.stars_for_attempts(_attempts)
	GameState.complete_level(level_index, earned)
	var tp := _world.target_pos

	# Hit-stop: a split second of slow motion sells the impact.
	Engine.time_scale = 0.3
	get_tree().create_timer(0.12, true, false, true).timeout.connect(Callable(Engine, "set").bind("time_scale", 1.0))

	_target.celebrate()
	Effects.burst(self, tp, Tuning.COLOR_SUCCESS, 70, 560.0, 1.2)
	Effects.burst(self, tp, Tuning.COLOR_ACCENT_2, 30, 320.0, 0.9)
	Effects.shockwave(self, tp, Tuning.COLOR_SUCCESS, 380.0, 0.9)
	Effects.shockwave(self, tp, Color.WHITE, 200.0, 0.5)
	_camera.shake(0.4)
	_camera.punch(0.07)
	_hud.flash(Color(0.6, 1.0, 0.85), 0.35)
	Sfx.play("win")
	GameState.vibrate(60)

	# Ship spirals into the portal.
	if _ship_tween and _ship_tween.is_valid():
		_ship_tween.kill()
	_ship_tween = _ship.create_tween().set_parallel(true)
	_ship_tween.tween_property(_ship, "position", tp, 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_ship_tween.tween_property(_ship, "scale", Vector2.ZERO, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	_ship_tween.tween_property(_ship, "rotation", _ship.rotation + TAU * 1.5, 0.4)

	_pending = create_tween()
	_pending.tween_interval(1.0)
	_pending.tween_callback(func():
		_hud.show_result(level_index, _data.name, earned, _attempts, GameState.has_next(level_index)))


func _on_crash(at: Vector2) -> void:
	_ship.visible = false
	Effects.burst(self, at, Color(1.0, 0.55, 0.2), 60, 440.0, 0.9)
	Effects.burst(self, at, Color(1.0, 0.9, 0.6), 20, 220.0, 0.6)
	Effects.shockwave(self, at, Color(1.0, 0.5, 0.25), 140.0, 0.45)
	_camera.shake(0.65)
	_hud.flash(Color(1.0, 0.4, 0.3), 0.2)
	_hud.toast("CRASHED", Tuning.COLOR_DANGER)
	Sfx.play("crash")
	GameState.vibrate(90)
	_schedule_reset(1.1)


func _on_lost() -> void:
	_hud.toast("LOST IN SPACE", Tuning.COLOR_TEXT_DIM)
	Sfx.play("lost")
	GameState.vibrate(30)
	_schedule_reset(0.9)


func _schedule_reset(delay: float) -> void:
	_pending = create_tween()
	_pending.tween_interval(delay)
	_pending.tween_callback(_reset_round.bind(false))
