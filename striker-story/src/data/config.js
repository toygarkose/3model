// STRIKER STORY tuning. Units: metres, seconds. The goal line is y = 0,
// the pitch extends toward +y (down the screen), goal centre at x = 0.
export const GOAL = { halfW: 3.66, h: 2.44, depth: 2.0, postR: 0.06 };
export const BOX = { depth: 16.5, halfW: 20.16 };
export const SIX = { depth: 5.5, halfW: 9.16 };
export const BALL_R = 0.11;
export const DT = 1 / 120;

export const BALL = {
  drag: 0.013,        // real football: 0.5*rho*Cd*A/m ≈ 0.013 1/m
  magnus: 0.3,        // sideways accel = spin * magnus * speed
  spinDecay: 0.35,
  gravity: 9.81,
  bounce: 0.5,
  roll: 1.6,          // rolling deceleration m/s^2
};

export const SHOT = {
  minSpeed: 6,
  baseMax: 23,        // max speed with Power 0
  powerGain: 0.11,    // +m/s per Power point (Power 100 -> 34 m/s)
  driveMin: 3,        // launch elevation (deg) at low power
  driveMax: 13,       // ... at full power
  lob: 30,            // chip elevation (deg)
  baseCurl: 0.55,
  curlGain: 0.009,    // spin per Curl point
  wobbleMax: 7,     // aim error (deg) at Shooting 0
  wobbleMin: 0.8,     // ... at Shooting 100
  maxDragFrac: 0.33,  // drag distance for full power, fraction of screen size
};

export const AI = {
  keeperReact: 0.28, keeperSpeed: 4.3, keeperReach: 0.9, keeperJump: 2.45,
  defReact: 0.22, defSpeed: 5.8, defReach: 0.75, defJump: 2.1,
  wallJump: 2.05, wallStand: 1.8,
  lunge: 2.2,        // a defender can only lunge at a shot, not sprint
  mateReach: 1.2,
};

export const PRESSURE = { base: 3.6, composureGain: 0.025 };   // seconds to act in open play
