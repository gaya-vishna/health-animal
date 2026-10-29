const express = require('express');
const V = require('../lib/validate');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();

const aiKey = process.env.GEMINI_API_KEY;
// Prompts and model list are shared with the phone's own-key mode (ESM, so loaded lazily).
const P = import('../../shared/aiPrompts.mjs');
// The phone's offline estimator is plain ESM with no imports, so the server reuses it as its fallback
// (the Dockerfile copies that one file next to the built client). If it can't be loaded, the older
// heuristic below is used with the same range rules.
const clientOffline = import('../../client/src/local/offlineEstimate.js').then((m) => m.offlineEstimate).catch(() => null);
async function offlineFallback(input) {
  const fn = await clientOffline;
  const r = fn ? fn(input) : heuristicNutritionalEstimate(input);
  const min = Math.max(0, Math.round(r.estimatedCalsMin) || 0);
  return { ...r, estimatedCalsMin: min, estimatedCalsMax: Math.max(Math.round(r.estimatedCalsMax) || 0, min + 2) };
}
const isRealKey = (k) => !!k && k.length > 20 && !/^your_/i.test(k);
// Tries each model in turn; overload/quota/retired-model errors move on to the next one.
async function generateWithRetry(request) {
  let lastErr;
  const models = [process.env.GEMINI_MODEL, ...(await P).GEMINI_MODELS].filter(Boolean);
  for (const model of models) {
    try {
      return await ai.models.generateContent({ ...request, model });
    } catch (err) {
      lastErr = err;
      if (!/503|UNAVAILABLE|429|404|NOT_FOUND/.test(String(err.message))) throw err;
    }
  }
  throw lastErr;
}
const isGeminiConfigured = isRealKey(aiKey);
const ai = isGeminiConfigured ? new GoogleGenAI({ apiKey: aiKey }) : null;

// Hebrew versions of the offline estimator's notes
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

// --- Natural portions: people say "1 cookie" or "a bowl", not grams ---------------------------
const UNIT_GRAMS = { piece: 50, slice: 40, bowl: 250, cup: 240, plate: 350, spoon: 15, handful: 30 };
const SIZE_MULT = { small: 0.7, regular: 1, large: 1.4 };
const UNIT_HE = { piece: 'יחידה', slice: 'פרוסה', bowl: 'קערה', cup: 'כוס', plate: 'צלחת', spoon: 'כף', handful: 'חופן' };
// Typical foods the offline estimator knows: density per 100g and the size of one piece / slice.
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
const plural = (n, word) => (n === 1 ? word : `${word}s`);

// Built-in culinary nutrition heuristic engine (reliable fallback)
function heuristicNutritionalEstimate({ name = '', weightGram = null, description = '', lang = 'en', quantity = null, unit = null, size = 'regular' }) {
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

  let baseCals100 = 140; // Default balanced meal kcal/100g
  let protein100 = 8;    // Default protein g/100g
  const traps = [];

  // Protein checks
  if (/chicken|turkey|poultry|breast/i.test(text)) {
    baseCals100 = 165;
    protein100 = 24;
  } else if (/beef|steak|burger|meatball/i.test(text)) {
    baseCals100 = 240;
    protein100 = 22;
    traps.push('Red meat adds density (~15g fat).');
  } else if (/salmon|tuna|fish|shrimp|seafood/i.test(text)) {
    baseCals100 = 180;
    protein100 = 21;
    traps.push('Heart-healthy omega-3 fats.');
  } else if (/tofu|edamame|tempeh/i.test(text)) {
    baseCals100 = 110;
    protein100 = 14;
  } else if (/egg|omelet|omelette/i.test(text)) {
    baseCals100 = 155;
    protein100 = 13;
  }

  // Carb & Base checks
  if (/salad|lettuce|cucumber|greens|tomato|spinach/i.test(text) && !/chicken|steak|salmon|cheese/i.test(text)) {
    baseCals100 = 65;
    protein100 = 2.5;
  } else if (/salad/i.test(text) && /caesar|dressing|mayo|tahini|cheese|parmesan/i.test(text)) {
    baseCals100 = 135;
    protein100 = 7;
    traps.push('Dressing or cheese adds fat density.');
  } else if (/pizza/i.test(text)) {
    baseCals100 = 265;
    protein100 = 11;
    traps.push('Cheese and crust density.');
  } else if (/pasta|noodle|spaghetti|ramen/i.test(text)) {
    baseCals100 = 160;
    protein100 = 6;
  } else if (/rice|quinoa|grain|biryani|pilaf/i.test(text)) {
    baseCals100 = 145;
    protein100 = 4;
  } else if (/soup|broth|stew/i.test(text)) {
    baseCals100 = 80;
    protein100 = 5;
  } else if (/smoothie|fruit|acai|berries/i.test(text)) {
    baseCals100 = 75;
    protein100 = 2;
  } else if (/sandwich|wrap|pita|shawarma|burrito/i.test(text)) {
    baseCals100 = 210;
    protein100 = 12;
  }

  // Fat modifiers
  if (/coconut cream/i.test(text)) {
    baseCals100 += 30;
    traps.push('Coconut cream 17% fat base.');
  }
  if (/mayo|dressing|olive oil|butter|fried|tahini/i.test(text)) {
    baseCals100 += 25;
    traps.push('Oils/dressings add caloric density.');
  }
  if (/cheese|cheddar|parmesan|mozzarella|feta/i.test(text)) {
    baseCals100 += 20;
    protein100 += 2;
  }

  if (baseCals100 === 140 && protein100 === 8 && food) {
    baseCals100 = food.kcal;
    protein100 = food.prot;
  }
  let totalCalories = Math.round((weight / 100) * baseCals100);
  let totalProtein = Math.round((weight / 100) * protein100);
  let matched = baseCals100 !== 140 || protein100 !== 8;

  // Drinks: coffee/tea/water/ice are ~0 kcal, so only the stated additions count.
  if (/coff|espresso|americano|latte|cappuccino|tea|water|ice/.test(text)) {
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
    estimatedCalsMin: Math.max(0, Math.round(totalCalories * 0.9)),
    estimatedCalsMax: Math.max(Math.round(totalCalories * 1.1), Math.max(0, Math.round(totalCalories * 0.9)) + 2),
    calories: totalCalories,
    baseCalsPer100g: Math.round(baseCals100 * 10) / 10,
    proteinG: totalProtein,
    proteinPer100g: Math.round(protein100 * 10) / 10,
    assumedGrams: Math.round(weight),
    portionNote,
    detectedItems: name ? [name] : ['Meal'],
    hiddenTrapsNotes: (traps.length > 0 ? traps : ['Rough generic guess (AI unavailable), so treat this as approximate.']).map((x) => heNote(lang, x)).join(' '),
    source: 'offline',
    confidence: matched ? 'medium' : 'low',
  };
}

