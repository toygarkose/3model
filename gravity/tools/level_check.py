"""Offline level checker for GRAVITY.

Re-implements the exact physics of scripts/physics/gravity_physics.gd
(same integrator, step, softening and collision rules) and brute-forces
launch angles/powers to tell you if a level is solvable and how hard it is.

Usage:  python3 tools/level_check.py
Edit LEVELS below to mirror scripts/levels/level_data.gd when you add levels.
"""
import math

# --- keep in sync with scripts/config/tuning.gd -------------------------------
BASE_MU = 1.8e7
SOFTENING = 12.0
SIM_DT = 1.0 / 120.0
MAX_FLIGHT_TIME = 14.0
BOUNDS_MARGIN = 260.0
SHIP_RADIUS = 10.0
MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED = 120.0, 760.0
MAX_DRAG, MIN_DRAG = 260.0, 22.0
HALF_W, HALF_H = 360.0, 640.0

LEVELS = [
    ("First Orbit", (0, 500), (0, -470), 48, [((0, 0), 110, 1.0)]),
    ("Off Center", (-230, 520), (210, -480), 44, [((60, -30), 125, 1.3)]),
    ("Twin Worlds", (0, 540), (0, -520), 42, [((-150, 180), 90, 0.9), ((160, -170), 100, 1.1)]),
    ("Detour", (-240, 520), (240, 520), 44, [((0, -80), 130, 1.6), ((0, 470), 75, 0.45)]),
    ("Triad", (250, 560), (-240, -540), 38,
     [((-120, 220), 85, 0.8), ((150, -40), 95, 1.0), ((-110, -300), 70, 0.6)]),
]


def simulate(start, target, tr, planets, vx, vy):
    x, y = start
    t = 0.0
    soft2 = SOFTENING * SOFTENING
    while t < MAX_FLIGHT_TIME:
        ax = ay = 0.0
        for (px, py), _r, m in planets:
            dx, dy = px - x, py - y
            inv = 1.0 / math.sqrt(dx * dx + dy * dy + soft2)
            k = BASE_MU * m * inv ** 3
            ax += dx * k
            ay += dy * k
        vx += ax * SIM_DT
        vy += ay * SIM_DT
        x += vx * SIM_DT
        y += vy * SIM_DT
        t += SIM_DT
        for (px, py), r, _m in planets:
            if (x - px) ** 2 + (y - py) ** 2 < (r + SHIP_RADIUS) ** 2:
                return "crash"
        if (x - target[0]) ** 2 + (y - target[1]) ** 2 < tr * tr:
            return "win"
        if not (-HALF_W - BOUNDS_MARGIN <= x <= HALF_W + BOUNDS_MARGIN and
                -HALF_H - BOUNDS_MARGIN <= y <= HALF_H + BOUNDS_MARGIN):
            return "lost"
    return "lost"


def main():
    min_power = MIN_DRAG / MAX_DRAG
    for i, (name, start, target, tr, planets) in enumerate(LEVELS, 1):
        wins = total = 0
        for a_step in range(0, 360 * 2):          # 0.5 degree steps
            a = math.radians(a_step * 0.5)
            for p_step in range(0, 41):
                power = min_power + (1 - min_power) * p_step / 40
                speed = MIN_LAUNCH_SPEED + (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED) * power
                total += 1
                if simulate(start, target, tr, planets, math.cos(a) * speed, math.sin(a) * speed) == "win":
                    wins += 1
        verdict = "OK" if wins else "UNSOLVABLE!"
        print(f"Level {i} {name:12s} winning shots: {100 * wins / total:5.2f}%  {verdict}")


if __name__ == "__main__":
    main()
