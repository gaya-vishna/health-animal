// Offline calorie estimator for local mode, used when the home server (AI) can't be reached.
// A port of heuristicNutritionalEstimate in server/routes/ai.js - keep the two in step.

const UNIT_GRAMS = { piece: 50, slice: 40, bowl: 250, cup: 240, plate: 350, spoon: 15, handful: 30 };
const SIZE_MULT = { small: 0.7, regular: 1, large: 1.4 };
const UNIT_HE = { piece: 'יחידה', slice: 'פרוסה', bowl: 'קערה', cup: 'כוס', plate: 'צלחת', spoon: 'כף', handful: 'חופן' };
const FOODS = [
  { re: /cookie|cookies|עוגיית|עוגיות/, kcal: 480, prot: 5.5, piece: 30 },
  { re: /biscuit|cracker|ביסקוויט|קרקר/, kcal: 440, prot: 7, piece: 10 },
  { re: /cake|עוגה/, kcal: 350, prot: 5, piece: 80, slice: 80 },
  { re: /chocolate|שוקולד/, kcal: 540, prot: 6, piece: 10 },
  { re: /bagel|בייגל/, kcal: 270, prot: 10, piece: 100 },
  { re: /bread|toast|לחם|טוסט/, kcal: 265, prot: 9, piece: 30, slice: 30 },
  { re: /banana|בננה/, kcal: 89, prot: 1.1, piece: 120 },
  { re: /apple|תפוח/, kcal: 52, prot: 0.3, piece: 180 },
  { re: /egg|ביצה|ביצים/, kcal: 155, prot: 13, piece: 50 },
  { re: /pizza|פיצה/, kcal: 265, prot: 11, slice: 110, piece: 110 },
  { re: /ice cream|גלידה/, kcal: 207, prot: 3.5, piece: 70 },
];
const HE_NOTES = {
  'Red meat adds density (~15g fat).': 'בשר אדום מוסיף צפיפות קלורית (~15 גר׳ שומן).',
  'Heart-healthy omega-3 fats.': 'שומני אומגה 3 טובים ללב.',
  'Dressing or cheese adds fat density.': 'רוטב או גבינה מוסיפים שומן.',
  'Cheese and crust density.': 'הגבינה והבצק מעלים את הצפיפות הקלורית.',
  'Coconut cream 17% fat base.': 'שמנת קוקוס - בסיס של 17% שומן.',
  'Oils/dressings add caloric density.': 'שמן ורטבים מוסיפים קלוריות.',
  'Rough generic guess (AI unavailable), so treat this as approximate.': 'הערכה כללית בלבד (ה-AI לא זמין), יש להתייחס אליה כמקורבת.',
  'Plain coffee/tea is nearly 0 kcal. Milk, cream and sugar are what add up.': 'קפה או תה רגילים הם כמעט 0 קלוריות. חלב, שמנת וסוכר הם מה שמצטבר.',
};
const heNote = (lang, en) => (lang === 'he' && HE_NOTES[en]) || en;
const plural = (n, word) => (n === 1 ? word : `${word}s`);

