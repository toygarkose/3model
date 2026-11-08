// Level 4 — two passes and a finish.
export default {
  id: 'one-chance', chapter: 2, title: 'One Chance',
  brief: 'Your league debut. Keep it simple: pass, pass, finish.',
  objective: { type: 'goal', text: 'Two passes, then score' },
  maxActions: 3, par: 3, style: 'corner',
  home: 'harbor', away: 'marlow',
  context: { score: [0, 0], clock: "61'" },
  hint: 'Curve your pass around a defender by bending the line.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [-3, -6] },
    { id: 'joon', name: 'Joon Park', number: 10, pos: [-18, -14], runs: [[-20, -23], [-15, -31]] },
    { id: 'malik', name: 'Malik Osei', number: 9, pos: [9, -20], runs: [[7, -27], [3, -39]] },
  ],
  opponents: [
    { id: 'd1', name: 'Hale', number: 6, pos: [-9, -13] },
    { id: 'd2', name: 'Moss', number: 4, pos: [4, -15] },
    { id: 'd3', name: 'Kerr', number: 5, pos: [-1, -28] },
    { id: 'd4', name: 'Vance', number: 3, pos: [9, -34], mark: 'malik' },
  ],
  keeper: { skill: 0.95 },
};
