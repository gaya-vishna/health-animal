const express = require('express');
const { PrismaClient } = require('@prisma/client');
const V = require('../lib/validate');
const { sendError } = V;

const { goalDirectionOf, isOverComfort, proteinAutoTargetG } = require('../lib/goal');

const router = express.Router();
const prisma = new PrismaClient();


// ---- progress (days together, XP, level). Nothing here ever resets or subtracts.
const LOG_XP = { meal: 10, water: 3, protein: 5, weighin: 10 };
const LOG_XP_CAP = 40;
const TAP_XP = { pet: 5, statue: 10, flowers: 3 };
const TAP_XP_CAP = 15;

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Accepts an optional ISO createdAt, clamped to [now-48h, now]. Invalid means now.
function clampCreatedAt(value) {
  const now = new Date();
  if (!value) return now;
  const t = new Date(value);
  if (isNaN(t.getTime())) return now;
  const min = new Date(now.getTime() - 48 * 3600000);
  return t < min ? min : t > now ? now : t;
}

async function getAvatar(userId) {
  return prisma.avatarState.upsert({ where: { userId }, update: {}, create: { userId } });
}

// Counts a log: days together (by the REAL current day) and capped log XP.
async function recordLogProgress(userId, kind) {
  try {
    const av = await getAvatar(userId);
    const today = dayKey();
    const data = {};
    if (av.lastLogDay !== today) {
      data.totalDays = (av.totalDays || 0) + 1;
      data.streakDays = data.totalDays;
      data.lastLogDay = today;
    }
    const usedToday = av.logXpDay === today ? av.logXpToday : 0;
    const gain = Math.max(0, Math.min(LOG_XP[kind] || 0, LOG_XP_CAP - usedToday));
    data.logXpDay = today;
    data.logXpToday = usedToday + gain;
    if (gain) {
      data.xp = (av.xp || 0) + gain;
      data.level = Math.floor(data.xp / 100) + 1;
    }
    await prisma.avatarState.update({ where: { userId }, data });
  } catch (err) {
    console.error('progress update failed', err.message);
  }
}

// Helper: get today's date range (midnight to midnight)
function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Grams of protein in one log: recipe math when there is a weight, otherwise what was saved.
function logProtein(log) {
  if (log.mealType === 'protein-check') return 0;
  if (log.inputMode === 'recipe' && log.recipe && log.weightGram) {
    return (log.weightGram * (log.recipe.proteinPer100g || 0)) / 100;
  }
  return log.proteinG || 0;
}

// Effective daily target: the saved one, else automatic from the latest weigh-in (or start weight, or 70).
async function proteinTargetFor(userId, config) {
  if (config?.proteinTargetG) return config.proteinTargetG;
  const latest = await prisma.weeklyCheckin.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const weight = latest?.weightKg || config?.startWeightKg || 70;
  return proteinAutoTargetG(weight, goalDirectionOf(config?.startWeightKg || 70, config?.targetWeightKg || 60));
}

// Helper: compute mood from energy level
function computeMood(energyLevel, totalCals, targetMin, targetMax, goalDirection) {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 22) return 'sleepy';
  if (isOverComfort(goalDirection, totalCals, targetMax)) return 'snacking';
  if (energyLevel >= 90 && totalCals >= targetMin) return 'glow';
  return 'chill';
}

