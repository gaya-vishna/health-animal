// Local mode: answers the same /api/... requests the screens make, from the on-phone store instead of
// the server. Mirrors server/routes/{logs,history,recipes,settings}.js so the screens need no changes.
import { read, write, newId, isFailed, setMemory } from './store';
import { offlineEstimate } from './offlineEstimate';
import { askAi } from './aiRouter';
import { starterRecipes } from './starterRecipes';
import { getLang } from '../utils/i18n';
import { goalDirectionOf, isOverComfort } from '../utils/goal';

const WATER_GOAL_ML = 2500;
const DEFAULT_CONFIG = {
  heightCm: 165,
  startWeightKg: 70,
  targetWeightKg: 60,
  sex: null,
  birthYear: null,
  slothName: null,
  dailyCaloricTargetMin: 1450,
  dailyCaloricTargetMax: 1550,
  mealTimesJson: ['09:30', '13:30', '18:00', '21:00'],
  bedtimeReminderTime: '23:00',
  notificationSoundsJson: { meal: 'bell', bedtime: 'winddown', workout: 'tick', checkin: 'harp' },
};

// First launch: default settings and starter recipes in the phone's language.
// A collection that failed to load is given in-memory defaults only; it is never written.
async function ensureSeed() {
  const put = (name, value) => (isFailed(name) ? setMemory(name, value) : write(name, value));
  const missing = (name) => read(name) == null;
  if (missing('config')) {
    const now = new Date();
    const targetDate = new Date(now.getTime() + 12 * 7 * 86400000).toISOString();
    await put('config', { ...DEFAULT_CONFIG, setupDone: false, targetDate, updatedAt: now.toISOString() });
  }
  if (missing('avatar')) await put('avatar', { streakDays: 0, energyLevel: 100, currentMood: 'chill' });
  if (missing('recipes')) {
    const now = new Date().toISOString();
    await put('recipes', starterRecipes(getLang()).map((r) => ({ ...r, id: newId(), createdAt: now })));
  }
  for (const name of ['logs', 'workouts', 'checkins']) if (missing(name)) await put(name, []);
}

const ok = (data) => ({ status: 200, data });
const fail = (status, error) => ({ status, data: { error } });

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const clock = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const recipeById = (id) => (read('recipes') || []).find((r) => r.id === id);

function logCalories(log) {
  const recipe = log.recipeId ? recipeById(log.recipeId) : null;
  if (log.inputMode === 'recipe' && recipe && log.weightGram) return (log.weightGram / 100) * recipe.baseCalsPer100g;
  if (log.aiEstimatedCalsMin || log.aiEstimatedCalsMax) return Math.round(((log.aiEstimatedCalsMin || 0) + (log.aiEstimatedCalsMax || 0)) / 2);
  return 0;
}

// ---------------------------------------------------------------- dashboard
function dashboard() {
  const config = read('config');
  const start = startOfToday();
  const today = read('logs').filter((l) => new Date(l.createdAt) >= start);
  let totalCals = 0, totalWaterMl = 0, proteinHit = false, lastMealAt = null;
  const loggedMealTypes = [];
  for (const log of today) {
    totalWaterMl += log.waterMl || 0;
    if (log.proteinHit) proteinHit = true;
    const cals = logCalories(log);
    totalCals += cals;
    if (cals > 0 || (log.mealType && log.mealType !== 'water' && log.mealType !== 'protein-check')) {
      loggedMealTypes.push(log.mealType);
      if (!lastMealAt || new Date(log.createdAt) > new Date(lastMealAt)) lastMealAt = log.createdAt;
    }
  }
  const targetMin = config.dailyCaloricTargetMin || 1450;
  const targetMax = config.dailyCaloricTargetMax || 1550;
  const energyLevel = Math.min(100, Math.round((totalCals / targetMax) * 100));
  const hour = new Date().getHours();
  const goalDirection = goalDirectionOf(config.startWeightKg || 70, config.targetWeightKg || 60);
  const currentMood = hour >= 22 ? 'sleepy' : isOverComfort(goalDirection, totalCals, targetMax) ? 'snacking' : energyLevel >= 90 && totalCals >= targetMin ? 'glow' : 'chill';
  const times = Array.isArray(config.mealTimesJson) ? config.mealTimesJson : DEFAULT_CONFIG.mealTimesJson;
  return ok({
    totalCals: Math.round(totalCals),
    totalWaterMl,
    proteinHit,
    targetMin,
    targetMax,
    energyLevel,
    currentMood,
    goalDirection,
    streakDays: read('avatar')?.streakDays || 0,
    bedtimeReminderTime: config.bedtimeReminderTime || '23:00',
    lastMealAt,
    loggedMealTypes,
    mealSchedule: { breakfast: times[0] || '09:00', lunch: times[1] || '13:00', dinner: times[2] || '19:00' },
    logCount: today.length,
  });
}

