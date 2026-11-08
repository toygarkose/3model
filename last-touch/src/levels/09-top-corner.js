// Level 9 — one touch, one shot, only the corners are open.
export default {
  id: 'top-corner', chapter: 3, title: 'Top Corner',
  brief: 'Edge of the box. Their keeper has not conceded in six games.',
  objective: { type: 'goal', text: 'Beat the keeper from the edge of the box' },
  maxActions: 2, par: 1, style: 'corner',
  home: 'harbor', away: 'kestrel',
  context: { score: [1, 1], clock: "88'" },
  hint: 'Swipe fast for power. Aim for the corners.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [9, -33] },
    { id: 'malik', name: 'Malik Osei', number: 9, pos: [-9, -39], runs: [[-6, -44]] },
  ],
  opponents: [
    { id: 'd1', name: 'Arden', number: 4, pos: [5, -38.5], speed: 6.6 },
    { id: 'd2', name: 'Silva', number: 5, pos: [1, -40], speed: 6.6 },
    { id: 'd3', name: 'Mbeki', number: 3, pos: [-6, -42], mark: 'malik', speed: 6.4 },
  ],
  keeper: { skill: 1.15 },
};
