## A planet: procedural shader sphere + faint "gravity well" rings.
## The physics for this planet lives in GravityPhysics.Body; this node is visual.
extends Node2D

const PLANET_SHADER = preload("res://shaders/planet.gdshader")
const RECT_SCALE := 1.7   # quad half-size / radius (room for the atmosphere glow)

## Color sets for each planet style. Add your own here.
const PALETTES := {
	"terra": {"deep": Color(0.04, 0.14, 0.42), "mid": Color(0.10, 0.45, 0.28), "high": Color(0.80, 0.76, 0.60),
		"atmo": Color(0.40, 0.72, 1.0), "banded": 0.0, "clouds": 0.55, "scale": 2.4},
	"desert": {"deep": Color(0.45, 0.20, 0.08), "mid": Color(0.78, 0.48, 0.22), "high": Color(0.96, 0.82, 0.58),
		"atmo": Color(1.0, 0.65, 0.40), "banded": 0.0, "clouds": 0.12, "scale": 2.8},
	"ice": {"deep": Color(0.20, 0.36, 0.60), "mid": Color(0.62, 0.80, 0.95), "high": Color(0.96, 0.98, 1.0),
		"atmo": Color(0.55, 0.85, 1.0), "banded": 0.0, "clouds": 0.25, "scale": 3.2},
	"lava": {"deep": Color(0.10, 0.03, 0.03), "mid": Color(0.32, 0.07, 0.04), "high": Color(1.0, 0.45, 0.10),
		"atmo": Color(1.0, 0.38, 0.18), "banded": 0.0, "clouds": 0.0, "scale": 3.0},
	"gas": {"deep": Color(0.55, 0.32, 0.20), "mid": Color(0.92, 0.76, 0.55), "high": Color(0.98, 0.93, 0.85),
		"atmo": Color(1.0, 0.80, 0.55), "banded": 1.0, "clouds": 0.0, "scale": 2.0},
	"moon": {"deep": Color(0.22, 0.22, 0.25), "mid": Color(0.45, 0.45, 0.48), "high": Color(0.72, 0.72, 0.74),
		"atmo": Color(0.70, 0.75, 0.85), "banded": 0.0, "clouds": 0.0, "scale": 4.0},
}

var radius := 100.0
var mass := 1.0
var style := "terra"
var _time := 0.0


func setup(p_pos: Vector2, p_radius: float, p_mass: float, p_style: String, seed_value: float) -> void:
	position = p_pos
	radius = p_radius
	mass = p_mass
	style = p_style if PALETTES.has(p_style) else "terra"
	var pal: Dictionary = PALETTES[style]

	var quad := ColorRect.new()
	quad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var half := radius * RECT_SCALE
	quad.size = Vector2(half, half) * 2.0
	quad.position = -Vector2(half, half)
	var mat := ShaderMaterial.new()
	mat.shader = PLANET_SHADER
	mat.set_shader_parameter("color_deep", pal.deep)
	mat.set_shader_parameter("color_mid", pal.mid)
	mat.set_shader_parameter("color_high", pal.high)
	mat.set_shader_parameter("atmo_color", pal.atmo)
	mat.set_shader_parameter("banded", pal.banded)
	mat.set_shader_parameter("clouds", pal.clouds)
	mat.set_shader_parameter("noise_scale", pal.scale)
	mat.set_shader_parameter("rect_scale", RECT_SCALE)
	mat.set_shader_parameter("seed", seed_value)
	mat.set_shader_parameter("rotation_speed", 0.06 / maxf(radius / 100.0, 0.5))
	mat.set_shader_parameter("atmo_strength", 0.55 if style == "moon" else 1.0)
	quad.material = mat
	add_child(quad)


func _process(delta: float) -> void:
	_time += delta
	queue_redraw()


## Soft rings hint at the reach of this planet's gravity.
func _draw() -> void:
	var pal: Dictionary = PALETTES[style]
	var c: Color = pal.atmo
	for i in 3:
		var t := fposmod(_time * 0.12 + i / 3.0, 1.0)
		var r := radius * lerpf(1.25, 2.6 + mass * 0.6, t)
		var a := (1.0 - t) * 0.10 * clampf(mass, 0.4, 1.6)
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 96, Color(c.r, c.g, c.b, a), 1.5, true)
