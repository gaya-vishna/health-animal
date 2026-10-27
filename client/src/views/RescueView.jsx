import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles, Plus, X, Search, Sparkle, Pencil } from 'lucide-react';
import { api } from '../utils/api';
import { t } from '../utils/i18n';
import { remainingCals } from '../utils/goal';


export default function RescueView() {
  const [recipes, setRecipes] = useState([]);
  const [dashboard, setDashboard] = useState({ totalCals: 0, targetMax: 1550 });
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // New recipe form (AI-driven: name + weight + description)
  const [newName, setNewName] = useState('');
  const [newWeight, setNewWeight] = useState('250');
  const [newDesc, setNewDesc] = useState('');
  const [aiPreview, setAiPreview] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit mode: when set, the drawer edits this recipe instead of crafting a new one
  const [editingId, setEditingId] = useState(null);
  const [editCals, setEditCals] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editServing, setEditServing] = useState('');

  useEffect(() => {
    Promise.all([api('/api/recipes'), api('/api/dashboard')])
      .then(([r, d]) => Promise.all([r.json(), d.json()]))
      .then(([recipeData, dashData]) => {
        setRecipes(recipeData.recipes || []);
        setDashboard(dashData);
      })
      .catch(console.error);
  }, []);

  const goalDirection = dashboard.goalDirection || 'maintain';
  const gaining = goalDirection === 'gain';
  const remaining = remainingCals(goalDirection, dashboard.totalCals || 0, dashboard.targetMin || 1450, dashboard.targetMax || 1550);

  const filtered = recipes.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleSurprise() {
    setLoadingSuggest(true);
    setSuggestions([]);
    try {
      const res = await api('/api/rescue/surprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remainingCals: remaining, goalDirection, savedRecipes: recipes }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSuggest(false);
    }
  }

  // AI preview before saving
  async function handleEstimatePreview() {
    if (!newName.trim()) return;
    setEstimating(true);
    try {
      const res = await api('/api/ai/estimate-dish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          weightGram: parseFloat(newWeight) || 250,
          description: newDesc.trim(),
        }),
      });
      const data = await res.json();
      setAiPreview(data);
    } catch (err) {
      console.error('Estimate preview failed:', err);
    } finally {
      setEstimating(false);
    }
  }

  async function handleSaveRecipe() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await api('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          weightGram: parseFloat(newWeight) || 250,
          description: newDesc.trim(),
        }),
      });
      const data = await res.json();
      setRecipes((prev) => [...prev, data.recipe].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setNewWeight('250');
      setNewDesc('');
      setAiPreview(null);
      setDrawerOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(r) {
    setEditingId(r.id);
    setNewName(r.name);
    setNewDesc(r.notes || '');
    setNewWeight('250');
    setEditCals(String(r.baseCalsPer100g));
    setEditProtein(String(r.proteinPer100g ?? 0));
    setEditServing(r.servingGrams ? String(r.servingGrams) : '');
    setAiPreview(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  // Pull the AI numbers into the editable per-100g fields
  function applyAiToEdit() {
    if (!aiPreview) return;
    setEditCals(String(aiPreview.baseCalsPer100g));
    setEditProtein(String(aiPreview.proteinPer100g));
  }

  async function handleUpdateRecipe() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await api(`/api/recipes/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          baseCalsPer100g: editCals,
          proteinPer100g: editProtein,
          ...(editServing !== '' && { servingGrams: editServing }),
          notes: newDesc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setRecipes((prev) => prev.map((r) => (r.id === editingId ? data.recipe : r)).sort((a, b) => a.name.localeCompare(b.name)));
      setNewName(''); setNewWeight('250'); setNewDesc(''); setAiPreview(null);
      closeDrawer();
    } catch (err) {
      console.error(err);
      alert(t(err.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    await api(`/api/recipes/${id}`, { method: 'DELETE' });
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="flex-1 overflow-y-auto safe-bottom bg-[#0b1912] pixel-crt text-amber-100">
      <div className="max-w-sm mx-auto px-4 py-4 space-y-4">

        {/* Room-left / still-to-eat banner */}
        <div className="pixel-box-wood p-4 rounded-2xl flex items-center justify-between shadow-xl">
          <div>
            <div className="text-[10px] font-pixel text-amber-300/70 uppercase tracking-wider mb-1">
              {gaining ? t('STILL TO EAT TODAY') : t('ROOM LEFT TODAY')}
            </div>
            <div className="text-3xl font-pixel text-amber-200 tabular-nums">
              {remaining} <span className="text-xs text-amber-400">{t('KCAL')}</span>
            </div>
            <div className="text-[10px] font-pixel text-amber-200/50 mt-0.5">
              {gaining && remaining === 0 ? t('Target reached! Extra bites are a bonus 💪') : t('Zero shame · Fuel ready')}
            </div>
          </div>
          <div className="text-4xl filter drop-shadow">
            {gaining
              ? (remaining === 0 ? '💪' : remaining < 200 ? '🍉' : remaining < 500 ? '🍣' : '🍱')
              : (remaining < 200 ? '🍉' : remaining < 500 ? '🍣' : '🍱')}
          </div>
        </div>

        {/* AI Rescue Button */}
        <motion.button
          id="surprise-btn"
          whileTap={{ scale: 0.95 }}
          onClick={handleSurprise}
          disabled={loadingSuggest}
          className="w-full py-3.5 rounded-2xl pixel-btn-gold text-amber-950 font-pixel text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg"
        >
          {loadingSuggest ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t('ASKING GEMINI...')}</>
          ) : (
            <><Sparkles className="w-4 h-4" /> {t('🎲 RESCUE ME: SURPRISE DISH')}</>
          )}
        </motion.button>

        {/* AI Suggestions */}
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2.5"
            >
              <div className="text-[10px] font-pixel text-purple-300 uppercase tracking-wider px-1">
                {t('⭐ AI RESCUE PICKS')}
              </div>
              {suggestions.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="pixel-box-wood p-3 rounded-2xl flex items-start justify-between gap-3"
                >
                  <div className="flex-1">
                    <div className="font-pixel text-xs text-amber-200">{s.mealName}</div>
                    <div className="text-[10px] font-pixel text-amber-400/80 mt-1">
                      {t('~{g}g · {c} kcal', { g: s.suggestedGrams, c: s.estimatedCals })}
                    </div>
                    {s.note && <div className="text-[9px] font-pixel text-emerald-300 mt-1">🍃 {s.note}</div>}
                  </div>
                  <span className="text-xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                </motion.div>
              ))}
              <div className="text-[9px] font-pixel text-purple-300/60 px-1">{t("Suggestions are estimates, not a meal plan.")}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Caloric Bible Header */}
        <div className="flex items-center justify-between px-1 pt-1">
          <h2 className="font-pixel text-xs text-amber-200 flex items-center gap-1.5">
            <span>📜</span> {t('RECIPE SCROLLS')}
          </h2>
          <button
            onClick={() => {
              setEditingId(null);
              setNewName(''); setNewWeight('250'); setNewDesc('');
              setAiPreview(null);
              setDrawerOpen(true);
            }}
            className="tap-area flex items-center gap-1 text-[9px] font-pixel pixel-btn-action px-3 py-1.5 rounded-xl cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            {t('ADD DISH')}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#140b06] border-2 border-[#3d2212] text-amber-100 ps-10 pe-3 py-2 rounded-xl font-pixel text-xs focus:outline-none focus:border-amber-500"
            placeholder={t('Search recipes...')}
          />
        </div>

        {/* Recipe list */}
        <div className="space-y-2 pb-2">
          {filtered.length === 0 && (
            <div className="text-center text-amber-200/40 font-pixel text-xs py-8">
              {searchQuery ? t('No scrolls match.') : t('No recipes yet. Craft one above!')}
            </div>
          )}
          {filtered.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="pixel-box-wood px-3.5 py-3 rounded-2xl flex items-center justify-between"
            >
              <div>
                <div className="font-pixel text-xs text-amber-100">{r.name}</div>
                <div className="text-[10px] font-pixel text-amber-400/80 mt-1">
                  {t('{n} kcal/100g', { n: r.baseCalsPer100g })}
                  {r.proteinPer100g > 0 && ` · ${t('{n}g protein', { n: r.proteinPer100g })}`}
                </div>
                {r.notes && <div className="text-[9px] font-pixel text-amber-300/60 mt-0.5">🍃 {r.notes}</div>}
              </div>
              <div className="flex items-center">
                <button
                  onClick={() => openEdit(r)}
                  aria-label={`${t('Edit')} ${r.name}`}
                  className="p-2.5 text-amber-300/40 hover:text-amber-200 transition-colors cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  aria-label={`${t('Delete')} ${r.name}`}
                  className="p-2.5 text-amber-300/40 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Add Recipe Drawer — 100% AI Auto-Calculated (No manual calories required!) */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/80"
              onClick={closeDrawer}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#25150c] border-t-4 border-[#140a04] rounded-t-3xl p-5 space-y-3 pb-10 pixel-box-wood text-amber-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#442512] pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">✨</span>
                  <h3 className="font-pixel text-xs text-amber-200">{editingId ? t('EDIT RECIPE') : t('AI CRAFT RECIPE')}</h3>
                </div>
                <button onClick={closeDrawer} className="p-1 rounded-lg text-amber-300/60 hover:text-amber-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-[10px] font-pixel text-emerald-400 bg-[#14281e] p-2 rounded-xl border border-emerald-800">
                {editingId
                  ? t('🍃 Edit the numbers directly, or preview the AI to recalculate them from a portion and notes.')
                  : t('🍃 Just enter the dish name, weight, and ingredients. The AI will calculate the calories and protein for you!')}
              </div>

              {/* Dish Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-pixel text-amber-300/70">{t('DISH NAME *')}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs"
                  placeholder={t('e.g. Chicken Caesar Salad, Salmon Bowl')}
                />
              </div>

              {editingId && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-pixel text-amber-300/70">{t('KCAL / 100G')}</label>
                    <input
                      type="number" min="0" step="any"
                      value={editCals}
                      onChange={(e) => setEditCals(e.target.value)}
                      className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-pixel text-amber-300/70">{t('PROTEIN / 100G')}</label>
                    <input
                      type="number" min="0" step="any"
                      value={editProtein}
                      onChange={(e) => setEditProtein(e.target.value)}
                      className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs"
                    />
                  </div>
                </div>
              )}

              {editingId && (
                <div className="space-y-1">
                  <label className="text-[10px] font-pixel text-amber-300/70">{t('SERVING (G)')}</label>
                  <input
                    type="number" min="1" step="any" inputMode="decimal"
                    value={editServing}
                    onChange={(e) => setEditServing(e.target.value)}
                    className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs"
                    placeholder="150"
                  />
                </div>
              )}

              {/* Portion Weight */}
              <div className="space-y-1">
                <label className="text-[10px] font-pixel text-amber-300/70">{t('ESTIMATED PORTION (GRAMS)')}</label>
                <input
                  type="number"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs"
                  placeholder={t('e.g. 250g (standard plate)')}
                />
              </div>

              {/* Description / Ingredients */}
              <div className="space-y-1">
                <label className="text-[10px] font-pixel text-amber-300/70">{editingId ? t('NOTES & INGREDIENTS') : t('DESCRIPTION & INGREDIENTS')}</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs resize-none h-16"
                  placeholder={t('e.g. Romaine, grilled chicken breast, parmesan, caesar dressing, croutons')}
                />
              </div>

              {/* AI Preview Button */}
              <button
                type="button"
                onClick={handleEstimatePreview}
                disabled={!newName.trim() || estimating}
                className="w-full py-2 rounded-xl font-pixel text-[10px] flex items-center justify-center gap-1.5 bg-[#1a0e07] border border-amber-600/40 text-amber-200 hover:bg-[#25150c] cursor-pointer"
              >
                {estimating ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('AI CALCULATING...')}</>
                ) : (
                  <><Sparkle className="w-3.5 h-3.5 text-amber-400" /> {t('PREVIEW AI NUTRITION')}</>
                )}
              </button>

              {/* AI Preview Card */}
              {aiPreview && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#182c20] border-2 border-[#2b593f] rounded-xl p-3 space-y-1.5 shadow-inner"
                >
                  <div className="flex items-center justify-between text-[10px] font-pixel text-emerald-300">
                    <span>{t('✨ AI NUTRITION')}</span>
                    <span>{t('{n} kcal/100g', { n: aiPreview.baseCalsPer100g })}</span>
                  </div>
                  <div className="text-base font-pixel text-amber-200">
                    {t('{c} KCAL · {p}g PROTEIN', { c: aiPreview.calories, p: aiPreview.proteinG })}
                  </div>
                  {editingId && (
                    <button
                      type="button"
                      onClick={applyAiToEdit}
                      className="text-[10px] font-pixel pixel-btn-action px-2.5 py-1 rounded-lg cursor-pointer"
                    >
                      {t('USE THESE NUMBERS')}
                    </button>
                  )}
                  {aiPreview.hiddenTrapsNotes && (
                    <div className="text-[9px] font-pixel text-emerald-400/80">
                      🍃 {aiPreview.hiddenTrapsNotes}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Save Button */}
              <button
                onClick={editingId ? handleUpdateRecipe : handleSaveRecipe}
                disabled={!newName.trim() || saving}
                className={`w-full py-2.5 rounded-xl font-pixel text-xs flex items-center justify-center gap-2 ${
                  newName.trim() && !saving
                    ? 'pixel-btn-action cursor-pointer'
                    : 'bg-[#180e08] text-amber-200/20 cursor-not-allowed border border-[#2d180d]'
                }`}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? t('SAVE CHANGES 📜') : t('SAVE RECIPE SCROLL 📜'))}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