// ---------------------------------------------------------------- logging
async function addLog(fields) {
  const log = {
    id: newId(),
    createdAt: new Date().toISOString(),
    mealType: 'snack',
    inputMode: 'recipe',
    recipeId: null,
    weightGram: null,
    rawText: null,
    aiEstimatedCalsMin: null,
    aiEstimatedCalsMax: null,
    waterMl: 0,
    proteinHit: false,
    ...fields,
  };
  await write('logs', [...read('logs'), log]);
  return log;
}

async function logMeal(b) {
  const weightGram = b.weightGram ?? b.weightGrams;
  const mode = b.inputMode || (b.recipeId ? 'recipe' : 'vision');
  let min = b.aiEstimatedCalsMin;
  let max = b.aiEstimatedCalsMax;
  if (b.calories && min === undefined && max === undefined) min = max = Math.round(b.calories);
  const log = await addLog({
    mealType: b.mealType || 'snack',
    inputMode: mode,
    recipeId: b.recipeId || null,
    weightGram: weightGram ? parseFloat(weightGram) : null,
    rawText: b.rawText || b.name || null,
    aiEstimatedCalsMin: min || null,
    aiEstimatedCalsMax: max || null,
    proteinHit: b.proteinHit || false,
  });
  return ok({ success: true, log, calculatedCals: Math.round(logCalories(log)) || null });
}

// ---------------------------------------------------------------- weight
function checkinStatus() {
  const config = read('config');
  const checkins = read('checkins');
  const latest = checkins.length ? checkins[checkins.length - 1] : null;
  const now = new Date();
  const lastDate = latest ? new Date(latest.createdAt) : new Date(config.updatedAt || now);
  const diffDays = Math.floor((now - lastDate) / 86400000);
  const currentWeight = latest ? latest.weightKg : config.startWeightKg || 70;
  const startWeight = config.startWeightKg || 70;
  const goalWeight = config.targetWeightKg || 60;
  const goalDirection = goalDirectionOf(startWeight, goalWeight);
  const inBand = Math.abs(currentWeight - goalWeight) <= 1.5;
  const maintain = goalDirection === 'maintain';
  const progressKg = maintain ? 0 : Math.round((currentWeight - startWeight) * (goalDirection === 'gain' ? 1 : -1) * 10) / 10;
  const total = Math.max(0.1, Math.abs(goalWeight - startWeight));
  return ok({
    needsCheckin: diffDays >= 7 || !latest,
    daysSinceLastCheckin: diffDays,
    currentWeight,
    startWeight,
    goalWeight,
    weightLost: Math.round((startWeight - currentWeight) * 10) / 10,
    goalDirection,
    inBand,
    progressKg,
    progressPercent: maintain ? (inBand ? 100 : 0) : Math.min(100, Math.max(0, Math.round((progressKg / total) * 100))),
    latestCheckin: latest,
  });
}

