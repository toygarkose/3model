// Fictional leagues and clubs. Strength 40..95 drives match simulation and
// how good their goalkeepers/defenders are in your moments.
export const LEAGUES = [
  { tier: 4, name: 'County League', wage: [120, 300] },
  { tier: 3, name: 'National Division', wage: [400, 1200] },
  { tier: 2, name: 'Championship Union', wage: [2000, 7000] },
  { tier: 1, name: 'Elite League', wage: [15000, 60000] },
];

const C = (name, short, a, b, str) => ({ name, short, colors: [a, b], str });
export const CLUBS = {
  4: [
    C('Millbrook Town', 'MIL', '#2f7d4f', '#f4f1e6', 44), C('Harbor Rovers', 'HAR', '#1f5aa8', '#ffffff', 47),
    C('Oakfield Athletic', 'OAK', '#b3262e', '#ffffff', 50), C('Stonebridge FC', 'STO', '#4a4a4a', '#f2c230', 42),
    C('Westmere United', 'WES', '#6b2f8f', '#ffffff', 46), C('Fenwick Wanderers', 'FEN', '#e07a1f', '#1a1a1a', 49),
    C('Ashby Vale', 'ASH', '#0f6e78', '#ffffff', 45), C('Corby Lane', 'COR', '#c9c9c9', '#1d3f8f', 41),
  ],
  3: [
    C('Kingsport City', 'KIN', '#1d3f8f', '#ffffff', 58), C('Redcastle', 'RED', '#c0242b', '#ffffff', 61),
    C('Northam Forest', 'NOR', '#1e6b3a', '#ffffff', 56), C('Brayton Albion', 'BRA', '#f2c230', '#1d3f8f', 59),
    C('Silverton', 'SIL', '#9aa3ad', '#111111', 54), C('Eastgate Rangers', 'EAS', '#0b4f8f', '#e8d24a', 57),
    C('Port Morrow', 'POR', '#7a1f3d', '#7fc5e8', 55), C('Lindale Town', 'LIN', '#ff8a2a', '#111111', 53),
  ],
  2: [
    C('Rivermouth', 'RIV', '#e8e8e8', '#c0242b', 68), C('Castleford United', 'CAS', '#c0242b', '#1a1a1a', 71),
    C('Bridgewater', 'BRI', '#2b59c3', '#ffffff', 69), C('Highmoor', 'HIG', '#3c8d3c', '#f2c230', 66),
    C('Valemont', 'VAL', '#5b2a86', '#f2c230', 72), C('Ironbury', 'IRO', '#333b47', '#ff6a2a', 67),
    C('Saltford City', 'SAL', '#2aa7c9', '#ffffff', 65), C('Grantham Park', 'GRA', '#8f1f1f', '#d9b36a', 70),
  ],
  1: [
    C('Real Montverde', 'RMV', '#ffffff', '#c9a227', 90), C('Atletico Solano', 'ASO', '#c0242b', '#ffffff', 86),
    C('Inter Valloria', 'IVA', '#1b2a7a', '#111111', 87), C('Kaiser Union', 'KAU', '#d4142a', '#ffffff', 85),
    C('Olympique Lumen', 'OLU', '#3a7bd5', '#ffffff', 82), C('Sporting Aurelia', 'SPA', '#0e7a3e', '#ffffff', 81),
    C('Dynamo Kestrel', 'DYK', '#0b3d91', '#ffffff', 83), C('City of Albury', 'CAL', '#7fc5e8', '#ffffff', 88),
  ],
};

export const FIRST_NAMES = ['Jamie', 'Leo', 'Marco', 'Ryo', 'Theo', 'Sami', 'Diego', 'Ade', 'Luca', 'Kai', 'Noah', 'Ibrahim', 'Mateo', 'Joon', 'Viktor', 'Emre'];
export const LAST_NAMES = ['Carter', 'Silva', 'Okafor', 'Novak', 'Haddad', 'Moreau', 'Kowalski', 'Tanaka', 'Rossi', 'Mensah', 'Berg', 'Duarte', 'Yilmaz', 'Brennan', 'Park', 'Adeyemi'];


// Nations for international call-ups (country names only).
export const NATIONS = ['Türkiye', 'England', 'Brazil', 'Argentina', 'Spain', 'France', 'Germany', 'Italy', 'Portugal', 'Netherlands', 'Belgium', 'Croatia', 'Morocco', 'Senegal', 'Nigeria', 'Ghana', 'Egypt', 'Japan', 'South Korea', 'USA', 'Mexico', 'Colombia', 'Uruguay', 'Poland', 'Sweden', 'Norway', 'Denmark', 'Scotland', 'Wales', 'Ireland', 'Australia', 'Canada'];

// Fictional sponsors.
export const SPONSORS = [
  { name: 'Kickline Boots', base: 0.25 }, { name: 'Volta Energy', base: 0.3 }, { name: 'Harbor Bank', base: 0.35 },
  { name: 'Orbit Mobile', base: 0.4 }, { name: 'NovaFit Wear', base: 0.3 }, { name: 'Crestline Watches', base: 0.55 },
  { name: 'Fizzwell Cola', base: 0.45 }, { name: 'Strata Motors', base: 0.7 },
];

export const CUPS = { 4: 'County Cup', 3: 'National Shield', 2: 'Union Trophy', 1: 'Elite Champions Cup' };
export const PARTNER_NAMES = ['Alex', 'Sam', 'Robin', 'Jordan', 'Charlie', 'Elif', 'Deniz', 'Maya', 'Noa', 'Kim', 'Luca', 'Ari'];
