// Level 2 — a through ball behind the line, then finish.
export default {
  id: 'through', chapter: 1, title: 'Through the Defence',
  brief: 'Malik is already running. Slide it into the space behind them.',
  objective: { type: 'goal', text: 'Find Malik behind the defence and score' },
  maxActions: 3, par: 2, style: 'corner',
  home: 'harborYouth', away: 'trial',
  context: { score: [0, 0], clock: "37'" },
  hint: 'Draw the pass into the space ahead of Malik, not at his feet.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [-2, -18] },
    { id: 'malik', name: 'Malik Osei', number: 9, pos: [8, -29], runs: [[5, -40]] },
    { id: 'joon', name: 'Joon Park', number: 10, pos: [-14, -25], runs: [[-13, -31]] },
  ],
  opponents: [
    { id: 'd1', name: 'Trialist', number: 4, pos: [1, -31] },
    { id: 'd2', name: 'Trialist', number: 5, pos: [10, -32], mark: 'malik' },
  ],
  keeper: { skill: 0.85 },
};
