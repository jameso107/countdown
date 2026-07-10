// Pure Yahtzee scoring — no imports, identical results on both clients.

export const CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance',
];

export const LABELS = {
  ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
  threeKind: '3 of a Kind', fourKind: '4 of a Kind', fullHouse: 'Full House',
  smallStraight: 'Sm. Straight', largeStraight: 'Lg. Straight', yahtzee: 'YAHTZEE', chance: 'Chance',
};

export const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

export function emptyCard() {
  return Object.fromEntries(CATEGORIES.map((c) => [c, null]));
}

const sum = (dice) => dice.reduce((a, b) => a + b, 0);

function counts(dice) {
  const n = [0, 0, 0, 0, 0, 0, 0]; // index by pip value 1..6
  for (const d of dice) n[d]++;
  return n;
}

function longestRun(dice) {
  const has = new Set(dice);
  let best = 0;
  for (let v = 1; v <= 6; v++) {
    let run = 0;
    while (has.has(v + run)) run++;
    best = Math.max(best, run);
  }
  return best;
}

export function scoreCategory(cat, dice) {
  const n = counts(dice);
  const upperIdx = UPPER.indexOf(cat);
  if (upperIdx >= 0) {
    const pip = upperIdx + 1;
    return n[pip] * pip;
  }
  switch (cat) {
    case 'threeKind': return n.some((c) => c >= 3) ? sum(dice) : 0;
    case 'fourKind': return n.some((c) => c >= 4) ? sum(dice) : 0;
    case 'fullHouse': return n.includes(3) && n.includes(2) ? 25 : 0;
    case 'smallStraight': return longestRun(dice) >= 4 ? 30 : 0;
    case 'largeStraight': return longestRun(dice) >= 5 ? 40 : 0;
    case 'yahtzee': return n.some((c) => c === 5) ? 50 : 0;
    case 'chance': return sum(dice);
    default: return 0;
  }
}

export function totals(card) {
  const upper = UPPER.reduce((a, c) => a + (card[c] ?? 0), 0);
  const bonus = upper >= 63 ? 35 : 0;
  const lower = CATEGORIES.filter((c) => !UPPER.includes(c))
    .reduce((a, c) => a + (card[c] ?? 0), 0);
  return { upper, bonus, lower, grand: upper + bonus + lower };
}

export function cardFull(card) {
  return CATEGORIES.every((c) => card[c] !== null);
}
