// Worlds (chapters) and the recipe for every level.
// The generator (tools/generate-levels.mjs) turns each recipe into a concrete,
// verified-solvable layout. Recipes only say WHAT is in the level; the generator
// finds WHERE, and checks difficulty with thousands of simulated launches.
//
// Recipe keys:
//   bodies : primary bodies (keys from bodies.js)
//   moons  : [{ key, parent: index into bodies, dir: 1 | -1 }]  -> Kepler orbits
//   binary : [a, b, separation]  indices of two bodies orbiting their barycentre
//   rings  : index of a body that gets Saturn-style rings (with Cassini Division)
//   rocks  : number of small asteroids
//   field  : optional larger play area for big systems
//   fixed  : hand placement { start, target, bodies:[[x,y]] } (tutorials)

export const WORLDS = [
  {
    id: 1, name: 'Inner Worlds', subtitle: 'Moon · Mercury · Venus · Earth · Mars',
    field: { w: 720, h: 1280 }, hue: 'blue',
    intro: 'Rocky worlds with real surface gravity. Learn to bend a path.',
  },
  {
    id: 2, name: 'The Giants', subtitle: 'Jupiter · Saturn · Uranus · Neptune',
    field: { w: 1000, h: 1780 }, hue: 'amber',
    intro: 'Gas giants pull up to 2.5 g. Their moons orbit by Kepler\'s laws — use them for gravity assists.',
  },
  {
    id: 3, name: 'Deep Space', subtitle: 'Pluto · Charon · Asteroids · Black holes',
    field: { w: 900, h: 1600 }, hue: 'violet',
    intro: 'Double worlds, asteroid fields and black holes. Cross the event horizon and nothing comes back.',
  },
];

export const RECIPES = [
  // ---------------- World 1: Inner Worlds ----------------
  { world: 1, name: 'First Light', bodies: ['earth'], tutorial: 1,
    fixed: { start: [0, 470], target: [0, -460], bodies: [[0, 0]] } },
  { world: 1, name: 'Low Gravity', bodies: ['moon'], tutorial: 2,
    fixed: { start: [-150, 480], target: [170, -470], bodies: [[40, 20]] } },
  { world: 1, name: 'Red Planet', bodies: ['mars'], tutorial: 3 },
  { world: 1, name: 'Closest to the Sun', bodies: ['mercury', 'rock'] },
  { world: 1, name: 'Thick Air', bodies: ['venus'] },
  { world: 1, name: 'Home and Moon', bodies: ['earth'], moons: [{ key: 'moon', parent: 0, dir: 1 }] },
  { world: 1, name: 'Sister Worlds', bodies: ['venus', 'earth'] },
  { world: 1, name: 'Rubble', bodies: ['mars'], rocks: 4 },
  { world: 1, name: 'Dwarf Planet', bodies: ['ceres', 'mercury'], rocks: 3 },
  { world: 1, name: 'Tidal Dance', bodies: ['earth', 'mars'], moons: [{ key: 'moon', parent: 0, dir: 1 }] },
  { world: 1, name: 'Hot and Cold', bodies: ['venus', 'mars', 'mercury'] },
  { world: 1, name: 'Inner System', bodies: ['earth', 'venus', 'mars'], moons: [{ key: 'moon', parent: 0, dir: -1 }], rocks: 2 },

  // ---------------- World 2: The Giants ----------------
  { world: 2, name: 'King of Planets', bodies: ['jupiter'] },
  { world: 2, name: 'Volcano Moon', bodies: ['jupiter'], moons: [{ key: 'io', parent: 0, dir: 1 }] },
  { world: 2, name: 'Lord of the Rings', field: { w: 1240, h: 2200 }, bodies: ['saturn'], rings: 0 },
  { world: 2, name: 'Sideways World', bodies: ['uranus', 'rock'] },
  { world: 2, name: 'Backwards Moon', bodies: ['neptune'], moons: [{ key: 'triton', parent: 0, dir: -1 }] },
  { world: 2, name: 'Ice and Fire', bodies: ['jupiter'], moons: [{ key: 'europa', parent: 0, dir: 1 }, { key: 'io', parent: 0, dir: 1 }] },
  { world: 2, name: 'Hazy Titan', field: { w: 1240, h: 2200 }, bodies: ['saturn'], rings: 0, moons: [{ key: 'titan', parent: 0, dir: 1 }] },
  { world: 2, name: 'Ice Giants', bodies: ['uranus', 'neptune'] },
  { world: 2, name: 'Galilean', bodies: ['jupiter'], moons: [{ key: 'ganymede', parent: 0, dir: 1 }, { key: 'callisto', parent: 0, dir: 1 }] },
  { world: 2, name: 'Ring Runner', field: { w: 1240, h: 2200 }, bodies: ['saturn'], rings: 0, rocks: 2 },
  { world: 2, name: 'Twin Giants', field: { w: 1240, h: 2200 }, bodies: ['jupiter', 'saturn'], rings: 1 },
  { world: 2, name: 'Grand Tour', bodies: ['jupiter', 'neptune'], moons: [{ key: 'io', parent: 0, dir: 1 }, { key: 'triton', parent: 1, dir: -1 }] },

  // ---------------- World 3: Deep Space ----------------
  { world: 3, name: 'Double World', bodies: ['pluto', 'charon'], binary: [0, 1, 190] },
  { world: 3, name: 'Event Horizon', bodies: ['blackhole'] },
  { world: 3, name: 'Asteroid Belt', bodies: ['ceres'], rocks: 7 },
  { world: 3, name: 'Dark Companion', bodies: ['blackhole', 'mars'] },
  { world: 3, name: 'Kuiper Belt', bodies: ['pluto', 'charon'], binary: [0, 1, 170], rocks: 4 },
  { world: 3, name: 'Captured', bodies: ['blackhole'], moons: [{ key: 'triton', parent: 0, dir: 1 }] },
  { world: 3, name: 'Spaghettification', bodies: ['blackhole', 'rock', 'rock'], rocks: 3 },
  { world: 3, name: 'Wanderers', bodies: ['neptune', 'pluto', 'charon'], binary: [1, 2, 160] },
  { world: 3, name: 'Two Shadows', bodies: ['blackhole', 'blackhole'] },
  { world: 3, name: 'Graveyard', bodies: ['blackhole', 'earth'], moons: [{ key: 'moon', parent: 1, dir: 1 }], rocks: 2 },
  { world: 3, name: 'Photon Sphere', bodies: ['blackhole', 'uranus'], rocks: 4 },
  { world: 3, name: 'Edge of Everything', field: { w: 1240, h: 2200 }, bodies: ['blackhole', 'jupiter'], moons: [{ key: 'europa', parent: 1, dir: 1 }], rocks: 3 },
];
