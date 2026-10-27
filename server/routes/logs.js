const express = require('express');
const { PrismaClient } = require('@prisma/client');

const { goalDirectionOf, isOverComfort } = require('../lib/goal');

const router = express.Router();
const prisma = new PrismaClient();

// Helper: get today's date range (midnight to midnight)
function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
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
    const avatar = await prisma.avatarState.findUnique({ where: { userId: req.userId } });

    const todayLogs = await prisma.dailyLog.findMany({
      where: { userId: req.userId, createdAt: { gte: start, lte: end } },
      include: { recipe: true },
    });

    // Sum calories (recipe math for recipe mode, midpoint for AI mode)
    let totalCals = 0;
    let totalWaterMl = 0;
    let proteinHit = false;

    let lastMealAt = null;
    const loggedMealTypes = [];

    for (const log of todayLogs) {
      totalWaterMl += log.waterMl || 0;
      if (log.proteinHit) proteinHit = true;

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

    // Update avatar mood live
    await prisma.avatarState.update({
      where: { userId: req.userId },
      data: { energyLevel, currentMood },
    });

    res.json({
      totalCals: Math.round(totalCals),
      totalWaterMl,
      proteinHit,
      targetMin: config?.dailyCaloricTargetMin || 1450,
      targetMax: config?.dailyCaloricTargetMax || 1550,
      energyLevel,
      currentMood,
      goalDirection,
      streakDays: avatar?.streakDays || 0,
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
      proteinHit,
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
        proteinHit: proteinHit || false,
      },
    });

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
      },
    });
    res.json({ success: true, added: ml, log });
  } catch (err) {
    console.error('❌ Log water error:', err);
    res.status(500).json({ error: 'Failed to log water', details: err.message });
  }
});

// POST /api/log/protein  (toggle protein hit for today)
router.post('/log/protein', async (req, res) => {
  try {
    const { hit = true } = req.body;
    const log = await prisma.dailyLog.create({
      data: {
        userId: req.userId,
        mealType: 'protein-check',
        inputMode: 'recipe',
        proteinHit: hit,
      },
    });
    res.json({ success: true, proteinHit: hit, log });
  } catch (err) {
    console.error('❌ Log protein error:', err);
    res.status(500).json({ error: 'Failed to log protein hit', details: err.message });
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

module.exports = router;
