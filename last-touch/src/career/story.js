// Career story beats. Shown as short cinematic headline cards.
export const CHAPTERS = [
  { id: 1, name: 'Chapter 1', title: 'The Kid From The Harbor', club: 'Harbor Town U19', levels: [1, 2, 3] },
  { id: 2, name: 'Chapter 2', title: 'First Team', club: 'Harbor Town FC', levels: [4, 5, 6, 7] },
  { id: 3, name: 'Chapter 3', title: 'The Big Stage', club: 'Harbor Town FC', levels: [8, 9, 10] },
];

// `{name}` is replaced by the player's name.
export const STORY = {
  intro: [
    { kicker: 'HARBOR TOWN', headline: 'One pitch. One floodlight. One dream.', body: 'A fishing town on the edge of the map, where football is the only thing that never closes.' },
    { kicker: 'EVERY SATURDAY', headline: '{name} stays after everyone leaves.', body: 'Curling ball after ball into the same rusty goal until the lights go out.' },
    { kicker: 'TODAY', headline: 'Trial day at Harbor Town FC.', body: 'Three chances to impress the coach. Make every touch count.' },
  ],
  afterLevel: {
    3: { paper: 'THE HARBOR GAZETTE', headline: 'LOCAL TEEN SIGNS FIRST CONTRACT', body: '{name} joins Harbor Town FC after a stunning trial. "I just want to play," says the club\'s newest signing.', milestone: 'Signed by Harbor Town FC' },
    7: { paper: 'COASTAL SPORT', headline: '{name}: HARBOR\'S NEW HERO', body: 'A late winner, a curling free kick and a counterattack goal. The whole league is talking about Harbor Town\'s number {number}.', milestone: 'First-team regular' },
    10: { paper: 'WORLD FOOTBALL WEEKLY', headline: 'CUP KINGS! {name} STUNS KESTREL', body: 'From the harbor to the cup final. Scouts from the biggest clubs in the world have a new name on their list.', milestone: 'Coastal Cup winner', season: 'Season 2: The Transfer — coming soon' },
  },
};

export function fill(text, career) {
  return text.replaceAll('{name}', career.name.toUpperCase()).replaceAll('{number}', String(career.number));
}