// Core Dish Estimate function (Gemini Flash + Fallback)
async function estimateDishWithAi({ name = '', weightGram = null, description = '', imageBase64 = null, lang = 'en', quantity = null, unit = null, size = 'regular' }) {
  const { normalizeEstimate } = await P;
  const fallback = normalizeEstimate({}, await offlineFallback({ name, weightGram, description, lang, quantity, unit, size }));

  if (!isGeminiConfigured) {
    return fallback;
  }

  try {
    const parts = [];

    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data,
        },
      });
    }

    const { buildEstimatePrompt, ESTIMATE_TEMPERATURE } = await P;
    const promptText = buildEstimatePrompt({ name, description, weightGram, quantity, unit, size, hasPhoto: !!imageBase64, lang });

    parts.push({ text: promptText });

    const result = await generateWithRetry({
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        temperature: ESTIMATE_TEMPERATURE,
      },
    });

    const text = result.text;
    if (!text) throw new Error('Empty response from Gemini');

    const parsed = JSON.parse(text);
    return normalizeEstimate(parsed, fallback);
  } catch (err) {
    console.warn('⚠️ Gemini call failed, using heuristic estimate:', err.message);
    return fallback;
  }
}

// Shared request cleanup for the two estimate routes. Throws ValidationError on bad input.
const UNITS = Object.keys(UNIT_GRAMS);
function readEstimateInput(body, { defaultWeight = null } = {}) {
  const b = body || {};
  const rawText = V.str(b.rawText, { max: 500, label: 'Text' }) || '';
  const name = V.str(b.name, { max: 100, label: 'Name' }) || V.str(b.dishName, { max: 100, label: 'Name' }) || [...rawText].slice(0, 100).join('');
  const description = V.str(b.description, { max: 500, label: 'Description' }) || V.str(b.textPrompt, { max: 500, label: 'Description' }) || rawText;
  const weightGram = V.num(b.weightGram ?? b.weight, { min: 0, max: 50000, label: 'Weight' }) || defaultWeight;
  let imageBase64 = b.imageBase64;
  if (imageBase64 === undefined || imageBase64 === null || imageBase64 === '') imageBase64 = null;
  else if (typeof imageBase64 !== 'string' || imageBase64.length > 2500000) throw new V.ValidationError('The photo is invalid or too large.');
  return {
    name,
    description,
    weightGram,
    imageBase64,
    quantity: V.num(b.quantity, { min: 0, max: 1000, label: 'Quantity' }) ?? null,
    unit: V.oneOf(b.unit, UNITS, { label: 'Unit' }) ?? null,
    size: V.oneOf(b.size, Object.keys(SIZE_MULT), { label: 'Size' }) ?? 'regular',
  };
}

// POST /api/ai/estimate-dish
// Estimates calories and protein automatically from name, weight, and description
router.post('/ai/estimate-dish', async (req, res) => {
  try {
    const input = readEstimateInput(req.body);
    if (!input.name && !input.description && !input.imageBase64) {
      return res.status(400).json({ error: 'Please provide a dish name, description, or image.' });
    }

    const estimate = await estimateDishWithAi({ ...input, lang: req.lang });

    res.json(estimate);
  } catch (err) {
    V.sendError(res, err, 'Estimate dish error');
  }
});

