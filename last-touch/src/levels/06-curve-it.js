// Level 6 — free kick around the wall.
// Wall is 9.15 m from the ball on the line to the goal centre.
export default {
  id: 'curve-it', chapter: 2, title: 'Curve It',
  brief: 'Free kick, 23 metres out. The wall covers the near post.',
  objective: { type: 'goal', text: 'Bend the free kick past the wall' },
  maxActions: 1, par: 1, style: 'curve',
  home: 'harbor', away: 'ironvale',
  context: { score: [0, 0], clock: "55'" },
  hint: 'Draw a curved line around the wall into the far side of the goal.',
  team: [
    { id: 'hero', hero: true, ball: true, pos: [-5, -30] },
    { id: 'malik', name: 'Malik Osei', number: 9, pos: [6, -41] },
    { id: 'joon', name: 'Joon Park', number: 10, pos: [-12, -40] },
  ],
  opponents: [
    { id: 'w1', type: 'wall', name: 'Wall', number: 2, pos: [-3.96, -39.15] },
    { id: 'w2', type: 'wall', name: 'Wall', number: 5, pos: [-3.33, -39.01] },
    { id: 'w3', type: 'wall', name: 'Wall', number: 6, pos: [-2.69, -38.87] },
    { id: 'w4', type: 'wall', name: 'Wall', number: 8, pos: [-2.06, -38.73] },
    { id: 'd1', name: 'Brask', number: 4, pos: [5, -43], mark: 'malik' },
  ],
  keeper: { skill: 1.0 },
};
