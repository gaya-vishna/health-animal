const express = require('express');
const { PrismaClient } = require('@prisma/client');
const aiRouter = require('./ai');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/recipes
router.get('/recipes', async (req, res) => {
  try {
    const recipes = await prisma.recipe.findMany({ where: { userId: req.userId }, orderBy: { name: 'asc' } });
    res.json({ recipes });
  } catch (err) {
    console.error('❌ Get recipes error:', err);
    res.status(500).json({ error: 'Failed to fetch recipes', details: err.message });
  }
});

// POST /api/recipes
// Automatically calculates calories and protein via AI if not supplied!
router.post('/recipes', async (req, res) => {
  try {
    let { name, baseCalsPer100g, proteinPer100g, notes, description, weightGram, servingGrams } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Dish name is required.' });
    }

    const finalName = name.trim();
    const finalDesc = description || notes || '';
    const finalWeight = parseFloat(weightGram) || 250;

    // If calories or protein are not provided, auto-calculate with AI
    if (baseCalsPer100g === undefined || baseCalsPer100g === null || isNaN(parseFloat(baseCalsPer100g))) {
      const estimate = await aiRouter.estimateDishWithAi({
        name: finalName,
        weightGram: finalWeight,
        description: finalDesc,
        lang: req.lang,
      });
      baseCalsPer100g = estimate.baseCalsPer100g;
      proteinPer100g = estimate.proteinPer100g;
      if (!notes && estimate.hiddenTrapsNotes) {
        notes = estimate.hiddenTrapsNotes;
      }
    }

    const recipe = await prisma.recipe.create({
      data: {
        userId: req.userId,
        name: finalName,
        baseCalsPer100g: parseFloat(baseCalsPer100g),
        proteinPer100g: parseFloat(proteinPer100g || 0),
        servingGrams: parseFloat(servingGrams) > 0 ? parseFloat(servingGrams) : finalWeight,
        notes: notes || finalDesc || null,
      },
    });
    res.json({ success: true, recipe });
  } catch (err) {
    console.error('❌ Create recipe error:', err);
    res.status(500).json({ error: 'Failed to create recipe', details: err.message });
  }
});

// PUT /api/recipes/:id  (edit name, nutrition per 100g, notes)
router.put('/recipes/:id', async (req, res) => {
  try {
    const { name, baseCalsPer100g, proteinPer100g, notes, servingGrams } = req.body;
    const data = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Dish name is required.' });
      data.name = String(name).trim();
    }
    if (baseCalsPer100g !== undefined) {
      const v = parseFloat(baseCalsPer100g);
      if (isNaN(v) || v < 0) return res.status(400).json({ error: 'Calories must be a positive number.' });
      data.baseCalsPer100g = v;
    }
    if (proteinPer100g !== undefined) {
      const v = parseFloat(proteinPer100g);
      if (isNaN(v) || v < 0) return res.status(400).json({ error: 'Protein must be a positive number.' });
      data.proteinPer100g = v;
    }
    if (servingGrams !== undefined) {
      const v = parseFloat(servingGrams);
      if (isNaN(v) || v <= 0) return res.status(400).json({ error: 'Serving size must be a positive number.' });
      data.servingGrams = v;
    }
    if (notes !== undefined) data.notes = String(notes).trim() || null;

    const { count } = await prisma.recipe.updateMany({ where: { id: req.params.id, userId: req.userId }, data });
    if (!count) return res.status(404).json({ error: 'Recipe not found' });
    const recipe = await prisma.recipe.findUnique({ where: { id: req.params.id } });
    res.json({ success: true, recipe });
  } catch (err) {
    console.error('❌ Update recipe error:', err);
    res.status(500).json({ error: 'Failed to update recipe', details: err.message });
  }
});

// DELETE /api/recipes/:id
router.delete('/recipes/:id', async (req, res) => {
  try {
    await prisma.recipe.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Delete recipe error:', err);
    res.status(500).json({ error: 'Failed to delete recipe', details: err.message });
  }
});

module.exports = router;
