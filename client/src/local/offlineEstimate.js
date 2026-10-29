// Offline calorie estimator for local mode, used when the home server (AI) can't be reached.
// A port of heuristicNutritionalEstimate in server/routes/ai.js - keep the two in step.

const UNIT_GRAMS = { piece: 50, slice: 40, bowl: 250, cup: 240, plate: 350, spoon: 15, handful: 30, portion: 200, scoop: 70, can: 330 };
const SIZE_MULT = { small: 0.75, regular: 1, large: 1.35 };
const UNIT_HE = { piece: 'יחידה', slice: 'פרוסה', bowl: 'קערה', cup: 'כוס', plate: 'צלחת', spoon: 'כף', handful: 'חופן', portion: 'מנה', scoop: 'כדור', can: 'פחית' };

const HE_NOTES = {
  'Red meat adds density (~15g fat).': 'בשר אדום מוסיף צפיפות קלורית (~15 גר׳ שומן).',
  'Heart-healthy omega-3 fats.': 'שומני אומגה 3 טובים ללב.',
  'Dressing or cheese adds fat density.': 'רוטב או גבינה מוסיפים שומן.',
  'Cheese and crust density.': 'הגבינה והבצק מעלים את הצפיפות הקלורית.',
  'Coconut cream 17% fat base.': 'שמנת קוקוס - בסיס של 17% שומן.',
  'Oils/dressings add caloric density.': 'שמן ורטבים מוסיפים קלוריות.',
  "Rough guess: this food isn't in my list, so please check the number.": 'ניחוש גס: המזון הזה לא ברשימה שלי, כדאי לבדוק את המספר.',
  'Nothing eaten, so 0 kcal.': 'לא נאכל כלום, ולכן 0 קלוריות.',
  "Couldn't recognise this as food. Try describing it in a few words.": 'לא זיהיתי את זה כאוכל. נסו לתאר במשפט קצר.',
  'Water has no calories.': 'למים אין קלוריות.',
  'Plain coffee/tea is nearly 0 kcal. Milk, cream and sugar are what add up.': 'קפה או תה רגילים הם כמעט 0 קלוריות. חלב, שמנת וסוכר הם מה שמצטבר.',
};
const heNote = (lang, en) => (lang === 'he' && HE_NOTES[en]) || en;
const plural = (n, word) => (n === 1 ? word : `${word}s`);

// Word matcher. English: whole words (optional plural s/es). Hebrew: not inside a longer Hebrew
// word (so "פיתה" does not contain "תה"), allowing one prefix letter (ה ב ל ו כ מ ש) and ים/ות.
const HL = 'א-ת';
function rx(en, he) {
  const parts = [];
  if (en) parts.push(`(?<![a-z])(?:${en})(?:s|es)?(?![a-z])`);
  if (he) parts.push(`(?<![${HL}])[הבלוכמש]?(?:${he})(?:ים|ות)?(?![${HL}])`);
  return new RegExp(parts.join('|'));
}

