const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const WATER_GOAL_ML = 2500; // same goal the dashboard bar uses

// Local (server timezone) calendar day, e.g. "2026-10-04". The container's TZ is set in docker-compose.
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA');
const clock = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// Same rule the dashboard uses: recipe math when there is a weight, otherwise the stored estimate.
function logCalories(log) {
  if (log.inputMode === 'recipe' && log.recipe && log.weightGram) {
    return Math.round((log.weightGram / 100) * log.recipe.baseCalsPer100g);
  }
  if (log.aiEstimatedCalsMin || log.aiEstimatedCalsMax) {
    return Math.round(((log.aiEstimatedCalsMin || 0) + (log.aiEstimatedCalsMax || 0)) / 2);
  }
  return 0;
}

// GET /api/history?days=7|30  -> one entry per day, newest first (empty days included)
router.get('/history', async (req, res) => {
  try {
    const days = Math.min(60, Math.max(1, parseInt(req.query.days, 10) || 7));
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const where = { userId: req.userId };
    const [config, logs, workouts, weighIns] = await Promise.all([
      prisma.userConfig.findUnique({ where: { userId: req.userId } }),
      prisma.dailyLog.findMany({ where: { ...where, createdAt: { gte: since } }, include: { recipe: true }, orderBy: { createdAt: 'asc' } }),
      prisma.workoutLog.findMany({ where: { ...where, date: { gte: since } }, orderBy: { date: 'asc' } }),
      prisma.weeklyCheckin.findMany({ where: { ...where, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } }),
    ]);

    const byDay = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      byDay.set(dayKey(d), { date: dayKey(d), calories: 0, waterMl: 0, proteinHit: false, meals: [], water: [], workouts: [], weighIn: null });
    }

    const lastCheck = new Map(), mealProtein = new Set();
    for (const log of logs) {
      const day = byDay.get(dayKey(log.createdAt));
      if (!day) continue;
      if (log.mealType === 'water') {
        if (log.waterMl > 0) {
          day.waterMl += log.waterMl;
          day.water.push({ id: log.id, ml: log.waterMl, time: clock(log.createdAt) });
        }
      } else if (log.mealType === 'protein-check') {
        lastCheck.set(day, log); // logs are ordered by createdAt asc, so the latest wins
      } else {
        const calories = logCalories(log);
        day.calories += calories;
        if (log.proteinHit) mealProtein.add(day);
        day.meals.push({
          id: log.id,
          name: log.rawText || log.recipe?.name || '',
          mealType: log.mealType,
          calories,
          time: clock(log.createdAt),
        });
      }
    }
    for (const day of byDay.values()) {
      day.proteinHit = lastCheck.has(day) ? !!lastCheck.get(day).proteinHit : mealProtein.has(day);
    }

    for (const w of workouts) {
      const day = byDay.get(dayKey(w.date));
      if (day) day.workouts.push({ id: w.id, type: w.type, durationMin: w.durationMin, time: clock(w.date) });
    }
    for (const c of weighIns) {
      const day = byDay.get(dayKey(c.createdAt));
      if (day) day.weighIn = c.weightKg;
    }

    const list = [...byDay.values()].reverse(); // newest first
    const active = list.filter((d) => d.calories || d.waterMl || d.workouts.length);
    const avg = (fn) => (active.length ? Math.round(active.reduce((s, d) => s + fn(d), 0) / active.length) : 0);

    res.json({
      days: list,
      targets: {
        calMin: config?.dailyCaloricTargetMin || 1450,
        calMax: config?.dailyCaloricTargetMax || 1550,
        waterMl: WATER_GOAL_ML,
      },
      summary: {
        activeDays: active.length,
        avgCalories: avg((d) => d.calories),
        avgWaterMl: avg((d) => d.waterMl),
        workoutDays: list.filter((d) => d.workouts.length).length,
        workoutMinutes: list.reduce((s, d) => s + d.workouts.reduce((m, w) => m + w.durationMin, 0), 0),
      },
    });
  } catch (err) {
    console.error('❌ History error:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// DELETE /api/log/:id  (a water / meal entry)
router.delete('/log/:id', async (req, res) => {
  try {
    const { count } = await prisma.dailyLog.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    if (!count) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Delete log error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// DELETE /api/workout/:id
router.delete('/workout/:id', async (req, res) => {
  try {
    const { count } = await prisma.workoutLog.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    if (!count) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Delete workout error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

module.exports = router;