// ---------------------------------------------------------------- history (journal)
function history(days) {
  days = Math.min(60, Math.max(1, days || 7));
  const config = read('config');
  const since = startOfToday();
  since.setDate(since.getDate() - (days - 1));
  const byDay = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    byDay.set(dayKey(d), { date: dayKey(d), calories: 0, waterMl: 0, proteinHit: false, meals: [], water: [], workouts: [], weighIn: null });
  }
  for (const log of read('logs')) {
    const day = byDay.get(dayKey(log.createdAt));
    if (!day) continue;
    if (log.mealType === 'water') {
      if (log.waterMl > 0) {
        day.waterMl += log.waterMl;
        day.water.push({ id: log.id, ml: log.waterMl, time: clock(log.createdAt) });
      }
    } else if (log.mealType === 'protein-check') {
      if (log.proteinHit) day.proteinHit = true;
    } else {
      const calories = Math.round(logCalories(log));
      day.calories += calories;
      if (log.proteinHit) day.proteinHit = true;
      day.meals.push({ id: log.id, name: log.rawText || recipeById(log.recipeId)?.name || '', mealType: log.mealType, calories, time: clock(log.createdAt) });
    }
  }
  for (const w of read('workouts')) {
    const day = byDay.get(dayKey(w.date));
    if (day) day.workouts.push({ id: w.id, type: w.type, durationMin: w.durationMin, time: clock(w.date) });
  }
  for (const c of read('checkins')) {
    const day = byDay.get(dayKey(c.createdAt));
    if (day) day.weighIn = c.weightKg;
  }
  const list = [...byDay.values()].reverse();
  const active = list.filter((d) => d.calories || d.waterMl || d.workouts.length);
  const avg = (fn) => (active.length ? Math.round(active.reduce((s, d) => s + fn(d), 0) / active.length) : 0);
  return ok({
    days: list,
    targets: { calMin: config.dailyCaloricTargetMin, calMax: config.dailyCaloricTargetMax, waterMl: WATER_GOAL_ML },
    summary: {
      activeDays: active.length,
      avgCalories: avg((d) => d.calories),
      avgWaterMl: avg((d) => d.waterMl),
      workoutDays: list.filter((d) => d.workouts.length).length,
      workoutMinutes: list.reduce((s, d) => s + d.workouts.reduce((m, w) => m + w.durationMin, 0), 0),
    },
  });
}

// ---------------------------------------------------------------- AI (home server, offline fallback)
async function estimateDish(b) {
  const body = {
    name: b.name || b.dishName || b.rawText || '',
    description: b.description || b.rawText || '',
    weightGram: b.weightGram || b.weight || null,
    imageBase64: b.imageBase64 || null,
    quantity: b.quantity,
    unit: b.unit,
    size: b.size,
  };
  if (!body.name && !body.description && !body.imageBase64) return fail(400, 'Please provide a dish name, description, or image.');
  const remote = await askAi('/api/ai/estimate-dish', body);
  return ok(remote && !remote.error ? remote : offlineEstimate({ ...body, lang: getLang() }));
}

async function surprise(b) {
  const remote = await askAi('/api/rescue/surprise', b);
  if (remote && remote.suggestions) return ok(remote);
  const he = getLang() === 'he';
  const gain = b.goalDirection === 'gain';
  const remaining = Math.max(100, b.remainingCals || 500);
  const suggestions = (b.savedRecipes || []).slice(0, gain ? 2 : 3).map((r) => {
    const grams = Math.min(gain ? 500 : 350, Math.max(80, Math.round((remaining * 0.8) / (r.baseCalsPer100g / 100))));
    const protein = Math.round((grams / 100) * (r.proteinPer100g || 0));
    return { mealName: r.name, suggestedGrams: grams, estimatedCals: Math.round((grams / 100) * r.baseCalsPer100g), note: he ? `מהמתכונים שלך · ~${protein} גר׳ חלבון` : `From your scrolls · ~${protein}g protein` };
  });
  if (gain && suggestions.length < 3) {
    suggestions.push({
      mealName: he ? 'שייק בננה וחמאת בוטנים' : 'Peanut butter banana smoothie',
      suggestedGrams: 350,
      estimatedCals: Math.round(remaining * 0.8),
      note: he ? 'עשיר, משביע וקל לשתייה 💪' : 'Rich, filling and easy to drink 💪',
    });
  }
  return ok({ suggestions });
}