// kcal / prot are per 100 g. piece / slice / cup / bowl / spoon / plate = grams of one such unit.
// add: this is a topping that adds kcal on top of the main food (and is the food itself when alone).
// over: ids this row replaces when both match ("cottage cheese" is not generic cheese).
// drinkOk: does not count as a solid food for the coffee/tea branch.
const ROWS = [
  { id: 'cookie', re: rx('cookie|biscuit', 'עוגייה|עוגיה|עוגיית|עוגיות|ביסקוויט'), kcal: 480, prot: 5.5, piece: 30 },
  { id: 'cracker', re: rx('cracker', 'קרקר'), kcal: 440, prot: 7, piece: 10 },
  { id: 'cake', re: rx('cake|muffin|brownie', 'עוגה|מאפין'), kcal: 350, prot: 5, piece: 80, slice: 80, over: ['chocolate'] },
  { id: 'chocolate', re: rx('chocolate', 'שוקולד'), kcal: 540, prot: 6, piece: 10 },
  { id: 'croissant', re: rx('croissant', 'קרואסון|קראסון'), kcal: 406, prot: 8, piece: 60, over: ['chocolate'] },
  { id: 'granola', re: rx('granola|muesli', 'גרנולה|מוזלי'), kcal: 470, prot: 10, bowl: 60, cup: 100, piece: 60 },
  { id: 'pretzel', re: rx('pretzel|bagele|beigele', 'בייגלה'), kcal: 380, prot: 10, piece: 4, handful: 30 },
  { id: 'bamba', re: rx('bamba', 'במבה'), kcal: 540, prot: 15, piece: 25, handful: 25 },
  { id: 'bisli', re: rx('bisli', 'ביסלי'), kcal: 500, prot: 9, piece: 30, handful: 30 },
  { id: 'crisps', re: rx('potato chips|crisps', 'תפוצ.?יפס'), kcal: 536, prot: 7, piece: 28, handful: 28, over: ['fries'] },
  { id: 'pizzabagel', re: rx('pizza bagel', 'פיצה בייגל'), kcal: 270, prot: 11, piece: 110, over: ['pizza', 'bagel', 'cheese'], trap: 'Cheese and crust density.' },
  { id: 'bagel', re: rx('bagel', 'בייגל'), kcal: 270, prot: 10, piece: 100 },
  { id: 'toast', re: rx('cheese toast|toasted sandwich|grilled cheese', 'טוסט'), kcal: 270, prot: 12, piece: 130, over: ['bread', 'cheese', 'sandwich'] },
  { id: 'bun', re: rx('bun|bread roll|dinner roll', 'לחמניה|לחמנייה|בולקה'), kcal: 290, prot: 9, piece: 60 },
  { id: 'bread', re: rx('bread|toast', 'לחם|טוסט'), kcal: 265, prot: 9, piece: 30, slice: 30 },
  { id: 'banana', re: rx('banana', 'בננה'), kcal: 89, prot: 1.1, piece: 120 },
  { id: 'apple', re: rx('apple', 'תפוח'), kcal: 52, prot: 0.3, piece: 180 },
  { id: 'egg', re: rx('egg|omelet|omelette', 'ביצה|ביצ|חביתה'), kcal: 155, prot: 13, piece: 50 },
  { id: 'pizza', re: rx('pizza', 'פיצה'), kcal: 265, prot: 11, piece: 110, slice: 110, over: ['cheese'], trap: 'Cheese and crust density.' },
  { id: 'icecream', re: rx('ice cream|gelato', 'גלידה'), kcal: 207, prot: 3.5, piece: 70, scoop: 70, cup: 120, over: ['chocolate'] },
  { id: 'chicken', re: rx('chicken|turkey|poultry', 'עוף|הודו'), kcal: 165, prot: 24, piece: 120 },
  { id: 'wings', re: rx('wing|buffalo wing', 'כנפיים|כנפי|כנף'), kcal: 230, prot: 20, piece: 40, over: ['chicken'] },
  { id: 'beef', re: rx('beef', 'בקר'), kcal: 240, prot: 22, piece: 150, trap: 'Red meat adds density (~15g fat).' },
  { id: 'steak', re: rx('steak|entrecote', 'סטייק|סטק|אנטריקוט'), kcal: 250, prot: 26, piece: 200, over: ['beef'], trap: 'Red meat adds density (~15g fat).' },
  { id: 'burger', re: rx('burger|hamburger|cheeseburger', 'המבורגר|בורגר|צ.?יזבורגר'), kcal: 250, prot: 13, piece: 250, over: ['beef', 'bun', 'bread', 'cheese'], trap: 'Red meat adds density (~15g fat).' },
  { id: 'meatball', re: rx('meatball|kofta', 'קציצה|קציצ|קופתה'), kcal: 230, prot: 15, piece: 35, over: ['beef'], trap: 'Red meat adds density (~15g fat).' },
  { id: 'kebab', re: rx('kebab|kabab|kebap|kabob', 'קבב|קבאב'), kcal: 250, prot: 17, piece: 80, over: ['beef'], trap: 'Red meat adds density (~15g fat).' },
  { id: 'hotdog', re: rx('hot ?dog|frankfurter', 'נקניקיי?ה|נקניקיי?ות|נקניקיית'), kcal: 230, prot: 9, piece: 115, over: ['sausage', 'bun', 'bread'] },
  { id: 'sausage', re: rx('sausage|merguez', 'נקניק|קבנוס|מרגז'), kcal: 300, prot: 12, piece: 50 },
  { id: 'schnitzel', re: rx('schnitzel', 'שניצל'), kcal: 250, prot: 18, piece: 150 },
  { id: 'fish', re: rx('salmon|tuna|fish|shrimp|seafood', 'סלמון|טונה|דג|שרימפס'), kcal: 180, prot: 21, piece: 150, trap: 'Heart-healthy omega-3 fats.' },
  { id: 'sushi', re: rx('sushi', 'סושי'), kcal: 150, prot: 6, piece: 30 },
  { id: 'tofu', re: rx('tofu|edamame|tempeh', 'טופו'), kcal: 110, prot: 14, piece: 100 },
  { id: 'salad', re: rx('salad|lettuce|cucumber|greens|tomato|spinach', 'סלט|חסה|מלפפון|עגבניה|עגבנייה|עגבני|תרד'), kcal: 65, prot: 2.5 },
  { id: 'avocado', re: rx('avocado', 'אבוקדו'), kcal: 160, prot: 2, piece: 150 },
  { id: 'pasta', re: rx('pasta|noodle|spaghetti|ramen|lasagna', 'פסטה|ספגטי|אטריות|לזניה'), kcal: 160, prot: 6 },
  { id: 'bolognese', re: rx('bolognese|bolognaise', 'בולונז'), kcal: 170, prot: 9 },
  { id: 'rice', re: rx('rice|quinoa|couscous|pilaf|biryani', 'אורז|קינואה|קוסקוס'), kcal: 130, prot: 2.7, cup: 158 },
  { id: 'soup', re: rx('soup|broth|stew', 'מרק'), kcal: 80, prot: 5, piece: 250 },
  { id: 'lentil', re: rx('lentils?', 'עדשים|עדשה|עדשת'), kcal: 116, prot: 9, cup: 200 },
  { id: 'majadra', re: rx('m[ue]?jadd?ara|mejadra|majadra|mudardara', 'מג.?דרה|מגדרה|מוג.?דרה'), kcal: 150, prot: 5, bowl: 250, cup: 180, plate: 350, piece: 250 },
  { id: 'fruit', re: rx('smoothie|fruit|acai|berr(?:y|ie)|shake', 'שייק|פירות|פרי'), kcal: 75, prot: 2 },
  { id: 'sandwich', re: rx('sandwich|sub|wrap|burrito|tortilla', 'כריך|טורטיה|סנדוו?יצ.?|סנדביץ.?'), kcal: 230, prot: 11, piece: 200 },
  { id: 'shawarma', re: rx('shawarma|shawerma|shwarma', 'שווארמה|שוארמה|שאוורמה'), kcal: 200, prot: 12, piece: 320, over: ['pita', 'sandwich', 'chicken', 'beef'] },
  { id: 'pita', re: rx('pita', 'פיתה|פיתות'), kcal: 275, prot: 9, piece: 90 },
  { id: 'laffa', re: rx('laffa|lafa', 'לאפה|לאפות'), kcal: 275, prot: 9, piece: 140 },
  { id: 'burekas', re: rx('burekas|bourekas|borekas|burekes|boureka', 'בורקס'), kcal: 320, prot: 8, piece: 100, over: ['cheese', 'egg'] },
  { id: 'jachnun', re: rx('jachnun|jahnun|gachnun|jachnoon|jahnoon', 'ג.?חנון'), kcal: 330, prot: 6, piece: 200, over: ['egg'] },
  { id: 'malawach', re: rx('malawach|malawah|malawakh|malawax', 'מלאווח|מלוואח|מלאוואח'), kcal: 340, prot: 6, piece: 150, over: ['egg'] },
  { id: 'sabich', re: rx('sabich|sabih|sabikh|sabbich', 'סביח'), kcal: 200, prot: 8, piece: 350, over: ['egg', 'salad', 'tahini', 'amba', 'hummus', 'pita', 'laffa'] },
  { id: 'falafel', re: rx('falafel', 'פלאפל'), kcal: 333, prot: 13, piece: 17 },
  { id: 'hummus', re: rx('hummus|houmous', 'חומוס'), kcal: 166, prot: 8, bowl: 150, cup: 240 },
  { id: 'shakshuka', re: rx('shakshuka|shakshouka', 'שקשוקה'), kcal: 100, prot: 6, over: ['egg'] },
  { id: 'cottage', re: rx('cottage', 'קוטג'), kcal: 98, prot: 11, piece: 250, over: ['cheese'] },
  { id: 'yogurt', re: rx('yogurt|yoghurt', 'יוגורט'), kcal: 60, prot: 4, piece: 150, cup: 150 },
  { id: 'fries', re: rx('fries|french fries|chips', 'צ.?יפס'), kcal: 312, prot: 3.4, bowl: 150, piece: 130, portion: 130 },
  { id: 'nuts', re: rx('nuts?|almonds?|peanuts?|cashews?', 'אגוזים|שקדים|בוטנים|קשיו'), kcal: 600, prot: 20 },
  { id: 'cola', re: rx('cola|coke|pepsi', 'קולה'), kcal: 42, prot: 0, piece: 330, cup: 250, drinkOk: true },
  { id: 'juice', re: rx('juice', 'מיץ'), kcal: 45, prot: 0.7, piece: 250, cup: 250, drinkOk: true },
  { id: 'milk', re: rx('milk', 'חלב'), kcal: 50, prot: 3.4, cup: 240, drinkOk: true },
  { id: 'beer', re: rx('beer|lager', 'בירה'), kcal: 43, prot: 0.5, piece: 330, can: 330, cup: 250, drinkOk: true },
  { id: 'wine', re: rx('wine', 'יין'), kcal: 83, prot: 0.1, piece: 150, cup: 150, drinkOk: true },
  // toppings and fats: add kcal on top of a main food
  { id: 'cheese', re: rx('cheese|cheddar|parmesan|mozzarella|feta', 'גבינה|גבינת|גבינ'), kcal: 300, prot: 20, piece: 30, add: { kcal: 20, prot: 2 } },
  { id: 'oil', re: rx('olive oil|oil', 'שמן זית|שמן'), kcal: 884, prot: 0, spoon: 14, add: { kcal: 25, prot: 0 }, trap: 'Oils/dressings add caloric density.' },
  { id: 'butter', re: rx('butter', 'חמאה'), kcal: 717, prot: 0.9, spoon: 14, add: { kcal: 25, prot: 0 }, trap: 'Oils/dressings add caloric density.' },
  { id: 'dressing', re: rx('dressing', 'רוטב'), kcal: 300, prot: 1, spoon: 15, add: { kcal: 25, prot: 0 }, trap: 'Oils/dressings add caloric density.' },
  { id: 'mayo', re: rx('mayo|mayonnaise', 'מיונז'), kcal: 680, prot: 1, spoon: 15, top: { kcal: 100, prot: 0 }, trap: 'Oils/dressings add caloric density.' },
  { id: 'tahini', re: rx('tahini|tehina', 'טחינה|טחינ'), kcal: 595, prot: 17, spoon: 15, top: { kcal: 90, prot: 2.5 }, trap: 'Oils/dressings add caloric density.' },
  { id: 'ketchup', re: rx('ketchup|catsup', 'קטשופ|קטשוף'), kcal: 110, prot: 1.2, spoon: 17, top: { kcal: 17, prot: 0.2 } },
  { id: 'mustard', re: rx('mustard', 'חרדל'), kcal: 66, prot: 4, spoon: 10, top: { kcal: 6, prot: 0.4 } },
  { id: 'cabbage', re: rx('sauerkraut|cabbage', 'כרוב'), kcal: 25, prot: 1.3, top: { kcal: 6, prot: 0.3 } },
  { id: 'pickles', re: rx('pickles?|pickled|gherkin', 'חמוצים|חמוצ|מלפפון חמוץ|מלפפונים חמוצים'), kcal: 15, prot: 0.5, top: { kcal: 4, prot: 0.1 }, over: ['salad'] },
  { id: 'amba', re: rx('amba', 'עמבה'), kcal: 60, prot: 1, spoon: 15, top: { kcal: 10, prot: 0.2 } },
  { id: 'schug', re: rx('schug|zhug|skhug|s.?chug', 'סחוג|זחוג'), kcal: 150, prot: 2, spoon: 10, top: { kcal: 15, prot: 0.3 } },
  { id: 'friedonion', re: rx('fried onions?|crispy onions?', 'בצל מטוגן|בצל קריספי'), kcal: 400, prot: 4, top: { kcal: 45, prot: 0.5 }, over: ['fried'] },
  { id: 'cheeseslice', re: rx('cheese slice|sliced cheese|slice of cheese', 'פרוסת גבינה|גבינה פרוסה|גבינה צהובה'), kcal: 330, prot: 22, slice: 22, piece: 22, top: { kcal: 70, prot: 4.5 }, over: ['cheese'] },
  { id: 'fried', re: rx('fried', 'מטוגן'), add: { kcal: 25, prot: 0 }, addOnly: true, trap: 'Oils/dressings add caloric density.' },
  { id: 'coconut', re: rx('coconut cream', 'קרם קוקוס'), add: { kcal: 30, prot: 0 }, addOnly: true, trap: 'Coconut cream 17% fat base.' },
];
// Two foods that together are one known dish.
const HOTDOG_ROW = { id: 'hotdog', kcal: 230, prot: 9, piece: 115 };
const COMBOS = [
  { needs: ['falafel', 'pita'], row: { id: 'falafel_pita', kcal: 250, prot: 10, piece: 220 } },
  { needs: ['falafel', 'laffa'], row: { id: 'falafel_laffa', kcal: 245, prot: 10, piece: 350 } },
  { needs: ['shawarma', 'laffa'], row: { id: 'shawarma_laffa', kcal: 215, prot: 12, piece: 450, over: ['chicken', 'beef', 'sandwich'] } },
  { needs: ['sausage', 'bun'], row: HOTDOG_ROW },
  { needs: ['lentil', 'soup'], row: { id: 'lentil_soup', kcal: 70, prot: 4.5, piece: 250 } },
  { needs: ['chicken', 'soup'], row: { id: 'chicken_soup', kcal: 45, prot: 3.5, piece: 250 } },
];
// "2 scoops", "3 slices", "2 כדורים" typed into the name/description when no quantity was given.
const TEXT_QTY = [
  [/(\d+(?:\.\d+)?)\s*(?:scoops?|כדורים|כדור)/, 'scoop'],
  [/(\d+(?:\.\d+)?)\s*(?:slices?|פרוסות|פרוסה)/, 'slice'],
  [/(\d+(?:\.\d+)?)\s*(?:cans?|פחיות|פחית)/, 'can'],
  [/(\d+(?:\.\d+)?)\s*(?:cups?|glass(?:es)?|כוסות|כוס)/, 'cup'],
  [/(\d+(?:\.\d+)?)\s*(?:bowls?|קערות|קערה)/, 'bowl'],
  [/(\d+(?:\.\d+)?)\s*(?:plates?|צלחות|צלחת)/, 'plate'],
  [/(\d+(?:\.\d+)?)\s*(?:pieces?|units?|יחידות|יחידה)/, 'piece'],
];

