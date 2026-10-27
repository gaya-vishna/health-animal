const express = require('express');
const { PrismaClient } = require('@prisma/client');

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
    console.error('❌ Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard', details: err.message });
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

    const weightGram = weightGramBody ?? weightGrams;
    let calculatedCals = null;
    if (inputMode === 'recipe' && recipeId && weightGram) {
      const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, userId: req.userId } });
      if (recipe) {
        calculatedCals = (weightGram / 100) * recipe.baseCalsPer100g;
      }
    }

    const effectiveMode = inputMode || (recipeId ? 'recipe' : 'vision');
    let estMin = aiEstimatedCalsMin;
    let estMax = aiEstimatedCalsMax;
    if (calories && estMin === undefined && estMax === undefined) {
      estMin = Math.round(calories);
      estMax = Math.round(calories);
    }

    const pg = Number(proteinGBody);
    const proteinG = proteinGBody !== undefined && proteinGBody !== null && proteinGBody !== '' && Number.isFinite(pg) && pg >= 0 ? pg : null;

    const log = await prisma.dailyLog.create({
      data: {
        userId: req.userId,
        mealType: mealType || 'snack',
        inputMode: effectiveMode,
        recipeId: recipeId || null,
        weightGram: weightGram ? parseFloat(weightGram) : null,
        rawText: rawText || name || null,
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
      calculatedCals: calculatedCals ? Math.round(calculatedCals) : (calories ? Math.round(calories) : null),
    });
  } catch (err) {
    console.error('❌ Log meal error:', err);
    res.status(500).json({ error: 'Failed to log meal', details: err.message });
  }
});

// POST /api/log/water  (+250ml default)
router.post('/log/water', async (req, res) => {
  try {
    const { ml = 250 } = req.body;
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
    console.error('❌ Log water error:', err);
    res.status(500).json({ error: 'Failed to log water', details: err.message });
  }
});

// POST /api/log/workout
router.post('/log/workout', async (req, res) => {
  try {
    const { type, durationMin, notes } = req.body;
    const log = await prisma.workoutLog.create({
      data: { userId: req.userId, type: type || 'cardio', durationMin: durationMin || 30, notes: notes || null },
    });
    res.json({ success: true, log });
  } catch (err) {
    console.error('❌ Log workout error:', err);
    res.status(500).json({ error: 'Failed to log workout', details: err.message });
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
    console.error('❌ Logs today error:', err);
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
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
    console.error('❌ Checkin status error:', err);
    res.status(500).json({ error: 'Failed to get checkin status', details: err.message });
  }
});

// POST /api/checkin/weight
// Logs weekly weigh-in and updates user config
router.post('/checkin/weight', async (req, res) => {
  try {
    const { weightKg } = req.body;
    if (!weightKg || isNaN(parseFloat(weightKg))) {
      return res.status(400).json({ error: 'Valid weightKg is required' });
    }

    const weight = parseFloat(weightKg);
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
    console.error('❌ Log checkin weight error:', err);
    res.status(500).json({ error: 'Failed to record checkin weight', details: err.message });
  }
});

// POST /api/avatar/tap  { kind: 'pet' | 'statue' | 'flowers' }
router.post('/avatar/tap', async (req, res) => {
  try {
    const kind = req.body && req.body.kind;
    if (!TAP_XP[kind]) return res.status(400).json({ error: 'Unknown tap kind' });
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
    console.error('Avatar tap error:', err);
    res.status(500).json({ error: 'Failed to record tap', details: err.message });
  }
});

module.exports = router;
