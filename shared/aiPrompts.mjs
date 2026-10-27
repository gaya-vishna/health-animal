// AI prompts shared by the server (server/routes/ai.js) and the phone's own-key mode
// (client/src/local/geminiDirect.js), so both ask Gemini exactly the same thing.

export const ESTIMATE_TEMPERATURE = 0.2;
export const SURPRISE_TEMPERATURE = 0.7;

// Tried in order; the newest models are sometimes overloaded, so callers fall through to the next.
// The server prepends env.GEMINI_MODEL.
export const GEMINI_MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

const plural = (n, word) => (n === 1 ? word : `${word}s`);

const LANG_RULE = (lang) =>
  lang === 'he'
    ? '\n- LANGUAGE: write every human-readable text value (item names, notes) in Hebrew. Keep JSON keys in English.'
    : '';

// Text the AI prompt uses for "how much was eaten" - grams only if the user really typed them.
export function amountText({ weightGram, quantity, unit, size, hasPhoto }) {
  if (parseFloat(weightGram) > 0) return `${parseFloat(weightGram)} grams`;
  if (parseFloat(quantity) > 0 && unit && unit !== 'grams') {
    const q = parseFloat(quantity);
    const sz = size && size !== 'regular' ? ` (${size} size)` : '';
    return `${q} ${plural(q, unit)}${sz} - YOU decide the grams from the typical size of this food`;
  }
  if (hasPhoto) return 'the portion visible in the photo - judge its size from the plate, bowl, hands or utensils in the picture';
  return 'one typical single serving';
}

export function buildEstimatePrompt({ name, description, weightGram, quantity, unit, size, hasPhoto, lang }) {
  return `You are a friendly, accurate nutrition estimator. Never judge or moralize food.
Analyze what the user ate and calculate accurate calories and protein. The user does NOT know calories or grams, so work out the weight yourself from the amount (for example "1 cookie" or "a bowl") and any photo, then compute realistic values.

DISH INFO:
- Name: "${name || 'Unnamed meal'}"
- Amount eaten: ${amountText({ weightGram, quantity, unit, size, hasPhoto: !!hasPhoto })}
- Description / Ingredients: "${description || 'none provided'}"

RULES:
- Work from the ingredients: estimate each stated ingredient's calories and protein and ADD THEM UP. The portion weight is only the total size of the serving; do NOT apply an average "meal" density to it.
- Zero/near-zero calorie bases (water, ice, black coffee, plain tea) contribute ~0. A large weight of water/ice/coffee must not inflate the total.
- Use the exact quantities and fat percentages given (e.g. "100ml 5% milk" is about 65-75 kcal).
- Anchor: Coconut cream is 17% fat base unless specified.
- Consider hidden oils, sauces, cheeses, cooking fats.${LANG_RULE(lang)}
- Return ONLY a JSON object with this exact schema:
{
  "calories": <total estimated integer calories for this portion>,
  "baseCalsPer100g": <calories per 100g as integer>,
  "proteinG": <total protein in grams for this portion as integer>,
  "proteinPer100g": <protein per 100g as number>,
  "estimatedCalsMin": <integer min range>,
  "estimatedCalsMax": <integer max range>,
  "detectedItems": ["item1", "item2"],
  "assumedGrams": <total grams you assumed for the WHOLE amount eaten, integer>,
  "portionNote": "<one short sentence showing your assumption, e.g. '1 medium cookie ≈ 30g'>",
  "hiddenTrapsNotes": "<brief neutral note on where the calories come from (oils, sauces, cheese) or null>"
}`;
}

// Merges Gemini's parsed JSON over the fallback estimate, field by field.
export function normalizeEstimate(parsed, fallback) {
  return {
    calories: parsed.calories || Math.round((parsed.estimatedCalsMin + parsed.estimatedCalsMax) / 2) || fallback.calories,
    baseCalsPer100g: parsed.baseCalsPer100g || fallback.baseCalsPer100g,
    proteinG: parsed.proteinG !== undefined ? parsed.proteinG : fallback.proteinG,
    proteinPer100g: parsed.proteinPer100g || fallback.proteinPer100g,
    estimatedCalsMin: parsed.estimatedCalsMin || fallback.estimatedCalsMin,
    estimatedCalsMax: parsed.estimatedCalsMax || fallback.estimatedCalsMax,
    detectedItems: parsed.detectedItems || fallback.detectedItems,
    assumedGrams: parsed.assumedGrams || fallback.assumedGrams,
    portionNote: parsed.portionNote || fallback.portionNote,
    hiddenTrapsNotes: parsed.hiddenTrapsNotes || fallback.hiddenTrapsNotes,
    source: 'gemini_flash',
  };
}

export function buildSurprisePrompt({ remaining, savedRecipes, goalDirection, lang }) {
  const recipeList = (savedRecipes || [])
    .map((r) => `- ${r.name}: ${r.baseCalsPer100g} kcal/100g, ${r.proteinPer100g}g protein/100g`)
    .join('\n');
  const gain = goalDirection === 'gain';
  const situation = gain
    ? `The user has ${remaining} kcal still to eat to reach today's target.`
    : `The user has about ${remaining} kcal of room left today.`;
  const ask = gain
    ? 'Suggest 3 satisfying, calorie-dense, protein-rich meals or snacks (nut butters, olive oil, dairy, smoothies) that help them reach today\'s target.'
    : 'Suggest 3 realistic, satisfying meal options that fit comfortably in the room left.';
  return `You are a warm, non-shaming meal suggestion copilot.
${situation}
Their saved recipes are:
${recipeList || '(no saved recipes yet)'}

${ask}${lang === 'he' ? '\nWrite every mealName and note in Hebrew.' : ''}
Return ONLY valid JSON array:
[
  {
    "mealName": "...",
    "suggestedGrams": 150,
    "estimatedCals": 220,
    "note": "Great balance of carbs and warmth 🌿"
  }
]`;
}
