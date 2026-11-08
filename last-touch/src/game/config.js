// LAST TOUCH — global tuning. Every gameplay number lives here.
// World units are metres. +x = right, +y = up, the attacking goal is at -z.

export const PITCH = { length: 105, width: 68, halfL: 52.5, halfW: 34 };
export const GOAL = { z: -52.5, halfWidth: 3.66, height: 2.44, depth: 2.0, postR: 0.06 };
export const BOX = { depth: 16.5, halfWidth: 20.16 };       // penalty area
export const SIX = { depth: 5.5, halfWidth: 9.16 };         // six-yard box
export const BALL_R = 0.11;

export const DT = 1 / 120;                                   // fixed simulation step

export const PHYS = {
  gravity: 9.81,
  restitution: 0.55,
  rollFriction: 1.1,      // exp decay per second while rolling
  airDrag: 0.06,
};

export const PLAY = {
  // passing
  loftDistance: 24,       // passes longer than this are lofted automatically
  passSpeedMin: 13,
  passSpeedMax: 25,
  passDecel: 0.4,         // ball keeps 60% of its speed at the end of a ground pass
  loftHeightMin: 2.6,
  loftHeightMax: 7.5,
  maxCurve: 0.28,         // max sideways bend as a fraction of pass length
  maxShotCurve: 0.15,     // shots bend less: real curlers move 2-4 m
  curveDeadzone: 0.05,
  snapRadius: 2.8,        // pass lands this close to a runner -> perfectly weighted
  receiveTolerance: 0.35, // seconds a receiver may arrive after the ball
  headerHeight: 1.7,
  // shooting
  shotRange: 34,
  shotSpeedMin: 19,
  shotSpeedMax: 31,
  headerSpeedMin: 13,
  headerSpeedMax: 19,
  // players
  runSpeed: 7.0,
  defSpeed: 6.0,
  defReaction: 0.22,
  defReach: 0.9,
  defHeadReach: 2.25,
  wallReach: 0.42,
  wallHeight: 2.3,
  accel: 16,
  // goalkeeper
  keeperReaction: 0.26,
  keeperSpeed: 5.0,
  keeperRise: 4.2,
  keeperReach: 1.0,
  keeperJump: 2.6,
  keeperClaimReach: 1.4,
};

// Stars: 1 = objective, 2 = efficient (<= par moves), 3 = style.
export const STYLE = {
  cornerX: 2.4,           // |x| beyond this at the goal line = corner finish
  cornerY: 1.55,          // or higher than this
  curveMin: 0.07,
};
