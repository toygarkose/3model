## All level definitions live here. Add a new Dictionary to LEVELS to add a level.
##
## World coordinates: (0, 0) is the center of the level. The playfield is
## 720 x 1280 (x: -360..360, y: -640..640). +y points DOWN (Godot 2D).
##
## Keys:
##   name          Display name.
##   hint          Short tip shown at the bottom of the screen.
##   start         Ship start position.
##   target        Target center. target_radius = how close you must get.
##   planets       Array of { pos, radius, mass, style }.
##                 mass 1.0 = Tuning.BASE_MU. style: see planet.gd PALETTES.
##   preview_time  Seconds of trajectory shown while aiming. Shorter = harder.
##
## Every level below was verified solvable with an offline simulation of the
## exact same physics (see README).
extends RefCounted

const LEVELS: Array = [
	{
		"name": "First Orbit",
		"hint": "Drag back anywhere, then release. Gravity will bend your path.",
		"start": Vector2(0, 500),
		"target": Vector2(0, -470),
		"target_radius": 48.0,
		"preview_time": 4.0,
		"planets": [
			{"pos": Vector2(0, 0), "radius": 110.0, "mass": 1.0, "style": "terra"},
		],
	},
	{
		"name": "Off Center",
		"hint": "Stronger planets pull harder. Aim wide and let it curve.",
		"start": Vector2(-230, 520),
		"target": Vector2(210, -480),
		"target_radius": 44.0,
		"preview_time": 2.6,
		"planets": [
			{"pos": Vector2(60, -30), "radius": 125.0, "mass": 1.3, "style": "desert"},
		],
	},
	{
		"name": "Twin Worlds",
		"hint": "Two pulls at once. Thread the gap.",
		"start": Vector2(0, 540),
		"target": Vector2(0, -520),
		"target_radius": 42.0,
		"preview_time": 1.9,
		"planets": [
			{"pos": Vector2(-150, 180), "radius": 90.0, "mass": 0.9, "style": "ice"},
			{"pos": Vector2(160, -170), "radius": 100.0, "mass": 1.1, "style": "lava"},
		],
	},
	{
		"name": "Detour",
		"hint": "The straight line is blocked. Swing around the giant.",
		"start": Vector2(-240, 520),
		"target": Vector2(240, 520),
		"target_radius": 44.0,
		"preview_time": 1.5,
		"planets": [
			{"pos": Vector2(0, -80), "radius": 130.0, "mass": 1.6, "style": "gas"},
			{"pos": Vector2(0, 470), "radius": 75.0, "mass": 0.45, "style": "moon"},
		],
	},
	{
		"name": "Triad",
		"hint": "Three worlds, short sight. Trust your instincts.",
		"start": Vector2(250, 560),
		"target": Vector2(-240, -540),
		"target_radius": 38.0,
		"preview_time": 1.1,
		"planets": [
			{"pos": Vector2(-120, 220), "radius": 85.0, "mass": 0.8, "style": "ice"},
			{"pos": Vector2(150, -40), "radius": 95.0, "mass": 1.0, "style": "terra"},
			{"pos": Vector2(-110, -300), "radius": 70.0, "mass": 0.6, "style": "lava"},
		],
	},
]

## Size of the playfield the camera fits on screen.
const FIELD_SIZE := Vector2(720, 1280)


static func count() -> int:
	return LEVELS.size()


static func get_level(index: int) -> Dictionary:
	return LEVELS[clampi(index, 0, LEVELS.size() - 1)]
