// Level 10 — cup final, the whole team involved.
export default {
  id: 'final', chapter: 3, title: 'Final Whistle',
  brief: 'Coastal Cup final. Extra time. Everyone is exhausted except you.',
  objective: { type: 'goal', text: 'Win the cup' },
  maxActions: 4, par: 3, style: 'curve',
  home: 'harbor', away: 'kestrel',
  context: { score: [2, 2], clock: "119'" },
  hint: 'Build it patiently. One perfect move wins the cup.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [-8, -14] },
    { id: 'joon', name: 'Joon Park', number: 10, pos: [7, -17], runs: [[9, -25], [8, -31]] },
    { id: 'malik', name: 'Malik Osei', number: 9, pos: [-3, -30], runs: [[-5, -34], [-2, -42], [-1, -44]] },
    { id: 'luca', name: 'Luca Ferro', number: 11, pos: [-22, -24], runs: [[-20, -33], [-12, -41]] },
  ],
  opponents: [
    { id: 'd1', name: 'Haas', number: 6, pos: [0, -20], speed: 6.4 },
    { id: 'd2', name: 'Arden', number: 4, pos: [-6, -37], mark: 'malik', speed: 6.4 },
    { id: 'd3', name: 'Silva', number: 5, pos: [5, -37], speed: 6.4 },
    { id: 'd4', name: 'Mbeki', number: 3, pos: [-15, -31], speed: 6.2 },
    { id: 'd5', name: 'Rossi', number: 2, pos: [15, -30], speed: 6.2 },
  ],
  keeper: { skill: 1.1 },
};
