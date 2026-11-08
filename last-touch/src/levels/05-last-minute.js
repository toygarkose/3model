// Level 5 — losing late, three moves to save the game.
export default {
  id: 'last-minute', chapter: 2, title: 'Last Minute',
  brief: 'One down against Ironvale. The board shows one minute added.',
  objective: { type: 'goal', text: 'Score before the final whistle' },
  maxActions: 3, par: 2, style: 'corner',
  home: 'harbor', away: 'ironvale',
  context: { score: [1, 2], clock: "90+1'", clockMode: 'countdown' },
  hint: 'Three moves left. Make them count.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [16, -21] },
    { id: 'malik', name: 'Malik Osei', number: 9, pos: [-3, -29], runs: [[-6, -39]] },
    { id: 'joon', name: 'Joon Park', number: 10, pos: [3, -17], runs: [[1, -31]] },
  ],
  opponents: [
    { id: 'd1', name: 'Brask', number: 5, pos: [8, -28] },
    { id: 'd2', name: 'Okafor', number: 4, pos: [-2, -35], mark: 'malik' },
    { id: 'd3', name: 'Lund', number: 6, pos: [6, -39] },
    { id: 'd4', name: 'Reyes', number: 8, pos: [12, -22], speed: 6.4 },
  ],
  keeper: { skill: 1.0 },
};
