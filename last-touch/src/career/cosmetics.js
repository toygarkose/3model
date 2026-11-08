// Cosmetic items. Prices are in coins earned by playing — no real money.
// `unlock` = an achievement id that grants the item for free.
export const COSMETICS = {
  hair: [
    { id: 'short', name: 'Classic Short', price: 0 },
    { id: 'buzz', name: 'Buzz Cut', price: 0 },
    { id: 'curls', name: 'Curls', price: 90 },
    { id: 'mohawk', name: 'Mohawk', price: 140 },
    { id: 'bun', name: 'Top Knot', price: 180 },
    { id: 'long', name: 'Long & Tied', price: 220 },
  ],
  boots: [
    { id: 'black', name: 'Classic Black', color: 0x15161a, price: 0 },
    { id: 'volt', name: 'Volt', color: 0xd6ff3e, price: 70 },
    { id: 'crimson', name: 'Crimson', color: 0xe0423e, price: 70 },
    { id: 'ice', name: 'Ice White', color: 0xf4f7ff, price: 120 },
    { id: 'gold', name: 'Golden Boot', color: 0xffc23a, price: 0, unlock: 'champion' },
  ],
  kit: [
    { id: 'home', name: 'Home Teal', price: 0, kit: { shirt: 0x0f6e78, sleeve: 0x0b4f57, shorts: 0xf2f2ee, socks: 0x0f6e78, number: 0xffffff } },
    { id: 'away', name: 'Away Coral', price: 160, kit: { shirt: 0xff7a59, sleeve: 0x1a2240, shorts: 0x1a2240, socks: 0xff7a59, number: 0x1a2240 } },
    { id: 'night', name: 'Midnight', price: 260, kit: { shirt: 0x141a33, sleeve: 0xffb020, shorts: 0x141a33, socks: 0xffb020, number: 0xffb020 } },
  ],
  accessory: [
    { id: 'none', name: 'None', price: 0 },
    { id: 'wristbands', name: 'Wristbands', price: 40 },
    { id: 'headband', name: 'Headband', price: 60 },
    { id: 'armband', name: 'Captain Armband', price: 0, unlock: 'chapter2' },
  ],
};

export function findItem(slot, id) {
  return COSMETICS[slot].find(i => i.id === id) || COSMETICS[slot][0];
}
