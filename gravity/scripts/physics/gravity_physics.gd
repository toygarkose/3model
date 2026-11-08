## Pure gravity simulation. No nodes, no drawing — just math.
## Used by BOTH the flying ship and the trajectory preview, so the predicted
## path and the real flight are always identical (same integrator, same step).
extends RefCounted

const Tuning = preload("res://scripts/config/tuning.gd")

enum Outcome { NONE, CRASH, TARGET, LOST }


## A gravity source (planet / moon).
class Body:
	var pos: Vector2
	var mu: float      # G * M
	var radius: float

	func _init(p_pos: Vector2, p_radius: float, p_mass: float) -> void:
		pos = p_pos
		radius = p_radius
		mu = Tuning.BASE_MU * p_mass


## Everything the simulation needs to know about a level.
class World:
	var bodies: Array = []          # Array of Body
	var target_pos: Vector2
	var target_radius: float
	var bounds: Rect2               # already includes the margin


## Mutable position/velocity pair being integrated.
class SimState:
	var pos: Vector2
	var vel: Vector2

	func _init(p_pos := Vector2.ZERO, p_vel := Vector2.ZERO) -> void:
		pos = p_pos
		vel = p_vel


## Result of a trajectory prediction.
class Prediction:
	var points := PackedVector2Array()
	var outcome: int = Outcome.NONE
	var end_pos := Vector2.ZERO


## Gravitational acceleration at `pos` (sum over all bodies).
static func acceleration(pos: Vector2, bodies: Array) -> Vector2:
	var acc := Vector2.ZERO
	var soft2 := Tuning.SOFTENING * Tuning.SOFTENING
	for b in bodies:
		var body: Body = b
		var delta := body.pos - pos
		var r2 := delta.length_squared() + soft2
		var inv_r := 1.0 / sqrt(r2)
		acc += delta * (body.mu * inv_r * inv_r * inv_r)
	return acc


## Advance one fixed step with semi-implicit (symplectic) Euler.
## Cheap, deterministic, and keeps orbits stable — ideal for mobile.
static func step(s: SimState, bodies: Array, dt: float) -> void:
	s.vel += acceleration(s.pos, bodies) * dt
	s.pos += s.vel * dt


## What happens to a ship at `pos`?
static func classify(pos: Vector2, world: World) -> int:
	for b in world.bodies:
		var body: Body = b
		var r := body.radius + Tuning.SHIP_RADIUS
		if pos.distance_squared_to(body.pos) < r * r:
			return Outcome.CRASH
	if pos.distance_squared_to(world.target_pos) < world.target_radius * world.target_radius:
		return Outcome.TARGET
	if not world.bounds.has_point(pos):
		return Outcome.LOST
	return Outcome.NONE


## Simulate a launch for up to `max_time` seconds and record every step.
static func predict(start: Vector2, velocity: Vector2, world: World, max_time: float) -> Prediction:
	var result := Prediction.new()
	var s := SimState.new(start, velocity)
	var steps := int(max_time / Tuning.SIM_DT)
	result.points.append(start)
	for i in steps:
		step(s, world.bodies, Tuning.SIM_DT)
		result.points.append(s.pos)
		var outcome := classify(s.pos, world)
		if outcome != Outcome.NONE:
			result.outcome = outcome
			break
	result.end_pos = s.pos
	return result


## Convert a drag vector (screen px, pointing where the player pulled)
## into a launch velocity. Pull back to shoot forward, like a slingshot.
static func drag_to_velocity(drag: Vector2) -> Vector2:
	var length := drag.length()
	if length < Tuning.MIN_DRAG:
		return Vector2.ZERO
	var power := clampf(length / Tuning.MAX_DRAG, 0.0, 1.0)
	var speed := lerpf(Tuning.MIN_LAUNCH_SPEED, Tuning.MAX_LAUNCH_SPEED, power)
	return -drag.normalized() * speed


## 0..1 power value for a velocity (used for UI).
static func power_of(velocity: Vector2) -> float:
	if velocity == Vector2.ZERO:
		return 0.0
	return clampf(inverse_lerp(Tuning.MIN_LAUNCH_SPEED, Tuning.MAX_LAUNCH_SPEED, velocity.length()), 0.0, 1.0)