// POST /api/log/ai-analyze (Unified Vision / Text endpoint)
router.post('/log/ai-analyze', async (req, res) => {
  let input;
  try {
    input = readEstimateInput(req.body, { defaultWeight: 250 });
    const estimate = await estimateDishWithAi({ ...input, lang: req.lang });

    // Provide both formats for compatibility with existing code
    res.json({
      ...estimate,
      proteinEstimateG: estimate.proteinG,
    });
  } catch (err) {
    if (err instanceof V.ValidationError) return V.sendError(res, err, 'AI analyze error');
    console.error('❌ AI analyze error:', err);
    const { normalizeEstimate } = await P;
    const fallback = normalizeEstimate({}, await offlineFallback({ name: input ? input.name : '', weightGram: input ? input.weightGram : null, lang: req.lang }));
    res.json({ ...fallback, proteinEstimateG: fallback.proteinG });
  }
});

// POST /api/rescue/surprise
router.post('/rescue/surprise', async (req, res) => {
  try {
    const { normalizeSuggestions } = await P;
    const b = req.body || {};
    const goalDirection = V.oneOf(b.goalDirection, ['lose', 'gain', 'maintain'], { label: 'Goal' });
    const remainingCals = V.num(b.remainingCals, { min: -100000, max: 100000, label: 'Remaining calories' });
    // Saved recipes are only used for their name and nutrition numbers.
    const savedRecipes = (V.arr(b.savedRecipes, { max: 20, label: 'Recipes' }) || []).map((r) => {
      if (!r || typeof r !== 'object') throw new V.ValidationError('Recipes are invalid.');
      return {
        name: V.str(r.name, { max: 100, required: true, label: 'Recipe name' }),
        baseCalsPer100g: V.num(r.baseCalsPer100g, { min: 0, max: 2000, required: true, label: 'Calories' }),
        proteinPer100g: V.num(r.proteinPer100g, { min: 0, max: 100, label: 'Protein' }) ?? 0,
      };
    });
    const gain = goalDirection === 'gain';
    const remaining = Math.max(100, remainingCals || 500);

    if (isGeminiConfigured) {
      try {
        const { buildSurprisePrompt, SURPRISE_TEMPERATURE } = await P;
        const prompt = buildSurprisePrompt({ remaining, savedRecipes, goalDirection, lang: req.lang });

        const result = await generateWithRetry({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            responseMimeType: 'application/json',
            temperature: SURPRISE_TEMPERATURE,
          },
        });

        const text = result.text;
        const suggestions = normalizeSuggestions(JSON.parse(text));
        if (suggestions.length) return res.json({ suggestions });
        throw new Error('Unusable suggestions');
      } catch (err) {
        console.warn('Gemini surprise failed, using recipe-based fallback:', err.message);
      }
    }

    // Heuristic fallback for suggestions
    const suggestions = [];
    if (savedRecipes && savedRecipes.length > 0) {
      for (const r of savedRecipes.slice(0, 2)) {
        const grams = Math.min(gain ? 500 : 350, Math.max(80, Math.round((remaining * 0.8) / (r.baseCalsPer100g / 100))));
        const cals = Math.round((grams / 100) * r.baseCalsPer100g);
        suggestions.push({
          mealName: r.name,
          suggestedGrams: grams,
          estimatedCals: cals,
          note: req.lang === 'he' ? `מהמתכונים שלך · ~${Math.round((grams / 100) * (r.proteinPer100g || 0))} גר׳ חלבון` : `From your scrolls · ~${Math.round((grams / 100) * (r.proteinPer100g || 0))}g protein`,
        });
      }
    }

    if (gain && suggestions.length < 3) {
      suggestions.push({
        mealName: req.lang === 'he' ? 'שייק בננה וחמאת בוטנים' : 'Peanut butter banana smoothie',
        suggestedGrams: 350,
        estimatedCals: Math.round(remaining * 0.8),
        note: req.lang === 'he' ? 'עשיר, משביע וקל לשתייה 💪' : 'Rich, filling and easy to drink 💪',
      });
    } else if (suggestions.length < 3) {
      suggestions.push({
        mealName: req.lang === 'he' ? (remaining > 400 ? 'חזה עוף בגריל ואורז מאודה' : 'יוגורט יווני עם פירות יער') : (remaining > 400 ? 'Grilled Chicken & Steamed Rice' : 'Greek Yogurt with Berries'),
        suggestedGrams: remaining > 400 ? 250 : 150,
        estimatedCals: Math.round(remaining * 0.75),
        note: req.lang === 'he' ? 'בוסט חלבון מנחם ומשביע 🍃' : 'Cozy and satisfying protein boost 🍃',
      });
    }

    res.json({ suggestions: normalizeSuggestions(suggestions) });
  } catch (err) {
    V.sendError(res, err, 'Rescue surprise error');
  }
});

router.estimateDishWithAi = estimateDishWithAi;
router.isRealKey = isRealKey;
module.exports = router;