// GET /api/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const { start, end } = getTodayRange();
    const config = await prisma.userConfig.findUnique({ where: { userId: req.userId } });

    const todayLogs = await prisma.dailyLog.findMany({
      where: { userId: req.userId, createdAt: { gte: start, lte: end } },
      include: { recipe: true },
    });

    // Sum calories (recipe math for recipe mode, midpoint for AI mode)
    let totalCals = 0;
    let totalWaterMl = 0;
    let totalProtein = 0;

    let lastMealAt = null;
    const loggedMealTypes = [];

    for (const log of todayLogs) {
      totalWaterMl += log.waterMl || 0;
      totalProtein += logProtein(log);

      let logCals = 0;
      if (log.inputMode === 'recipe' && log.recipe && log.weightGram) {
        logCals = (log.weightGram / 100) * log.recipe.baseCalsPer100g;
        totalCals += logCals;
      } else if (log.aiEstimatedCalsMin || log.aiEstimatedCalsMax) {
        // Vision logs, and recipe logs saved without a weight, use their stored calories.
        const min = log.aiEstimatedCalsMin || 0;
        const max = log.aiEstimatedCalsMax || 0;
        logCals = Math.round((min + max) / 2);
        totalCals += logCals;
      }

      if (logCals > 0 || (log.mealType && log.mealType !== 'water' && log.mealType !== 'protein-check')) {
        loggedMealTypes.push(log.mealType);
        if (!lastMealAt || new Date(log.createdAt) > new Date(lastMealAt)) {
          lastMealAt = log.createdAt;
        }
      }
    }

    const proteinG = Math.round(totalProtein);
    const proteinTargetG = await proteinTargetFor(req.userId, config);
    const proteinHit = proteinG >= proteinTargetG;

    const energyLevel = Math.min(
      100,
      Math.round((totalCals / (config?.dailyCaloricTargetMax || 1550)) * 100)
    );

    const goalDirection = goalDirectionOf(config?.startWeightKg || 70, config?.targetWeightKg || 60);
    const currentMood = computeMood(
      energyLevel,
      totalCals,
      config?.dailyCaloricTargetMin || 1450,
      config?.dailyCaloricTargetMax || 1550,
      goalDirection
    );

    // Parse meal schedule
    let mealSchedule = { breakfast: '09:00', lunch: '13:00', dinner: '19:00' };
    if (config?.mealTimesJson) {
      try {
        const parsed = JSON.parse(config.mealTimesJson);
        if (Array.isArray(parsed)) {
          mealSchedule = { breakfast: parsed[0] || '09:00', lunch: parsed[1] || '13:00', dinner: parsed[2] || '19:00' };
        } else if (typeof parsed === 'object') {
          mealSchedule = { ...mealSchedule, ...parsed };
        }
      } catch (e) {}
    }

    // Progress: days together, XP, level, and the one-time comeback greeting
    const today = dayKey();
    let av = await getAvatar(req.userId);
    let awayDays = 0;
    if (av.lastLogDay && av.lastLogDay !== today) {
      const [y, m, d] = av.lastLogDay.split('-').map(Number);
      const last = new Date(y, m - 1, d);
      const now0 = new Date();
      now0.setHours(0, 0, 0, 0);
      awayDays = Math.max(0, Math.round((now0 - last) / 86400000));
    }
    const comeback = awayDays >= 3 && av.comebackDay !== today;
    const avData = { energyLevel, currentMood };
    if (comeback) {
      avData.comebackDay = today;
      avData.xp = (av.xp || 0) + 20;
      avData.level = Math.floor(avData.xp / 100) + 1;
    }
    av = await prisma.avatarState.update({ where: { userId: req.userId }, data: avData });

    res.json({
      totalCals: Math.round(totalCals),
      totalWaterMl,
      proteinG,
      proteinTargetG,
      proteinHit,
      targetMin: config?.dailyCaloricTargetMin || 1450,
      targetMax: config?.dailyCaloricTargetMax || 1550,
      energyLevel,
      currentMood,
      goalDirection,
      streakDays: av.totalDays || 0,
      totalDays: av.totalDays || 0,
      xp: av.xp || 0,
      level: av.level || 1,
      awayDays,
      comeback,
      bedtimeReminderTime: config?.bedtimeReminderTime || '23:00',
      lastMealAt,
      loggedMealTypes,
      mealSchedule,
      logCount: todayLogs.length,
    });
  } catch (err) {
    sendError(res, err, '❌ Dashboard error:');
  }
});

