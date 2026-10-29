import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Image as ImageIcon, BookOpen, Loader2, AlertTriangle, Sparkles, Minus, Plus, Pencil } from 'lucide-react';
import { compressImageToCanvasBase64 } from '../utils/canvasCompressor';
import { playSound } from '../utils/audioHaptics';
import { api } from '../utils/api';
import { t } from '../utils/i18n';

// How people actually think about food: "1 cookie", "a bowl", "half of it". The AI turns that into grams.
const UNITS = ['piece', 'bowl', 'cup', 'plate', 'spoon', 'slice', 'handful', 'grams'];
const SIZES = ['small', 'regular', 'large'];
const EATEN = [
  { value: 0.25, label: '¼' },
  { value: 0.5, label: '½' },
  { value: 0.75, label: '¾' },
  { value: 1, label: 'ALL' },
];
const SERVING_CHIPS = [0.5, 1, 1.5, 2];
const DEFAULT_SERVING_G = 150; // for saved recipes that have no serving size yet

// When was it eaten? Sent as createdAt (the server/local store clamp it to the last 48h).
const WHEN = ['now', 'earlier', 'yesterday'];
const USUAL_HOUR = { morning: [8, 30], lunch: [13, 0], dinner: [19, 0], snack: [16, 0] };
function whenToIso(when, mealType) {
  const now = new Date();
  if (when === 'earlier') {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 1, 0, 0);
    return new Date(Math.max(now.getTime() - 3 * 3600 * 1000, startOfDay.getTime())).toISOString();
  }
  if (when === 'yesterday') {
    const [h, m] = USUAL_HOUR[mealType] || [13, 0];
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }
  return undefined; // now: the server stamps it
}

const mealTypeNow = () => {
  const h = new Date().getHours();
  return h < 11 ? 'morning' : h < 16 ? 'lunch' : h < 22 ? 'dinner' : 'snack';
};

