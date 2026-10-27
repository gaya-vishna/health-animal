const express = require('express');
const { PrismaClient } = require('@prisma/client');

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
    console.error('❌ Get settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings', details: err.message });
  }
});

// POST /api/settings  (full or partial update)
router.post('/settings', async (req, res) => {
  try {
    const {
      heightCm,
      startWeightKg,
      targetWeightKg,
      targetDate,
      dailyCaloricTargetMin,
      dailyCaloricTargetMax,
      mealTimesJson,
      bedtimeReminderTime,
      notificationSoundsJson,
      sex,
      birthYear,
      slothName,
      setupDone,
      proteinTargetG,
    } = req.body;

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
        ...(heightCm !== undefined && { heightCm: parseFloat(heightCm) }),
        ...(startWeightKg !== undefined && { startWeightKg: parseFloat(startWeightKg) }),
        ...(targetWeightKg !== undefined && { targetWeightKg: parseFloat(targetWeightKg) }),
        ...(targetDate !== undefined && { targetDate: new Date(targetDate) }),
        ...(dailyCaloricTargetMin !== undefined && { dailyCaloricTargetMin: parseInt(dailyCaloricTargetMin) }),
        ...(dailyCaloricTargetMax !== undefined && { dailyCaloricTargetMax: parseInt(dailyCaloricTargetMax) }),
        ...(mealTimesJson !== undefined && { mealTimesJson: JSON.stringify(mealTimesJson) }),
        ...(bedtimeReminderTime !== undefined && { bedtimeReminderTime }),
        ...(notificationSoundsJson !== undefined && { notificationSoundsJson: JSON.stringify(notificationSoundsJson) }),
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
    console.error('❌ Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings', details: err.message });
  }
});

module.exports = router;