// POST /api/log/meal
router.post('/log/meal', async (req, res) => {
  try {
    const {
      mealType,
      inputMode,
      calories,
      name,
      recipeId,
      weightGram: weightGramBody,
      weightGrams,
      rawText,
      imageBase64,
      aiEstimatedCalsMin,
      aiEstimatedCalsMax,
      aiBreakdown,
      proteinG: proteinGBody,
      createdAt: createdAtBody,
    } = req.body;

    const v = {
      mealType: V.str(mealType, { max: 30, label: 'Meal type' }),
      inputMode: V.str(inputMode, { max: 20, label: 'Input mode' }),
      calories: V.num(calories, { min: 0, max: 20000, label: 'Calories' }),
      text: V.str(rawText, { max: 500, label: 'Text' }) || V.str(name, { max: 500, label: 'Name' }),
      weightGram: V.num(weightGramBody ?? weightGrams, { min: 0, max: 50000, label: 'Weight' }),
      min: V.num(aiEstimatedCalsMin, { min: 0, max: 20000, label: 'Calories' }),
      max: V.num(aiEstimatedCalsMax, { min: 0, max: 20000, label: 'Calories' }),
      proteinG: V.num(proteinGBody, { min: 0, max: 1000, label: 'Protein' }),
    };
    if (aiBreakdown !== undefined && aiBreakdown !== null && (typeof aiBreakdown !== 'object' || JSON.stringify(aiBreakdown).length > 20000)) {
      throw new V.ValidationError('Breakdown is too large.');
    }
    // recipeId must be a string that belongs to this user; a stale or foreign id is simply dropped.
    const recipe = typeof recipeId === 'string' && recipeId
      ? await prisma.recipe.findFirst({ where: { id: recipeId, userId: req.userId } })
      : null;
    const weightGram = v.weightGram;
    let calculatedCals = null;
    if (v.inputMode === 'recipe' && recipe && weightGram) {
      calculatedCals = (weightGram / 100) * recipe.baseCalsPer100g;
    }

    const effectiveMode = v.inputMode || (recipe ? 'recipe' : 'vision');
    let estMin = v.min;
    let estMax = v.max;
    if (v.calories && estMin === undefined && estMax === undefined) {
      estMin = Math.round(v.calories);
      estMax = Math.round(v.calories);
    }

    const proteinG = v.proteinG ?? null;

    const log = await prisma.dailyLog.create({
      data: {
        userId: req.userId,
        mealType: v.mealType || 'snack',
        inputMode: effectiveMode,
        recipeId: recipe ? recipe.id : null,
        weightGram: weightGram || null,
        rawText: v.text || null,
        aiEstimatedCalsMin: estMin || null,
        aiEstimatedCalsMax: estMax || null,
        aiBreakdown: aiBreakdown ? JSON.stringify(aiBreakdown) : null,
        waterMl: 0,
        proteinG,
        createdAt: clampCreatedAt(createdAtBody),
      },
    });
    await recordLogProgress(req.userId, 'meal');

    // Reaching today's protein goal earns its XP once a day (a meal backdated to yesterday doesn't count).
    try {
      const { start, end } = getTodayRange();
      if (log.createdAt >= start && log.createdAt <= end) {
        const [config, todayLogs, av] = await Promise.all([
          prisma.userConfig.findUnique({ where: { userId: req.userId } }),
          prisma.dailyLog.findMany({ where: { userId: req.userId, createdAt: { gte: start, lte: end } }, include: { recipe: true } }),
          getAvatar(req.userId),
        ]);
        const total = todayLogs.reduce((s, l) => s + logProtein(l), 0);
        const today = dayKey();
        if (av.proteinXpDay !== today && Math.round(total) >= (await proteinTargetFor(req.userId, config))) {
          await prisma.avatarState.update({ where: { userId: req.userId }, data: { proteinXpDay: today } });
          await recordLogProgress(req.userId, 'protein');
        }
      }
    } catch (err) {
      console.error('protein goal check failed', err.message);
    }

    res.json({
      success: true,
      log,
      calculatedCals: calculatedCals ? Math.round(calculatedCals) : (v.calories ? Math.round(v.calories) : null),
    });
  } catch (err) {
    sendError(res, err, '❌ Log meal error:');
  }
});

// POST /api/log/water  (+250ml default)
router.post('/log/water', async (req, res) => {
  try {
    const ml = V.num(req.body.ml, { min: 1, max: 5000, int: true, label: 'Amount' }) ?? 250;
    const log = await prisma.dailyLog.create({
      data: {
        userId: req.userId,
        mealType: 'water',
        inputMode: 'recipe',
        waterMl: ml,
        createdAt: clampCreatedAt(req.body.createdAt),
      },
    });
    await recordLogProgress(req.userId, 'water');
    res.json({ success: true, added: ml, log });
  } catch (err) {
    sendError(res, err, '❌ Log water error:');
  }
});

// POST /api/log/workout
router.post('/log/workout', async (req, res) => {
  try {
    const type = V.str(req.body.type, { max: 50, label: 'Type' });
    const durationMin = V.num(req.body.durationMin, { min: 1, max: 600, int: true, label: 'Duration' });
    const notes = V.str(req.body.notes, { max: 500, label: 'Notes' });
    const log = await prisma.workoutLog.create({
      data: { userId: req.userId, type: type || 'cardio', durationMin: durationMin || 30, notes: notes || null },
    });
    res.json({ success: true, log });
  } catch (err) {
    sendError(res, err, '❌ Log workout error:');
  }
});