export function offlineEstimate({ name = '', weightGram = null, description = '', lang = 'en', quantity = null, unit = null, size = 'regular' }) {
  const text = `${name} ${description}`.toLowerCase();
  const food = FOODS.find((f) => f.re.test(text));
  let weight = parseFloat(weightGram) > 0 ? parseFloat(weightGram) : 250;
  let portionNote = null;
  const q = parseFloat(quantity);
  if (!(parseFloat(weightGram) > 0) && q > 0 && unit && UNIT_GRAMS[unit]) {
    let per = UNIT_GRAMS[unit];
    if (food && unit === 'piece' && food.piece) per = food.piece;
    if (food && unit === 'slice' && food.slice) per = food.slice;
    weight = Math.max(5, Math.round(q * per * (SIZE_MULT[size] || 1)));
    portionNote = lang === 'he' ? `${q} × ${UNIT_HE[unit]} ≈ ${weight} גר׳` : `${q} ${plural(q, unit)} ≈ ${weight}g`;
  }

  let baseCals100 = 140;
  let protein100 = 8;
  const traps = [];

  if (/chicken|turkey|poultry|breast|עוף|הודו/i.test(text)) {
    baseCals100 = 165; protein100 = 24;
  } else if (/beef|steak|burger|meatball|בקר|סטייק|המבורגר|קציצ/i.test(text)) {
    baseCals100 = 240; protein100 = 22; traps.push('Red meat adds density (~15g fat).');
  } else if (/salmon|tuna|fish|shrimp|seafood|סלמון|טונה|דג/i.test(text)) {
    baseCals100 = 180; protein100 = 21; traps.push('Heart-healthy omega-3 fats.');
  } else if (/tofu|edamame|tempeh|טופו/i.test(text)) {
    baseCals100 = 110; protein100 = 14;
  } else if (/egg|omelet|omelette|ביצ|חביתה/i.test(text)) {
    baseCals100 = 155; protein100 = 13;
  }

  if (/salad|lettuce|cucumber|greens|tomato|spinach|סלט|חסה|מלפפון|עגבני/i.test(text) && !/chicken|steak|salmon|cheese|עוף|גבינ/i.test(text)) {
    baseCals100 = 65; protein100 = 2.5;
  } else if (/salad|סלט/i.test(text) && /caesar|dressing|mayo|tahini|cheese|parmesan|רוטב|מיונז|טחינה|גבינ/i.test(text)) {
    baseCals100 = 135; protein100 = 7; traps.push('Dressing or cheese adds fat density.');
  } else if (/pizza|פיצה/i.test(text)) {
    baseCals100 = 265; protein100 = 11; traps.push('Cheese and crust density.');
  } else if (/pasta|noodle|spaghetti|ramen|פסטה|ספגטי|אטריות/i.test(text)) {
    baseCals100 = 160; protein100 = 6;
  } else if (/rice|quinoa|grain|biryani|pilaf|אורז|קינואה/i.test(text)) {
    baseCals100 = 145; protein100 = 4;
  } else if (/soup|broth|stew|מרק/i.test(text)) {
    baseCals100 = 80; protein100 = 5;
  } else if (/smoothie|fruit|acai|berries|שייק|פירות/i.test(text)) {
    baseCals100 = 75; protein100 = 2;
  } else if (/sandwich|wrap|pita|shawarma|burrito|כריך|טורטיה|פיתה|שווארמה/i.test(text)) {
    baseCals100 = 210; protein100 = 12;
  }

  if (/coconut cream|קרם קוקוס/i.test(text)) { baseCals100 += 30; traps.push('Coconut cream 17% fat base.'); }
  if (/mayo|dressing|olive oil|butter|fried|tahini|מיונז|שמן|חמאה|מטוגן|טחינה/i.test(text)) { baseCals100 += 25; traps.push('Oils/dressings add caloric density.'); }
  if (/cheese|cheddar|parmesan|mozzarella|feta|גבינ/i.test(text)) { baseCals100 += 20; protein100 += 2; }

  if (baseCals100 === 140 && protein100 === 8 && food) {
    baseCals100 = food.kcal;
    protein100 = food.prot;
  }
  let totalCalories = Math.round((weight / 100) * baseCals100);
  let totalProtein = Math.round((weight / 100) * protein100);
  let matched = baseCals100 !== 140 || protein100 !== 8;

  if (/coff|espresso|americano|latte|cappuccino|\btea\b|\bwater\b|\bice\b|קפה|תה|מים/.test(text)) {
    const amount = (re) => { const m = text.match(re); return m ? parseFloat(m[1]) : 0; };
    const milkMl = amount(/(\d+(?:\.\d+)?)\s*ml\s*(?:\d+%\s*)?(?:milk|oat|soy|almond)/) || amount(/(?:milk|oat|soy|almond)[^\d]{0,10}(\d+(?:\.\d+)?)\s*ml/);
    const creamMl = amount(/(\d+(?:\.\d+)?)\s*ml\s*(?:cream|coconut cream)/);
    const sugarTsp = amount(/(\d+(?:\.\d+)?)\s*(?:tsp|teaspoons?)\s*(?:of\s*)?(?:sugar|honey)/);
    const sugarTbsp = amount(/(\d+(?:\.\d+)?)\s*(?:tbsp|tablespoons?)\s*(?:of\s*)?(?:sugar|honey)/);
    totalCalories = Math.round(5 + milkMl * 0.65 + creamMl * 3 + sugarTsp * 16 + sugarTbsp * 48);
    totalProtein = Math.round(milkMl * 0.033 + creamMl * 0.02);
    baseCals100 = (totalCalories / weight) * 100;
    protein100 = (totalProtein / weight) * 100;
    matched = true;
    if (milkMl) traps.push(lang === 'he' ? `החלב (${milkMl} מ״ל) הוא מקור הקלוריות.` : `Milk (${milkMl}ml) is where the calories come from.`);
    else traps.push('Plain coffee/tea is nearly 0 kcal. Milk, cream and sugar are what add up.');
  }

  return {
    estimatedCalsMin: Math.max(50, Math.round(totalCalories * 0.9)),
    estimatedCalsMax: Math.round(totalCalories * 1.1),
    calories: totalCalories,
    baseCalsPer100g: Math.round(baseCals100 * 10) / 10,
    proteinG: totalProtein,
    proteinPer100g: Math.round(protein100 * 10) / 10,
    assumedGrams: Math.round(weight),
    portionNote,
    detectedItems: name ? [name] : ['Meal'],
    hiddenTrapsNotes: (traps.length > 0 ? traps : ['Rough generic guess (AI unavailable), so treat this as approximate.']).map((x) => heNote(lang, x)).join(' '),
    source: matched ? 'keyword_estimate' : 'generic_guess',
  };
}
