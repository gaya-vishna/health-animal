// Goal direction helpers. Keep in step with server/lib/goal.js (CommonJS mirror).
export const MAINTAIN_BAND_KG = 1;

// 'lose' | 'gain' | 'maintain', from the start weight and the goal weight.
export function goalDirectionOf(startKg, goalKg) {
  const s = +startKg, g = +goalKg;
  if (!(s > 0 && g > 0)) return 'maintain';
  if (Math.abs(g - s) <= MAINTAIN_BAND_KG) return 'maintain';
  return g > s ? 'gain' : 'lose';
}

// Rescue number: room left (lose/maintain) or still to eat (gain)
export function remainingCals(dir, total, min, max) {
  return Math.max(0, Math.round((dir === 'gain' ? min : max) - total));
}

// "Too full" threshold: gainers get headroom
export function isOverComfort(dir, total, max) {
  return dir === 'gain' ? total > max * 1.25 : total > max;
}

// Rough daily protein guideline in grams (about 1.2 g per kg, 1.5 g per kg when gaining). Not medical advice.
export function proteinAutoTargetG(weightKg, dir) {
  const w = +weightKg > 0 ? +weightKg : 70;
  return Math.round(w * (dir === 'gain' ? 1.5 : 1.2));
}
