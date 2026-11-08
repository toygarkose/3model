// Level 7 — break from deep with runners either side.
export default {
  id: 'counter', chapter: 2, title: 'The Counterattack',
  brief: 'They committed everyone forward. Now punish them.',
  objective: { type: 'goal', text: 'Finish the counterattack' },
  maxActions: 4, par: 3, style: 'corner',
  home: 'harbor', away: 'northgate',
  context: { score: [2, 2], clock: "84'" },
  hint: 'Long balls fly over defenders. Use the width.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [0, -2] },
    { id: 'joon', name: 'Joon Park', number: 10, pos: [-20, -10], runs: [[-22, -26], [-16, -38], [-12, -42]] },
    { id: 'malik', name: 'Malik Osei', number: 9, pos: [18, -9], runs: [[15, -26], [6, -40], [4, -44]] },
  ],
  opponents: [
    { id: 'd1', name: 'Pike', number: 2, pos: [-9, -15] },
    { id: 'd2', name: 'Dorn', number: 5, pos: [9, -14] },
    { id: 'd3', name: 'Cole', number: 4, pos: [0, -30] },
  ],
  keeper: { skill: 1.0 },
};