const COFFEE_TEA = rx('coffee|espresso|americano|latte|cappuccino|nescafe|tea', 'קפה|אספרסו|תה|נס');
const WATER = rx('water', 'מים');
const NOTHING_EN = /(?:^|\W)(?:nothing|none|no food|didn'?t eat|did not eat|ate nothing|skipped|n\/a)(?:\W|$)/;
const NOTHING_HE = new RegExp(`(?<![${HL}])(?:כלום|לא אכלתי|שום דבר|לא אכלנו)(?![${HL}])`);
// Text that tries to give the estimator orders is cut off (offline has no AI to fool, but the
// leftover words must not count as food).
const stripOrders = (s) => s.replace(/\b(?:ignore|disregard|forget|override)\b[\s\S]*$/i, '').replace(/system prompt[\s\S]*$/i, '').replace(/התעלם[\s\S]*$/, '').trim();

function minMax(c) {
  const min = Math.max(0, Math.round(c * 0.9));
  const max = Math.max(Math.round(c * 1.1), min + 2);
  return { min, max };
}

export function offlineEstimate({ name = '', weightGram = null, description = '', lang = 'en', quantity = null, unit = null, size = 'regular' }) {
  const rawName = String(name ?? '').slice(0, 600).toLowerCase().trim();
  const rawDesc = String(description ?? '').slice(0, 600).toLowerCase().trim();
  const cleanName = stripOrders(rawName);
  const cleanDesc = stripOrders(rawDesc);
  const text = `${cleanName} ${cleanDesc}`.trim();
  const trimmedName = String(name ?? '').trim();
  const shownName = trimmedName.slice(0, 100);

  const zero = (note, items) => {
    const { min, max } = minMax(0);
    return {
      estimatedCalsMin: min,
      estimatedCalsMax: max,
      calories: 0,
      baseCalsPer100g: 0,
      proteinG: 0,
      proteinPer100g: 0,
      assumedGrams: 0,
      portionNote: null,
      detectedItems: items,
      hiddenTrapsNotes: heNote(lang, note),
      source: 'keyword_estimate',
      confidence: 'none',
    };
  };

  // "nothing eaten", or a name that was only an instruction
  const hadName = rawName.length > 0;
  if (hadName && (!cleanName || NOTHING_EN.test(cleanName) || NOTHING_HE.test(cleanName))) {
    return zero('Nothing eaten, so 0 kcal.', []);
  }

  // food hits
  let hits = ROWS.filter((r) => r.re.test(text));
  const ids = new Set(hits.map((h) => h.id));
  for (const c of COMBOS) {
    if (c.needs.every((id) => ids.has(id))) {
      hits = hits.filter((h) => !c.needs.includes(h.id));
      hits.push(c.row);
    }
  }
  const dropped = new Set(hits.flatMap((h) => h.over || []));
  hits = hits.filter((h) => !dropped.has(h.id));
  const mains = hits.filter((h) => !h.add && !h.top);
  const adds = hits.filter((h) => h.add || h.top);
  const solid = mains.some((h) => !h.drinkOk);
  const isDrink = COFFEE_TEA.test(text) && !solid;

  // plain water
  if (!hits.length && !isDrink && WATER.test(text)) {
    return { ...zero('Water has no calories.', shownName ? [shownName] : []), confidence: 'high' };
  }
  // gibberish: a long Latin word with no vowel structure
  if (!hits.length && !isDrink && hadName && /[a-z]*[bcdfghjklmnpqrstvwxz]{5,}[a-z]*/.test(cleanName)) {
    return zero("Couldn't recognise this as food. Try describing it in a few words.", []);
  }

  let weight = parseFloat(weightGram) > 0 ? parseFloat(weightGram) : 250;
  let portionNote = null;
  let q = parseFloat(quantity);
  let unitKey = unit;
  if (!(parseFloat(weightGram) > 0) && !(q > 0 && unitKey && UNIT_GRAMS[unitKey])) {
    for (const [re, u] of TEXT_QTY) {
      const m = text.match(re);
      if (m && parseFloat(m[1]) > 0) { q = parseFloat(m[1]); unitKey = u; break; }
    }
  }
  let fromQty = false;
  const unitGrams = (u) => {
    for (const h of mains) if (h[u]) return h[u];
    if (!mains.length) for (const h of adds) if (h[u]) return h[u];
    return UNIT_GRAMS[u];
  };
  if (!(parseFloat(weightGram) > 0) && q > 0 && unitKey && UNIT_GRAMS[unitKey]) {
    weight = Math.max(5, Math.round(q * unitGrams(unitKey) * (SIZE_MULT[size] || 1)));
    portionNote = lang === 'he' ? `${q} × ${UNIT_HE[unitKey]} ≈ ${weight} גר׳` : `${q} ${plural(q, unitKey)} ≈ ${weight}g`;
    fromQty = true;
  }
  // toppings are per serving; several servings share them a little (sqrt), not one full dose each
  const topScale = fromQty && q > 1 ? Math.sqrt(q) : 1;
  let topKcal = 0;
  let topProt = 0;

  const traps = [];
  let baseCals100 = 140;
  let protein100 = 8;
  let totalCalories;
  let totalProtein;
  let source = 'keyword_estimate';
  let confidence = 'high';

  if (isDrink) {
    const amount = (re) => { const m = text.match(re); return m ? parseFloat(m[1]) : 0; };
    let milkMl = amount(/(\d+(?:\.\d+)?)\s*ml\s*(?:\d+%\s*)?(?:milk|oat|soy|almond)/) || amount(/(?:milk|oat|soy|almond)[^\d]{0,10}(\d+(?:\.\d+)?)\s*ml/);
    if (!milkMl && (rx('milk', 'חלב').test(text))) milkMl = 60;
    if (!milkMl && rx('latte|cappuccino', 'לאטה|קפוצ.ינו').test(text)) milkMl = 150;
    const creamMl = amount(/(\d+(?:\.\d+)?)\s*ml\s*(?:cream|coconut cream)/);
    let sugarTsp = amount(/(\d+(?:\.\d+)?)\s*(?:tsp|teaspoons?)\s*(?:of\s*)?(?:sugar|honey)/);
    const sugarTbsp = amount(/(\d+(?:\.\d+)?)\s*(?:tbsp|tablespoons?)\s*(?:of\s*)?(?:sugar|honey)/);
    if (!sugarTsp && !sugarTbsp && /sugar|סוכר/.test(text) && !/\b(?:no|without|zero)\s+sugar|בלי סוכר/.test(text)) sugarTsp = 1;
    totalCalories = Math.round(2 + milkMl * 0.65 + creamMl * 3 + sugarTsp * 16 + sugarTbsp * 48);
    totalProtein = Math.round(milkMl * 0.033 + creamMl * 0.02);
    baseCals100 = (totalCalories / weight) * 100;
    protein100 = (totalProtein / weight) * 100;
    if (milkMl) traps.push(lang === 'he' ? `החלב (${milkMl} מ״ל) הוא מקור הקלוריות.` : `Milk (${milkMl}ml) is where the calories come from.`);
    else traps.push('Plain coffee/tea is nearly 0 kcal. Milk, cream and sugar are what add up.');
  } else if (hits.length && (mains.length || adds.some((h) => !h.addOnly))) {
    let parts = mains;
    let extraKcal = 0;
    let extraProt = 0;
    if (mains.length) {
      for (const a of adds) {
        if (a.add) { extraKcal += a.add.kcal; extraProt += a.add.prot; }
        if (a.top) { topKcal += a.top.kcal * topScale; topProt += a.top.prot * topScale; }
        if (a.trap && !traps.includes(a.trap)) traps.push(a.trap);
      }
      if (adds.some((a) => a.id === 'cheese') && !traps.includes('Dressing or cheese adds fat density.')) traps.push('Dressing or cheese adds fat density.');
    } else {
      parts = [adds.find((h) => !h.addOnly)];
    }
    baseCals100 = parts.reduce((s, h) => s + h.kcal, 0) / parts.length + extraKcal;
    protein100 = parts.reduce((s, h) => s + h.prot, 0) / parts.length + extraProt;
    if (parts.length >= 2) {
      protein100 = Math.min(protein100, 12);
      confidence = 'medium';
    }
    for (const h of parts) if (h.trap && !traps.includes(h.trap)) traps.push(h.trap);
    totalCalories = Math.round((weight / 100) * baseCals100 + topKcal);
    totalProtein = Math.round((weight / 100) * protein100 + topProt);
    if (topKcal) {
      baseCals100 = (totalCalories / weight) * 100;
      protein100 = (totalProtein / weight) * 100;
    }
  } else {
    totalCalories = Math.round((weight / 100) * baseCals100);
    totalProtein = Math.round((weight / 100) * protein100);
    source = 'generic_guess';
    confidence = 'low';
    traps.push("Rough guess: this food isn't in my list, so please check the number.");
  }

  const { min, max } = minMax(totalCalories);
  return {
    estimatedCalsMin: min,
    estimatedCalsMax: max,
    calories: totalCalories,
    baseCalsPer100g: Math.round(baseCals100 * 10) / 10,
    proteinG: totalProtein,
    proteinPer100g: Math.round(protein100 * 10) / 10,
    assumedGrams: Math.round(weight),
    portionNote,
    detectedItems: shownName ? [shownName] : ['Meal'],
    hiddenTrapsNotes: traps.length ? traps.map((x) => heNote(lang, x)).join(' ') : null,
    source,
    confidence,
  };
}
