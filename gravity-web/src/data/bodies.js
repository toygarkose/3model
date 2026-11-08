// Real solar-system data (NASA planetary fact sheets, rounded).
//   g        surface gravity, m/s^2
//   radiusKm mean radius
//   escKms   escape velocity, km/s
//   dayH     sidereal rotation period, hours (negative = retrograde)
//   atmBar   surface pressure, bar (0 = none)
//
// How the game maps reality onto the screen:
//   * Surface gravity is REAL relative to Earth: a body with 0.38 g pulls
//     at its surface exactly 0.38x as hard as Earth does.
//   * Sizes are compressed (radius ~ realRadius^0.35) so Jupiter and the
//     Moon fit on one phone screen. Because GM = g * R^2, the game mass
//     follows from the real surface gravity and the game radius.
//   * Rotation speeds keep their real ratios (Jupiter spins fastest,
//     Venus spins backwards). Moons follow Kepler's third law.

export const G0 = 1400;            // game px/s^2 for 1 g at the surface
export const EARTH_R_PX = 92;      // Earth's radius on screen
export const C_LIGHT = 1880;       // game speed of light (black holes)

export const BODIES = {
  mercury: { name: 'Mercury', g: 3.70, radiusKm: 2440, escKms: 4.25, dayH: 1407.6, atmBar: 0, style: 'mercury',
    fact: 'A year on Mercury lasts only 88 Earth days.' },
  venus: { name: 'Venus', g: 8.87, radiusKm: 6052, escKms: 10.36, dayH: -5832.5, atmBar: 92, style: 'venus',
    fact: 'Its air is 92 times denser than ours. It brakes anything flying low.' },
  earth: { name: 'Earth', g: 9.81, radiusKm: 6371, escKms: 11.19, dayH: 23.9, atmBar: 1, style: 'earth',
    fact: 'The only world we know with liquid oceans on the surface.' },
  moon: { name: 'Moon', g: 1.62, radiusKm: 1737, escKms: 2.38, dayH: 655.7, atmBar: 0, style: 'moon',
    fact: 'Tidally locked: it always shows Earth the same face.' },
  mars: { name: 'Mars', g: 3.71, radiusKm: 3390, escKms: 5.03, dayH: 24.6, atmBar: 0.006, style: 'mars',
    fact: 'Home of Olympus Mons, a volcano nearly 22 km high.' },
  ceres: { name: 'Ceres', g: 0.28, radiusKm: 470, escKms: 0.51, dayH: 9.1, atmBar: 0, style: 'rock',
    fact: 'The largest object in the asteroid belt, and a dwarf planet.' },
  jupiter: { name: 'Jupiter', g: 24.79, radiusKm: 69911, escKms: 59.5, dayH: 9.9, atmBar: 0, style: 'jupiter',
    fact: 'Its Great Red Spot is a storm wider than Earth.' },
  io: { name: 'Io', g: 1.80, radiusKm: 1822, escKms: 2.56, dayH: 42.5, atmBar: 0, style: 'io',
    fact: 'The most volcanic place in the solar system.' },
  europa: { name: 'Europa', g: 1.31, radiusKm: 1561, escKms: 2.03, dayH: 85.2, atmBar: 0, style: 'europa',
    fact: 'Hides a salty ocean under its ice shell.' },
  ganymede: { name: 'Ganymede', g: 1.43, radiusKm: 2634, escKms: 2.74, dayH: 171.7, atmBar: 0, style: 'ganymede',
    fact: 'The largest moon in the solar system, bigger than Mercury.' },
  callisto: { name: 'Callisto', g: 1.24, radiusKm: 2410, escKms: 2.44, dayH: 400.5, atmBar: 0, style: 'callisto',
    fact: 'One of the most heavily cratered surfaces known.' },
  saturn: { name: 'Saturn', g: 10.44, radiusKm: 58232, escKms: 35.5, dayH: 10.7, atmBar: 0, style: 'saturn',
    fact: 'Less dense than water. Its rings are mostly ice.' },
  titan: { name: 'Titan', g: 1.35, radiusKm: 2575, escKms: 2.64, dayH: 382.7, atmBar: 1.45, style: 'titan',
    fact: 'The only moon with a thick atmosphere, thicker than Earth\'s.' },
  uranus: { name: 'Uranus', g: 8.69, radiusKm: 25362, escKms: 21.3, dayH: -17.2, atmBar: 0, style: 'uranus',
    fact: 'It rotates on its side, tilted 98 degrees.' },
  neptune: { name: 'Neptune', g: 11.15, radiusKm: 24622, escKms: 23.5, dayH: 16.1, atmBar: 0, style: 'neptune',
    fact: 'The windiest planet: storms reach 2,100 km/h.' },
  triton: { name: 'Triton', g: 0.78, radiusKm: 1353, escKms: 1.46, dayH: -141, atmBar: 0, style: 'triton',
    fact: 'Orbits Neptune backwards, likely a captured dwarf planet.' },
  pluto: { name: 'Pluto', g: 0.62, radiusKm: 1188, escKms: 1.21, dayH: -153.3, atmBar: 0, style: 'pluto',
    fact: 'Pluto and Charon orbit a point in empty space between them.' },
  charon: { name: 'Charon', g: 0.29, radiusKm: 606, escKms: 0.59, dayH: -153.3, atmBar: 0, style: 'charon',
    fact: 'Half Pluto\'s size, so big that they form a double world.' },
  blackhole: { name: 'Black Hole', g: 0, radiusKm: 0, escKms: 299792, dayH: 0, atmBar: 0, style: 'blackhole',
    fact: 'Inside the event horizon r = 2GM/c^2, not even light escapes.' },
  rock: { name: 'Asteroid', g: 0.05, radiusKm: 100, escKms: 0.1, dayH: 6, atmBar: 0, style: 'rock',
    fact: 'Leftover building blocks from the birth of the solar system.' },
};

const EARTH_KM = 6371;

// Game radius from the real radius (compressed so everything fits on a phone).
export function gameRadius(key) {
  const b = BODIES[key];
  if (key === 'rock') return 18;
  return Math.max(30, Math.min(230, EARTH_R_PX * Math.pow(b.radiusKm / EARTH_KM, 0.35)));
}

// GM in game units, from the REAL surface gravity: GM = g * R^2.
export function gameMu(key, r) {
  return (BODIES[key].g / 9.81) * G0 * r * r;
}

// Atmospheric drag coefficient (1/s) from real surface pressure.
export function dragCoef(key) {
  const p = BODIES[key].atmBar;
  return p > 0 ? 0.1 * Math.sqrt(p) : 0;
}

// Spin speed for the shader, keeping real day-length ratios (Jupiter = fastest).
export function spinRate(key) {
  const d = BODIES[key].dayH;
  if (!d) return 0;
  return Math.sign(d) * Math.min(0.35, 3.5 / Math.abs(d) + 0.004);
}

export function formatG(key) {
  const b = BODIES[key];
  return `${b.g.toFixed(2)} m/s² · ${(b.g / 9.81).toFixed(2)} g`;
}
