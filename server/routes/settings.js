const express = require('express');
const { PrismaClient } = require('@prisma/client');
const V = require('../lib/validate');
const { sendError } = V;

const SOUND_KEYS = ['meal', 'bedtime', 'workout', 'checkin'];

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/settings
router.get('/settings', async (req, res) => {
  try {
    const config = await prisma.userConfig.findUnique({ where: { userId: req.userId } });
    if (!config) {
      return res.status(404).json({ error: 'No preferences found for this account.' });
    }
    const latest = await prisma.weeklyCheckin.findFirst({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' } });
    res.json({
      ...config,
      latestWeighInKg: latest ? latest.weightKg : null,
      mealTimesJson: JSON.parse(config.mealTimesJson),
      notificationSoundsJson: JSON.parse(config.notificationSoundsJson),
    });
  } catch (err) {
    sendError(res, err, '❌ Get settings error:');
  }
});

// POST /api/settings  (full or partial update)
router.post('/settings', async (req, res) => {
  try {
    const b = req.body || {};
    const {
      sex,
      birthYear,
      slothName,
      setupDone,
      proteinTargetG,
    } = b;

    // Numbers: a value outside its range (or not a number) is rejected with a 400.
    const heightCm = V.num(b.heightCm, { min: 50, max: 260, label: 'Height' });
    const startWeightKg = V.num(b.startWeightKg, { min: 20, max: 500, label: 'Start weight' });
    const targetWeightKg = V.num(b.targetWeightKg, { min: 20, max: 500, label: 'Target weight' });
    const dailyCaloricTargetMin = V.num(b.dailyCaloricTargetMin, { min: 1, max: 10000, int: true, label: 'Calorie target' });
    const dailyCaloricTargetMax = V.num(b.dailyCaloricTargetMax, { min: 1, max: 10000, int: true, label: 'Calorie target' });
    const targetDate = V.date(b.targetDate, { label: 'Target date' });
    const bedtimeReminderTime = V.hhmm(b.bedtimeReminderTime, { label: 'Bedtime' });
    let mealTimesJson = V.arr(b.mealTimesJson, { max: 6, label: 'Meal times' });
    if (mealTimesJson) mealTimesJson = mealTimesJson.map((t) => V.hhmm(t, { required: true, label: 'Meal time' }));
    let notificationSoundsJson;
    if (b.notificationSoundsJson !== undefined) {
      const snd = b.notificationSoundsJson;
      if (!snd || typeof snd !== 'object' || Array.isArray(snd)) throw new V.ValidationError('Sounds must be an object.');
      notificationSoundsJson = {};
      for (const k of SOUND_KEYS) {
        if (snd[k] === undefined) continue;
        if (typeof snd[k] !== 'string' || !/^[\w-]{1,30}$/.test(snd[k])) throw new V.ValidationError('Invalid sound choice.');
        notificationSoundsJson[k] = snd[k];
      }
    }

    // sex / birthYear: null or '' clears, a valid value sets, anything else is ignored.
    const profile = {};
    if (sex === null || sex === '') profile.sex = null;
    else if (sex === 'female' || sex === 'male') profile.sex = sex;
    if (birthYear === null || birthYear === '') profile.birthYear = null;
    else if (birthYear !== undefined) {
      const y = Number(birthYear);
      if (Number.isInteger(y) && y >= 1900 && y <= new Date().getFullYear() - 10) profile.birthYear = y;
    }

    // proteinTargetG: null or '' clears (automatic); an integer 1-400 sets it; anything else is ignored.
    if (proteinTargetG === null || proteinTargetG === '') profile.proteinTargetG = null;
    else if (proteinTargetG !== undefined) {
      const p = Number(proteinTargetG);
      if (Number.isInteger(p) && p >= 1 && p <= 400) profile.proteinTargetG = p;
    }

    // slothName: null, '' or blank clears it; a trimmed 1-20 character string sets it; anything else is ignored.
    if (slothName === null || slothName === '') profile.slothName = null;
    else if (typeof slothName === 'string') {
      const n = slothName.trim();
      if (!n) profile.slothName = null;
      else if ([...n].length <= 20) profile.slothName = n;
    }

    const existing = await prisma.userConfig.findUnique({ where: { userId: req.userId } });
    if (!existing) {
      return res.status(404).json({ error: 'No user config found.' });
    }

    const updated = await prisma.userConfig.update({
      where: { id: existing.id },
      data: {
        ...profile,
        ...(typeof setupDone === 'boolean' && { setupDone }),
        ...(heightCm !== undefined && { heightCm }),
        ...(startWeightKg !== undefined && { startWeightKg }),
        ...(targetWeightKg !== undefined && { targetWeightKg }),
        ...(targetDate !== undefined && { targetDate }),
        ...(dailyCaloricTargetMin !== undefined && { dailyCaloricTargetMin }),
        ...(dailyCaloricTargetMax !== undefined && { dailyCaloricTargetMax }),
        ...(mealTimesJson !== undefined && { mealTimesJson: JSON.stringify(mealTimesJson) }),
        ...(bedtimeReminderTime !== undefined && { bedtimeReminderTime }),
        ...(notificationSoundsJson !== undefined && { notificationSoundsJson: JSON.stringify({ ...JSON.parse(existing.notificationSoundsJson), ...notificationSoundsJson }) }),
      },
    });

    res.json({
      success: true,
      config: {
        ...updated,
        mealTimesJson: JSON.parse(updated.mealTimesJson),
        notificationSoundsJson: JSON.parse(updated.notificationSoundsJson),
      },
    });
  } catch (err) {
    sendError(res, err, '❌ Update settings error:');
  }
});

module.exports = router;
