// Level 3 — a lofted cross into the gap and a header.
export default {
  id: 'cross', chapter: 1, title: 'The Perfect Cross',
  brief: 'Last game of the trial. Get to the byline and whip it in.',
  objective: { type: 'goal', text: 'Cross it in and score' },
  maxActions: 2, par: 2, style: 'header',
  home: 'harborYouth', away: 'trial',
  context: { score: [1, 1], clock: "78'" },
  hint: 'Long passes fly. Cross to Malik between the defenders, then swipe a header at goal.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [28, -46] },
    { id: 'malik', name: 'Malik Osei', number: 9, pos: [4, -35], runs: [[0, -43]] },
    { id: 'luca', name: 'Luca Ferro', number: 11, pos: [-8, -32], runs: [[-9, -39]] },
  ],
  opponents: [
    { id: 'd1', name: 'Trialist', number: 4, pos: [9, -38] },
    { id: 'd2', name: 'Trialist', number: 5, pos: [-8, -44] },
    { id: 'd3', name: 'Trialist', number: 2, pos: [23, -44] },
  ],
  keeper: { skill: 0.85 },
};