// ---------------------------------------------------------------- recipes
async function createRecipe(b) {
  if (!b.name || !String(b.name).trim()) return fail(400, 'Dish name is required.');
  const name = String(b.name).trim();
  const description = b.description || b.notes || '';
  const weight = parseFloat(b.weightGram) || 250;
  let { baseCalsPer100g, proteinPer100g, notes } = b;
  if (baseCalsPer100g === undefined || baseCalsPer100g === null || isNaN(parseFloat(baseCalsPer100g))) {
    const est = (await estimateDish({ name, weightGram: weight, description })).data;
    baseCalsPer100g = est.baseCalsPer100g;
    proteinPer100g = est.proteinPer100g;
    if (!notes && est.hiddenTrapsNotes) notes = est.hiddenTrapsNotes;
  }
  const recipe = {
    id: newId(),
    name,
    baseCalsPer100g: parseFloat(baseCalsPer100g),
    proteinPer100g: parseFloat(proteinPer100g || 0),
    servingGrams: parseFloat(b.servingGrams) > 0 ? parseFloat(b.servingGrams) : weight,
    notes: notes || description || null,
    createdAt: new Date().toISOString(),
  };
  await write('recipes', [...read('recipes'), recipe]);
  return ok({ success: true, recipe });
}

async function updateRecipe(id, b) {
  const recipes = read('recipes');
  const i = recipes.findIndex((r) => r.id === id);
  if (i < 0) return fail(404, 'Recipe not found');
  const r = { ...recipes[i] };
  if (b.name !== undefined) {
    if (!String(b.name).trim()) return fail(400, 'Dish name is required.');
    r.name = String(b.name).trim();
  }
  for (const [key, msg] of [['baseCalsPer100g', 'Calories must be a positive number.'], ['proteinPer100g', 'Protein must be a positive number.']]) {
    if (b[key] !== undefined) {
      const v = parseFloat(b[key]);
      if (isNaN(v) || v < 0) return fail(400, msg);
      r[key] = v;
    }
  }
  if (b.servingGrams !== undefined) {
    const v = parseFloat(b.servingGrams);
    if (isNaN(v) || v <= 0) return fail(400, 'Serving size must be a positive number.');
    r.servingGrams = v;
  }
  if (b.notes !== undefined) r.notes = String(b.notes).trim() || null;
  const next = [...recipes];
  next[i] = r;
  await write('recipes', next);
  return ok({ success: true, recipe: r });
}

// ---------------------------------------------------------------- settings
async function saveSettings(b) {
  const c = { ...read('config') };
  // Only accept usable values; anything else keeps the existing setting.
  const num = (k, parse = parseFloat) => {
    if (b[k] === undefined) return;
    const v = parse(b[k]);
    if (Number.isFinite(v) && v > 0) c[k] = v;
  };
  const hhmm = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
  num('heightCm'); num('startWeightKg'); num('targetWeightKg');
  num('dailyCaloricTargetMin', (v) => parseInt(v, 10)); num('dailyCaloricTargetMax', (v) => parseInt(v, 10));
  // sex / birthYear: null or '' clears, a valid value sets, anything else is ignored.
  if (b.sex === null || b.sex === '') c.sex = null;
  else if (b.sex === 'female' || b.sex === 'male') c.sex = b.sex;
  if (b.birthYear === null || b.birthYear === '') c.birthYear = null;
  else if (b.birthYear !== undefined) {
    const y = Number(b.birthYear);
    if (Number.isInteger(y) && y >= 1900 && y <= new Date().getFullYear() - 10) c.birthYear = y;
  }
  // slothName: null, '' or blank clears it; a trimmed 1-20 character string sets it; anything else is ignored.
  if (b.slothName === null || b.slothName === '') c.slothName = null;
  else if (typeof b.slothName === 'string') {
    const n = b.slothName.trim();
    if (!n) c.slothName = null;
    else if ([...n].length <= 20) c.slothName = n;
  }
  if (b.targetDate !== undefined) {
    const d = new Date(b.targetDate);
    if (!isNaN(d.getTime())) c.targetDate = d.toISOString();
  }
  if (Array.isArray(b.mealTimesJson) && b.mealTimesJson.every(hhmm)) c.mealTimesJson = b.mealTimesJson;
  if (hhmm(b.bedtimeReminderTime)) c.bedtimeReminderTime = b.bedtimeReminderTime;
  if (b.notificationSoundsJson !== undefined) c.notificationSoundsJson = b.notificationSoundsJson;
  if (typeof b.setupDone === 'boolean') c.setupDone = b.setupDone;
  c.updatedAt = new Date().toISOString();
  await write('config', c);
  return ok({ success: true, config: c });
}

