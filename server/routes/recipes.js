const express = require('express');
const { PrismaClient } = require('@prisma/client');
const V = require('../lib/validate');
const { sendError } = V;
const aiRouter = require('./ai');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/recipes
router.get('/recipes', async (req, res) => {
  try {
    const recipes = await prisma.recipe.findMany({ where: { userId: req.userId }, orderBy: { name: 'asc' } });
    res.json({ recipes });
  } catch (err) {
    sendError(res, err, '❌ Get recipes error:');
  }
});

// POST /api/recipes
// Automatically calculates calories and protein via AI if not supplied!
router.post('/recipes', async (req, res) => {
  try {
    const body = req.body || {};
    const name = V.str(body.name, { max: 100, required: true, label: 'Dish name' });
    let notes = V.str(body.notes, { max: 500, label: 'Notes' });
    const description = V.str(body.description, { max: 500, label: 'Description' });
    let baseCalsPer100g = V.num(body.baseCalsPer100g, { min: 0, max: 2000, label: 'Calories' });
    let proteinPer100g = V.num(body.proteinPer100g, { min: 0, max: 100, label: 'Protein' });
    const weightGram = V.num(body.weightGram, { min: 1, max: 10000, label: 'Weight' });
    const servingGrams = V.num(body.servingGrams, { min: 1, max: 10000, label: 'Serving size' });

    const finalName = name;
    const finalDesc = description || notes || '';
    const finalWeight = weightGram || 250;

    // If calories or protein are not provided, auto-calculate with AI
    if (baseCalsPer100g === undefined) {
      const estimate = await aiRouter.estimateDishWithAi({
        name: finalName,
        weightGram: finalWeight,
        description: finalDesc,
        lang: req.lang,
      });
      baseCalsPer100g = Math.min(2000, Math.max(0, Number(estimate.baseCalsPer100g) || 0));
      proteinPer100g = Math.min(100, Math.max(0, Number(estimate.proteinPer100g) || 0));
      if (!notes && estimate.hiddenTrapsNotes) {
        notes = estimate.hiddenTrapsNotes;
      }
    }

    const recipe = await prisma.recipe.create({
      data: {
        userId: req.userId,
        name: finalName,
        baseCalsPer100g,
        proteinPer100g: proteinPer100g || 0,
        servingGrams: servingGrams > 0 ? servingGrams : finalWeight,
        notes: (notes || finalDesc || '').slice(0, 500) || null,
      },
    });
    res.json({ success: true, recipe });
  } catch (err) {
    sendError(res, err, '❌ Create recipe error:');
  }
});

// PUT /api/recipes/:id  (edit name, nutrition per 100g, notes)
router.put('/recipes/:id', async (req, res) => {
  try {
    const body = req.body || {};
    if (typeof req.params.id !== 'string') return res.status(404).json({ error: 'Recipe not found' });
    const data = {};
    if (body.name !== undefined) data.name = V.str(body.name, { max: 100, required: true, label: 'Dish name' });
    if (body.baseCalsPer100g !== undefined) data.baseCalsPer100g = V.num(body.baseCalsPer100g, { min: 0, max: 2000, required: true, label: 'Calories' });
    if (body.proteinPer100g !== undefined) data.proteinPer100g = V.num(body.proteinPer100g, { min: 0, max: 100, required: true, label: 'Protein' });
    if (body.servingGrams !== undefined) data.servingGrams = V.num(body.servingGrams, { min: 1, max: 10000, required: true, label: 'Serving size' });
    if (body.notes !== undefined) data.notes = V.str(body.notes, { max: 500, label: 'Notes' }) || null;

    const { count } = await prisma.recipe.updateMany({ where: { id: req.params.id, userId: req.userId }, data });
    if (!count) return res.status(404).json({ error: 'Recipe not found' });
    const recipe = await prisma.recipe.findUnique({ where: { id: req.params.id } });
    res.json({ success: true, recipe });
  } catch (err) {
    sendError(res, err, '❌ Update recipe error:');
  }
});

// DELETE /api/recipes/:id
router.delete('/recipes/:id', async (req, res) => {
  try {
    await prisma.recipe.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, '❌ Delete recipe error:');
  }
});

module.exports = router;
