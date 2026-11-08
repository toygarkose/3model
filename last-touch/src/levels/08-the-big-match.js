// Level 8 — crowded box, quick combination.
export default {
  id: 'big-match', chapter: 3, title: 'The Big Match',
  brief: 'Royal Kestrel at home. Scouts from three countries are here.',
  objective: { type: 'goal', text: 'Unlock the Kestrel defence' },
  maxActions: 3, par: 2, style: 'corner',
  home: 'harbor', away: 'kestrel',
  context: { score: [0, 0], clock: "71'" },
  hint: 'Kestrel defenders are quick. Pass into space, not into feet.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [0, -24] },
    { id: 'malik', name: 'Malik Osei', number: 9, pos: [-6, -33], runs: [[-9, -41]] },
    { id: 'joon', name: 'Joon Park', number: 10, pos: [12, -29], runs: [[11, -38]] },
    { id: 'luca', name: 'Luca Ferro', number: 11, pos: [-16, -26], runs: [[-15, -35]] },
  ],
  opponents: [
    { id: 'd1', name: 'Arden', number: 4, pos: [-4, -36], mark: 'malik', speed: 6.6 },
    { id: 'd2', name: 'Silva', number: 5, pos: [6, -35], speed: 6.6 },
    { id: 'd3', name: 'Mbeki', number: 3, pos: [-12, -35], speed: 6.4 },
    { id: 'd4', name: 'Rossi', number: 2, pos: [14, -37], speed: 6.4 },
    { id: 'd5', name: 'Haas', number: 6, pos: [2, -28], speed: 6.6 },
  ],
  keeper: { skill: 1.1 },
};
