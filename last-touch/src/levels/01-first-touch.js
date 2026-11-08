// Level 1 — a calm first pass to learn the gesture.
export default {
  id: 'first-touch', chapter: 1, title: 'The First Touch',
  brief: 'Trial day at Harbor Town. The coach is watching. Find your teammate.',
  objective: { type: 'pass', count: 1, text: 'Pass to Dario' },
  maxActions: 2, par: 1, style: 'perfect',
  home: 'harborYouth', away: 'trial',
  context: { score: [0, 0], clock: "12'" },
  hint: 'Touch the ball and draw a line to Dario.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [0, -14] },
    { id: 'dario', name: 'Dario Pell', number: 9, pos: [-9, -24], runs: [[-10, -27]] },
    { id: 'theo', name: 'Theo Brandt', number: 7, pos: [13, -20] },
  ],
  opponents: [
    { id: 'd1', name: 'Trialist', number: 4, pos: [5, -23] },
    { id: 'd2', name: 'Trialist', number: 5, pos: [-2, -31] },
  ],
  keeper: { skill: 0.8 },
};
