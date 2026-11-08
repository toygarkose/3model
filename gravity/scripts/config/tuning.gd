## Global tuning parameters for GRAVITY.
## Tweak these to change how the game feels. Every gameplay script reads
## its numbers from here, so you never have to hunt for magic numbers.
extends RefCounted

# --- Physics -----------------------------------------------------------------
## Gravitational parameter (G * M) for a planet with mass = 1.0.
## Higher = stronger pull. Units: px^3 / s^2.
const BASE_MU := 1.8e7
## Softening length (px). Prevents infinite force very close to a center.
const SOFTENING := 12.0
## Fixed simulation step (s). Ship flight AND trajectory preview both use
## this exact step, so the preview always matches the real flight.
const SIM_DT := 1.0 / 120.0
## Safety cap so a slow frame never runs hundreds of steps at once.
const MAX_STEPS_PER_FRAME := 8
## A flight longer than this counts as "lost in space" (stuck in orbit).
const MAX_FLIGHT_TIME := 14.0
## How far outside the level rectangle the ship may travel before it is lost.
const BOUNDS_MARGIN := 260.0
## Ship collision radius (px) used against planets.
const SHIP_RADIUS := 10.0

# --- Launch control ----------------------------------------------------------
## Drag distance (screen px) that gives full launch power.
const MAX_DRAG := 260.0
## Drags shorter than this are ignored (treated as a tap / cancel).
const MIN_DRAG := 22.0
## Launch speed at full power (px / s).
const MAX_LAUNCH_SPEED := 760.0
## Lowest launch speed when a drag is accepted (px / s).
const MIN_LAUNCH_SPEED := 120.0

# --- Trajectory preview ------------------------------------------------------
## Distance between preview dots (px).
const PREVIEW_DOT_SPACING := 20.0
## How fast the dots "march" along the path (px / s).
const PREVIEW_MARCH_SPEED := 40.0

# --- Camera & feel -----------------------------------------------------------
## How strongly the camera leans towards the flying ship (0 = fixed, 1 = follow).
const CAMERA_FOLLOW := 0.18
const CAMERA_SMOOTH := 4.0
const SHAKE_MAX_OFFSET := 26.0
const SHAKE_DECAY := 2.2

# --- Scoring -----------------------------------------------------------------
## Attempts needed for 3 / 2 stars (anything above = 1 star).
const THREE_STAR_ATTEMPTS := 1
const TWO_STAR_ATTEMPTS := 3

# --- Colors ------------------------------------------------------------------
const COLOR_ACCENT := Color(0.37, 0.91, 1.0)
const COLOR_ACCENT_2 := Color(1.0, 0.82, 0.4)
const COLOR_DANGER := Color(1.0, 0.36, 0.36)
const COLOR_SUCCESS := Color(0.45, 1.0, 0.7)
const COLOR_TEXT := Color(0.92, 0.95, 1.0)
const COLOR_TEXT_DIM := Color(0.6, 0.66, 0.8)