// One quiet "pick one" control used everywhere. The selected option is outlined, never gold.
function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-xl border border-[#3b1f0f] bg-[#150c06] p-0.5 gap-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-[10px] text-[10px] font-pixel transition-colors cursor-pointer ${
              active ? 'bg-[#3a2212] text-amber-200 border border-amber-500/50' : 'text-amber-200/70 border border-transparent hover:text-amber-200/80'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
const field =
  'w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs focus:outline-none focus:border-amber-500';
const label = 'text-[10px] font-pixel text-amber-300/85';

export default function LogMealModal({ isOpen, onClose, onLogged, recipes = [] }) {
  const [tab, setTab] = useState('describe'); // 'describe' | 'photo' | 'saved'
  const [mealType, setMealType] = useState(mealTypeNow());

  // describe
  const [dishName, setDishName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('piece');
  const [size, setSize] = useState('regular');
  const [grams, setGrams] = useState('');
  const [dishDesc, setDishDesc] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  // photo
  const [imageFile, setImageFile] = useState(null);
  const [photoNote, setPhotoNote] = useState('');
  const [eaten, setEaten] = useState(1);

  // saved recipe
  const [selectedRecipe, setSelectedRecipe] = useState('');
  const [servings, setServings] = useState(1);
  const [useGrams, setUseGrams] = useState(false);
  const [gramsInput, setGramsInput] = useState('');

  const [aiResult, setAiResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [saveAsRecipe, setSaveAsRecipe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [when, setWhen] = useState('now'); // 'now' | 'earlier' | 'yesterday'
  const [recent, setRecent] = useState([]);

  const cameraRef = useRef();
  const galleryRef = useRef();

  // Up to 5 distinct recent meals, newest first, for one-tap re-logging
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      try {
        const res = await api('/api/history?days=14');
        const data = await res.json();
        const seen = new Set();
        const list = [];
        for (const day of data.days || []) {
          for (const m of [...(day.meals || [])].reverse()) {
            const name = (m.name || '').trim();
            const key = name.toLowerCase();
            if (!name || seen.has(key)) continue;
            seen.add(key);
            list.push({ name, calories: m.calories, proteinG: m.proteinG || 0, mealType: m.mealType });
            if (list.length >= 5) break;
          }
          if (list.length >= 5) break;
        }
        if (alive) setRecent(list);
      } catch {
        if (alive) setRecent([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOpen]);

  // ---- what the AI is asked, per tab ----
  const aiBody =
    tab === 'photo'
      ? { name: photoNote.trim(), description: photoNote.trim(), imageBase64: imageFile }
      : unit === 'grams'
      ? { name: dishName.trim(), description: dishDesc.trim(), weightGram: parseFloat(grams) || undefined }
      : { name: dishName.trim(), description: dishDesc.trim(), quantity: qty, unit, size };
  const aiSig = JSON.stringify(aiBody);

  // Changing anything invalidates the previous estimate (so a stale number is never logged)
  useEffect(() => {
    setAiResult(null);
    setAiError(null);
  }, [aiSig]);

  const canEstimate =
    tab === 'photo' ? !!imageFile : dishName.trim().length > 0 && (unit !== 'grams' || parseFloat(grams) > 0);

  // ---- saved recipe maths ----
  const recipe = recipes.find((r) => r.id === selectedRecipe);
  const servingG = recipe?.servingGrams || DEFAULT_SERVING_G;
  const savedGrams = useGrams ? parseFloat(gramsInput) || 0 : Math.round(servings * servingG);
  const savedCals = recipe && savedGrams ? Math.round((savedGrams / 100) * recipe.baseCalsPer100g) : null;

  // photo: only part of the plate was eaten
  const factor = tab === 'photo' ? eaten : 1;
  const calories = aiResult ? Math.round(aiResult.calories * factor) : null;
  const protein = aiResult ? Math.round((aiResult.proteinG || 0) * factor) : null;

  const canSubmit = tab === 'saved' ? !!recipe && savedGrams > 0 : canEstimate;

  function resetModal() {
    setTab('describe');
    setMealType(mealTypeNow());
    setDishName(''); setQty(1); setUnit('piece'); setSize('regular'); setGrams(''); setDishDesc(''); setShowDetails(false);
    setImageFile(null); setPhotoNote(''); setEaten(1);
    setSelectedRecipe(''); setServings(1); setUseGrams(false); setGramsInput('');
    setAiResult(null); setAiError(null); setSaveAsRecipe(false);
    setSubmitting(false); setAnalyzing(false);
    setWhen('now');
  }

  function handleClose() {
    resetModal();
    onClose();
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same photo be picked again
    if (!file) return;
    try {
      setImageFile(await compressImageToCanvasBase64(file));
    } catch (err) {
      console.error('Image compression failed:', err);
      setAiError(t('Could not load that photo, try another one.'));
    }
  }

  async function estimate() {
    if (!canEstimate) {
      setAiError(t('Please enter a dish name or take a photo.'));
      return null;
    }
    setAnalyzing(true);
    setAiError(null);
    try {
      const res = await api('/api/ai/estimate-dish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: aiSig,
      });
      const data = await res.json();
      if (data.error) {
        setAiError(t(data.error));
        return null;
      }
      setAiResult(data);
      return data;
    } catch {
      setAiError(t('Failed to calculate nutrition.'));
      return null;
    } finally {
      setAnalyzing(false);
    }
  }

  const post = (path, body) =>
    api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  async function logAgain(item) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await post('/api/log/meal', {
        mealType: mealType,
        name: item.name,
        calories: item.calories,
        proteinG: item.proteinG || 0,
        source: 'ai_text',
        createdAt: whenToIso(when, mealType),
      });
      playSound.meal();
      onLogged?.(mealType);
      handleClose();
    } catch (err) {
      console.error(err);
      setAiError(t('Failed to calculate nutrition.'));
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (tab === 'saved') {
        await post('/api/log/meal', {
          mealType,
          name: recipe.name,
          calories: savedCals,
          proteinG: Math.round((savedGrams * (recipe.proteinPer100g || 0)) / 100),
          source: 'recipe_exact',
          recipeId: selectedRecipe,
          weightGrams: savedGrams,
          createdAt: whenToIso(when, mealType),
        });
      } else {
        const r = aiResult || (await estimate());
        if (!r) return; // estimate() already showed the error
        const f = factor;
        const cals = Math.round(r.calories * f);
        const prot = Math.round((r.proteinG || 0) * f);
        const baseName = tab === 'photo' ? photoNote.trim() || (r.detectedItems || []).slice(0, 2).join(', ') || t('Photo meal') : dishName.trim();
        const amount = tab === 'photo' ? (f < 1 ? `${Math.round(f * 100)}%` : '') : unit === 'grams' ? `${grams}${t('g')}` : `${qty} ${t(unit)}`;
        await post('/api/log/meal', {
          mealType,
          name: amount ? `${baseName} · ${amount}` : baseName,
          calories: cals,
          proteinG: prot,
          source: tab === 'photo' ? 'ai_vision' : 'ai_text',
          notes: r.hiddenTrapsNotes,
          createdAt: whenToIso(when, mealType),
        });
        if (saveAsRecipe && baseName) {
          await post('/api/recipes', {
            name: baseName,
            weightGram: r.assumedGrams || 250,
            servingGrams: r.assumedGrams || 250,
            description: dishDesc.trim() || photoNote.trim(),
          });
        }
      }
      playSound.meal();
      onLogged?.(mealType);
      handleClose();
    } catch (err) {
      console.error(err);
      setAiError(t('Failed to calculate nutrition.'));
    } finally {
      setSubmitting(false);
    }
  }

  const estimateCard = aiResult && (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#182c20] border-2 border-[#2b593f] rounded-xl p-3 space-y-1.5 shadow-inner"
    >
      <div className="flex items-center justify-between text-[10px] font-pixel text-emerald-300">
        <span>{t('✨ AI ESTIMATE')}</span>
        {aiResult.assumedGrams > 0 && <span>≈ {Math.round(aiResult.assumedGrams * factor)}{t('g')}</span>}
      </div>
      <div className="text-lg font-pixel text-amber-200">
        {t('{c} KCAL · {p}g PROTEIN', { c: calories, p: protein })}
      </div>
      {aiResult.portionNote && <div className="text-[10px] font-pixel text-emerald-200">🥄 {aiResult.portionNote}</div>}
      {aiResult.hiddenTrapsNotes && <div className="text-[9px] font-pixel text-emerald-400/80">🍃 {aiResult.hiddenTrapsNotes}</div>}
      <div className="text-[9px] font-pixel text-emerald-400/60">{t("Estimate only, it may be off.")}</div>
    </motion.div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#25150c] border-t-4 border-[#140a04] rounded-t-3xl max-h-[92dvh] overflow-y-auto pixel-box-wood text-amber-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 bg-[#4c2d19] rounded-full" />
            </div>

            <div className="p-5 space-y-4 pb-10 max-w-sm mx-auto">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#442512] pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🍱</span>
                  <h2 className="font-pixel text-xs text-amber-200">{t('FEED THE SLOTH')}</h2>
                </div>
                <button
                  onClick={handleClose}
                  aria-label={t('Close')}
                  className="p-2.5 -m-1 rounded-lg bg-[#1a0e07] text-amber-300/60 hover:text-amber-200 border border-[#3b2011]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Meal type (pre-set from the time of day) + the three ways to report */}
              <Segmented value={mealType} onChange={setMealType} options={['morning', 'lunch', 'dinner', 'snack'].map((k) => ({ value: k, label: t(k) }))} />

              {/* When was it? */}
              <div className="space-y-1">
                <label className={label}>{t('When?')}</label>
                <Segmented
                  value={when}
                  onChange={setWhen}
                  options={WHEN.map((k) => ({ value: k, label: k === 'now' ? t('Now') : k === 'earlier' ? t('Earlier today') : t('Yesterday') }))}
                />
              </div>

              {/* Recent meals: one tap logs it again */}
              {recent.length > 0 && (
                <div className="space-y-1">
                  <label className={label}>{t('Recent')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((r) => (
                      <button
                        key={r.name}
                        type="button"
                        disabled={submitting}
                        onClick={() => logAgain(r)}
                        className="min-h-11 px-3 rounded-full border border-amber-500/40 bg-[#1a0e07] text-amber-100 font-pixel text-[10px] max-w-full truncate cursor-pointer hover:bg-[#25150c] disabled:opacity-50"
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'describe', label: t('DESCRIBE'), icon: <Pencil className="w-3.5 h-3.5" /> },
                  { value: 'photo', label: t('PHOTO'), icon: <Camera className="w-3.5 h-3.5" /> },
                  { value: 'saved', label: t('SAVED'), icon: <BookOpen className="w-3.5 h-3.5" /> },
                ]}
              />

              {/* ================= DESCRIBE ================= */}
              {tab === 'describe' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className={label}>{t('WHAT DID YOU EAT? *')}</label>
                    <input
                      type="text"
                      value={dishName}
                      onChange={(e) => setDishName(e.target.value)}
                      className={field}
                      placeholder={t('e.g. cookie, cereal, salad')}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={label}>{t('HOW MUCH?')}</label>
                    <div className="flex items-stretch gap-2">
                      {unit !== 'grams' ? (
                        <div dir="ltr" className="flex items-center gap-1 bg-[#120a05] border-2 border-[#3f2413] rounded-xl px-1 py-0.5 shrink-0">
                          <button aria-label="-" onClick={() => setQty((q) => Math.max(0.5, q - 0.5))} className="p-2.5 text-amber-300 cursor-pointer">
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="font-pixel text-base w-8 text-center tabular-nums">{qty}</span>
                          <button aria-label="+" onClick={() => setQty((q) => Math.min(20, q + 0.5))} className="p-2.5 text-amber-300 cursor-pointer">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <input
                          type="number"
                          inputMode="decimal"
                          value={grams}
                          onChange={(e) => setGrams(e.target.value)}
                          className={`${field} w-24 shrink-0`}
                          placeholder="150"
                        />
                      )}
                      <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${field} flex-1`}>
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {t(u)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {unit !== 'grams' && <Segmented value={size} onChange={setSize} options={SIZES.map((sz) => ({ value: sz, label: t(sz) }))} />}
                    <p className="text-[9px] font-pixel text-amber-300/75">{t('No idea of the weight? The AI knows typical sizes.')}</p>
                  </div>

                  <button type="button" onClick={() => setShowDetails((v) => !v)} className="tap-area text-[10px] font-pixel text-emerald-400 underline cursor-pointer">
                    {showDetails ? t('HIDE DETAILS [-]') : t('ADD DETAILS (OPTIONAL) [+]')}
                  </button>
                  {showDetails && (
                    <div className="space-y-1">
                      <label className={label}>{t('DESCRIPTION & INGREDIENTS')}</label>
                      <textarea
                        value={dishDesc}
                        onChange={(e) => setDishDesc(e.target.value)}
                        className={`${field} resize-none h-16`}
                        placeholder={t('e.g. Grilled chicken breast, sweet teriyaki glaze, white rice, sesame seeds')}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ================= PHOTO ================= */}
              {tab === 'photo' && (
                <div className="space-y-3.5">
                  <div className="text-[10px] font-pixel text-emerald-400 bg-[#14281e] p-2 rounded-xl border border-emerald-800">
                    {t('📷 The AI judges the portion from the picture. No weighing needed.')}
                  </div>

                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
                  <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

                  {imageFile ? (
                    <div className="relative rounded-xl overflow-hidden border-2 border-[#4d2d17]">
                      <img src={imageFile} alt={t('Meal')} className="w-full max-h-44 object-cover" />
                      <button
                        onClick={() => setImageFile(null)}
                        aria-label={t('Delete')}
                        className="absolute top-2 end-2 p-1 bg-black/70 rounded-full text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => cameraRef.current?.click()}
                        className="py-5 rounded-xl border border-dashed border-[#4d2d17] bg-[#1a0e07] flex flex-col items-center gap-1.5 text-amber-200/70 hover:text-amber-200 cursor-pointer"
                      >
                        <Camera className="w-6 h-6 text-amber-400" />
                        <span className="text-[10px] font-pixel">{t('TAKE PHOTO')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => galleryRef.current?.click()}
                        className="py-5 rounded-xl border border-dashed border-[#4d2d17] bg-[#1a0e07] flex flex-col items-center gap-1.5 text-amber-200/70 hover:text-amber-200 cursor-pointer"
                      >
                        <ImageIcon className="w-6 h-6 text-amber-400" />
                        <span className="text-[10px] font-pixel">{t('FROM GALLERY')}</span>
                      </button>
                    </div>
                  )}

                  {imageFile && (
                    <>
                      <div className="space-y-1">
                        <label className={label}>{t('HOW MUCH DID YOU EAT?')}</label>
                        <Segmented value={eaten} onChange={setEaten} options={EATEN.map((e) => ({ value: e.value, label: e.label === 'ALL' ? t('ALL') : e.label }))} />
                      </div>
                      <div className="space-y-1">
                        <label className={label}>{t('ANYTHING HIDDEN? (OPTIONAL)')}</label>
                        <input
                          type="text"
                          value={photoNote}
                          onChange={(e) => setPhotoNote(e.target.value)}
                          className={field}
                          placeholder={t('e.g. cooked in oil, with sugar')}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ================= SAVED ================= */}
              {tab === 'saved' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className={label}>{t('SELECT RECIPE')}</label>
                    <select value={selectedRecipe} onChange={(e) => setSelectedRecipe(e.target.value)} className={field}>
                      <option value="">{t('— Select Saved Recipe —')}</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {recipe && (
                    <div className="space-y-2">
                      <label className={label}>{useGrams ? t('WEIGHT (GRAMS)') : t('HOW MANY SERVINGS?')}</label>
                      {useGrams ? (
                        <input
                          type="number"
                          inputMode="decimal"
                          value={gramsInput}
                          onChange={(e) => setGramsInput(e.target.value)}
                          className={field}
                          placeholder={t('e.g. 150')}
                        />
                      ) : (
                        <>
                          <Segmented value={servings} onChange={setServings} options={SERVING_CHIPS.map((n) => ({ value: n, label: String(n) }))} />
                          <p className="text-[9px] font-pixel text-amber-300/75">{t('1 serving ≈ {g}g', { g: Math.round(servingG) })}</p>
                        </>
                      )}
                      <button type="button" onClick={() => setUseGrams((v) => !v)} className="tap-area text-[10px] font-pixel text-emerald-400 underline cursor-pointer">
                        {useGrams ? t('USE SERVINGS INSTEAD') : t('I KNOW THE WEIGHT (GRAMS)')}
                      </button>
                    </div>
                  )}

                  {savedCals !== null && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-[#182c20] border-2 border-[#2b593f] rounded-xl p-3 flex items-center justify-between shadow-inner"
                    >
                      <div>
                        <div className="text-xl font-pixel text-emerald-300">{t('{c} KCAL', { c: savedCals })}</div>
                        <div className="text-[9px] font-pixel text-emerald-400/60 mt-0.5">
                          ({savedGrams}{t('g')} × {t('{n} kcal/100g', { n: recipe.baseCalsPer100g })})
                        </div>
                      </div>
                      <span className="text-2xl">✨</span>
                    </motion.div>
                  )}
                </div>
              )}

              {/* AI estimate + errors (describe / photo) */}
              {tab !== 'saved' && estimateCard}
              {aiError && (
                <div className="flex items-start gap-2 bg-rose-950/60 border border-rose-600/40 rounded-xl p-2.5 text-xs font-pixel text-rose-300">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {aiError}
                </div>
              )}

              {tab !== 'saved' && (
                <>
                  <button
                    type="button"
                    onClick={estimate}
                    disabled={analyzing || !canEstimate}
                    className="w-full py-2.5 rounded-xl font-pixel text-[10px] flex items-center justify-center gap-1.5 bg-[#180e07] border border-amber-600/40 text-amber-200 hover:bg-[#25150c] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {analyzing ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('AI CALCULATING...')}</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5 text-amber-400" /> {t('CHECK CALORIES FIRST')}</>
                    )}
                  </button>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAsRecipe}
                      onChange={(e) => setSaveAsRecipe(e.target.checked)}
                      className="rounded border-[#3f2413] bg-[#120a05] text-amber-500 focus:ring-0"
                    />
                    <span className="text-[10px] font-pixel text-amber-200/80">{t('📜 Also save to permanent Recipe Scrolls')}</span>
                  </label>
                </>
              )}

              {/* Log it */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting || analyzing}
                className={`w-full py-3 rounded-xl font-pixel text-xs transition-all flex items-center justify-center gap-2 ${
                  canSubmit && !submitting
                    ? 'pixel-btn-gold cursor-pointer'
                    : 'bg-[#180e08] text-amber-200/20 border border-[#2b170c] cursor-not-allowed'
                }`}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('CONFIRM & FEED THE SLOTH 🍃')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