// ---------------------------------------------------------------- router
async function route(method, path, query, body) {
  await ensureSeed();
  const seg = path.replace(/^\/api\//, '').split('/');
  const key = `${method} ${seg[0]}${seg[1] ? '/' + seg[1] : ''}`;

  switch (true) {
    case key === 'GET auth/me': return ok({ user: { id: 'local', username: 'local', name: null } });
    case key === 'GET dashboard': return dashboard();
    case key === 'GET recipes': return ok({ recipes: [...read('recipes')].sort((a, b) => a.name.localeCompare(b.name)) });
    case key === 'POST recipes': return createRecipe(body);
    case method === 'PUT' && seg[0] === 'recipes': return updateRecipe(seg[1], body);
    case method === 'DELETE' && seg[0] === 'recipes':
      await write('recipes', read('recipes').filter((r) => r.id !== seg[1]));
      return ok({ success: true });
    case key === 'GET settings': return ok({ ...read('config') });
    case key === 'POST settings': return saveSettings(body);
    case key === 'POST log/meal': return logMeal(body);
    case key === 'POST log/water': {
      const ml = body.ml ?? 250;
      return ok({ success: true, added: ml, log: await addLog({ mealType: 'water', waterMl: ml }) });
    }
    case key === 'POST log/protein': {
      const hit = body.hit ?? true;
      return ok({ success: true, proteinHit: hit, log: await addLog({ mealType: 'protein-check', proteinHit: hit }) });
    }
    case key === 'POST log/workout': {
      const w = { id: newId(), date: new Date().toISOString(), type: body.type || 'cardio', durationMin: body.durationMin || 30, notes: body.notes || null };
      await write('workouts', [...read('workouts'), w]);
      return ok({ success: true, log: w });
    }
    case method === 'DELETE' && seg[0] === 'log': {
      const before = read('logs').length;
      await write('logs', read('logs').filter((l) => l.id !== seg[1]));
      return read('logs').length < before ? ok({ success: true }) : fail(404, 'Entry not found');
    }
    case method === 'DELETE' && seg[0] === 'workout': {
      const before = read('workouts').length;
      await write('workouts', read('workouts').filter((w) => w.id !== seg[1]));
      return read('workouts').length < before ? ok({ success: true }) : fail(404, 'Entry not found');
    }
    case key === 'GET checkin/status': return checkinStatus();
    case key === 'POST checkin/weight': {
      const weight = parseFloat(body.weightKg);
      if (!weight) return fail(400, 'Valid weightKg is required');
      const c = { id: newId(), createdAt: new Date().toISOString(), weekStartDate: new Date().toISOString(), weightKg: weight };
      await write('checkins', [...read('checkins'), c]);
      const config = read('config');
      return ok({ success: true, checkin: c, currentWeight: weight, startWeight: config.startWeightKg, goalWeight: config.targetWeightKg });
    }
    case key === 'GET history': return history(parseInt(query.get('days'), 10));
    case key === 'POST ai/estimate-dish':
    case key === 'POST log/ai-analyze': return estimateDish(body);
    case key === 'POST rescue/surprise': return surprise(body);
    default: return fail(404, 'Not found');
  }
}

// Same shape as fetch(): { ok, status, json() }
export async function localApi(path, opts = {}) {
  const [p, qs] = path.split('?');
  let body = {};
  try {
    body = opts.body ? JSON.parse(opts.body) : {};
  } catch {
    body = {};
  }
  let result;
  try {
    result = await route((opts.method || 'GET').toUpperCase(), p, new URLSearchParams(qs || ''), body);
  } catch (err) {
    console.error('local api error', p, err);
    result = fail(500, 'Something went wrong');
  }
  return { ok: result.status < 400, status: result.status, json: async () => result.data };
}