// GET /api/logs/today  (full log list for today)
router.get('/logs/today', async (req, res) => {
  try {
    const { start, end } = getTodayRange();
    const logs = await prisma.dailyLog.findMany({
      where: { userId: req.userId, createdAt: { gte: start, lte: end } },
      include: { recipe: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ logs });
  } catch (err) {
    sendError(res, err, '❌ Logs today error:');
  }
});

// GET /api/checkin/status
// Returns weekly checkin status and weight progress
router.get('/checkin/status', async (req, res) => {
  try {
    const config = await prisma.userConfig.findUnique({ where: { userId: req.userId } });
    const latestCheckin = await prisma.weeklyCheckin.findFirst({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const lastDate = latestCheckin ? new Date(latestCheckin.createdAt) : new Date(config?.updatedAt || now);
    const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    const needsCheckin = diffDays >= 7 || !latestCheckin;

    const currentWeight = latestCheckin ? latestCheckin.weightKg : (config?.startWeightKg || 70);
    const startWeight = config?.startWeightKg || 70;
    const goalWeight = config?.targetWeightKg || 60;

    // Weight progress: positive = lost weight, negative = gained weight
    const weightLost = Math.round((startWeight - currentWeight) * 10) / 10;

    // Direction comes from the goal; a goal within 1kg of the start means maintaining.
    const goalDirection = goalDirectionOf(startWeight, goalWeight);
    const inBand = Math.abs(currentWeight - goalWeight) <= 1.5;
    let progressKg, progressPercent;
    if (goalDirection === 'maintain') {
      progressKg = 0;
      progressPercent = inBand ? 100 : 0;
    } else {
      const sign = goalDirection === 'gain' ? 1 : -1;
      progressKg = Math.round((currentWeight - startWeight) * sign * 10) / 10; // kg moved TOWARD the goal
      const totalToTravel = Math.max(0.1, Math.abs(goalWeight - startWeight));
      progressPercent = Math.min(100, Math.max(0, Math.round((progressKg / totalToTravel) * 100)));
    }

    res.json({
      needsCheckin,
      daysSinceLastCheckin: diffDays,
      currentWeight,
      startWeight,
      goalWeight,
      weightLost,
      goalDirection,
      inBand,
      progressKg,
      progressPercent,
      latestCheckin,
    });
  } catch (err) {
    sendError(res, err, '❌ Checkin status error:');
  }
});

// POST /api/checkin/weight
// Logs weekly weigh-in and updates user config
router.post('/checkin/weight', async (req, res) => {
  try {
    const weight = V.num(req.body.weightKg, { min: 20, max: 500, required: true, label: 'Weight' });
    const config = await prisma.userConfig.findUnique({ where: { userId: req.userId } });

    // Create weekly checkin record
    const checkin = await prisma.weeklyCheckin.create({
      data: {
        userId: req.userId,
        weekStartDate: new Date(),
        weightKg: weight,
        avgDailyCals: 1500,
        aiReflection: `Weigh-in logged: ${weight}kg`,
      },
    });
    await recordLogProgress(req.userId, 'weighin');

    res.json({
      success: true,
      checkin,
      currentWeight: weight,
      startWeight: config?.startWeightKg,
      goalWeight: config?.targetWeightKg,
    });
  } catch (err) {
    sendError(res, err, '❌ Log checkin weight error:');
  }
});

// POST /api/avatar/tap  { kind: 'pet' | 'statue' | 'flowers' }
router.post('/avatar/tap', async (req, res) => {
  try {
    const kind = req.body && req.body.kind;
    if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(TAP_XP, kind)) return res.status(400).json({ error: 'Unknown tap kind' });
    const av = await getAvatar(req.userId);
    const today = dayKey();
    const used = av.tapXpDay === today ? av.tapXpToday : 0;
    const gained = Math.max(0, Math.min(TAP_XP[kind], TAP_XP_CAP - used));
    const xp = (av.xp || 0) + gained;
    const level = Math.floor(xp / 100) + 1;
    await prisma.avatarState.update({
      where: { userId: req.userId },
      data: { xp, level, tapXpDay: today, tapXpToday: used + gained },
    });
    res.json({ xp, level, gained });
  } catch (err) {
    sendError(res, err, 'Avatar tap error:');
  }
});

module.exports = router;
