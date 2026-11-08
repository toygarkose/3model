## The player's ship. Owns its own flight integration (via GravityPhysics),
## draws itself procedurally, and reports how the flight ended.
extends Node2D

signal finished(outcome: int, at: Vector2)

const GP = preload("res://scripts/physics/gravity_physics.gd")
const Tuning = preload("res://scripts/config/tuning.gd")
const Trail = preload("res://scripts/game/trail.gd")

enum State { READY, FLYING, DONE }

var state: int = State.READY
var world: GP.World
var trail: Trail
var velocity := Vector2.ZERO

var _sim := GP.SimState.new()
var _acc := 0.0
var _flight_time := 0.0
var _aim_power := 0.0
var _flame := 0.0
var _time := 0.0

const HULL := [Vector2(20, 0), Vector2(-12, -12), Vector2(-6, 0), Vector2(-12, 12)]


func reset_to(start: Vector2) -> void:
	state = State.READY
	position = start
	rotation = -PI / 2.0
	scale = Vector2.ONE
	modulate = Color.WHITE
	visible = true
	velocity = Vector2.ZERO
	_aim_power = 0.0
	_flame = 0.0
	queue_redraw()


func set_aim(launch_velocity: Vector2) -> void:
	if state != State.READY:
		return
	_aim_power = GP.power_of(launch_velocity)
	if launch_velocity != Vector2.ZERO:
		rotation = launch_velocity.angle()


func clear_aim() -> void:
	_aim_power = 0.0


func launch(launch_velocity: Vector2) -> void:
	state = State.FLYING
	_sim.pos = position
	_sim.vel = launch_velocity
	velocity = launch_velocity
	rotation = launch_velocity.angle()
	_acc = 0.0
	_flight_time = 0.0
	_aim_power = 0.0
	_flame = 1.0
	if trail:
		trail.start(position)


func _physics_process(delta: float) -> void:
	if state != State.FLYING:
		return
	_acc += delta
	var steps := 0
	while _acc >= Tuning.SIM_DT and steps < Tuning.MAX_STEPS_PER_FRAME:
		GP.step(_sim, world.bodies, Tuning.SIM_DT)
		_acc -= Tuning.SIM_DT
		_flight_time += Tuning.SIM_DT
		steps += 1
		var outcome := GP.classify(_sim.pos, world)
		if outcome == GP.Outcome.NONE and _flight_time > Tuning.MAX_FLIGHT_TIME:
			outcome = GP.Outcome.LOST
		if outcome != GP.Outcome.NONE:
			position = _sim.pos
			state = State.DONE
			finished.emit(outcome, _sim.pos)
			return
	position = _sim.pos
	velocity = _sim.vel
	rotation = lerp_angle(rotation, velocity.angle(), 0.5)
	if trail:
		trail.add(position, velocity.length())


func _process(delta: float) -> void:
	_time += delta
	_flame = move_toward(_flame, 0.35 if state == State.FLYING else 0.0, delta * 1.5)
	queue_redraw()


func _draw() -> void:
	# Soft halo
	draw_circle(Vector2.ZERO, 26.0, Color(0.37, 0.91, 1.0, 0.06))
	draw_circle(Vector2.ZERO, 16.0, Color(0.37, 0.91, 1.0, 0.08))

	# Engine flame
	if _flame > 0.01:
		var flick := 0.8 + 0.2 * sin(_time * 55.0) + 0.1 * sin(_time * 31.0)
		var speed_k := clampf(velocity.length() / Tuning.MAX_LAUNCH_SPEED, 0.3, 1.4)
		var length := (14.0 + 30.0 * _flame) * flick * speed_k
		draw_colored_polygon(PackedVector2Array([Vector2(-7, -6), Vector2(-7 - length, 0), Vector2(-7, 6)]),
				Color(1.0, 0.55, 0.15, 0.85))
		draw_colored_polygon(PackedVector2Array([Vector2(-7, -3), Vector2(-7 - length * 0.55, 0), Vector2(-7, 3)]),
				Color(1.0, 0.95, 0.7, 0.95))
	elif state == State.READY:
		var pulse := 0.5 + 0.5 * sin(_time * 4.0)
		draw_circle(Vector2(-9, 0), 3.0 + pulse * 1.5, Color(0.37, 0.91, 1.0, 0.6))

	# Hull
	var hull := PackedVector2Array(HULL)
	draw_colored_polygon(hull, Color(0.86, 0.92, 1.0))
	var outline := hull.duplicate()
	outline.append(hull[0])
	draw_polyline(outline, Color(0.37, 0.91, 1.0), 2.0, true)
	draw_colored_polygon(PackedVector2Array([Vector2(10, 0), Vector2(0, -4), Vector2(0, 4)]), Color(0.2, 0.55, 0.9))

	# Aim power ring (drawn unrotated so it reads like a gauge)
	if state == State.READY and _aim_power > 0.0:
		var c := Tuning.COLOR_ACCENT.lerp(Tuning.COLOR_ACCENT_2, _aim_power)
		draw_set_transform(Vector2.ZERO, -rotation, Vector2.ONE)
		draw_arc(Vector2.ZERO, 34.0, -PI / 2.0, -PI / 2.0 + TAU * _aim_power, 64, c, 4.0, true)
		draw_arc(Vector2.ZERO, 34.0, 0.0, TAU, 64, Color(1, 1, 1, 0.08), 4.0, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
