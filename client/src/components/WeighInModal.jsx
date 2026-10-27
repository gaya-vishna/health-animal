import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Scale, Sparkles, Loader2 } from 'lucide-react';
import { playSound } from '../utils/audioHaptics';
import { api } from '../utils/api';
import { t } from '../utils/i18n';
import { useSlothName } from '../utils/slothName';
import { goalDirectionOf } from '../utils/goal';


export default function WeighInModal({
  isOpen,
  onClose,
  currentWeight = 75,
  startWeight: startWeightProp = 80,
  goalWeight = 70,
  goalDirection,
  onWeightUpdated,
}) {
  const slothName = useSlothName();
  const [weight, setWeight] = useState(String(currentWeight || 75));
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState(null);
  const [startOverride, setStartOverride] = useState(null);
  const [savingStart, setSavingStart] = useState(false);
  const startWeight = startOverride ?? startWeightProp;

  // useState only initializes once: re-seed the input (and drop any local
  // start override) every time the modal opens with freshly fetched data
  useEffect(() => {
    if (isOpen) {
      setWeight(String(currentWeight || 75));
      setStartOverride(null);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const numWeight = parseFloat(weight) || currentWeight;
  const diffFromStart = Math.round((startWeight - numWeight) * 10) / 10;
  const diffFromPrev = Math.round((currentWeight - numWeight) * 10) / 10;
  // The goal decides what counts as progress
  const dir = goalDirection || goalDirectionOf(startWeight, goalWeight);
  const gaining = dir === 'gain';
  const maintaining = dir === 'maintain';
  const distFromGoal = Math.round(Math.abs(numWeight - goalWeight) * 10) / 10;

  const farFromStart = Number.isFinite(parseFloat(weight)) && Math.abs(numWeight - startWeight) > 5;

  async function handleUseAsStart() {
    setSavingStart(true);
    try {
      const res = await api('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startWeightKg: numWeight }),
      });
      if (res && res.ok === false) throw new Error('save failed');
      setStartOverride(numWeight);
      onWeightUpdated?.();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingStart(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!numWeight) return;
    setSubmitting(true);
    try {
      const res = await api('/api/checkin/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightKg: numWeight }),
      });
      const data = await res.json();
      playSound.checkin();

      if (maintaining) {
        setResultMsg(distFromGoal <= 1.5
          ? t('✨ Holding steady near your goal, {name} approves 🦥', { name: slothName })
          : t('🍃 Recorded. A little drift is normal, we keep going 🐾'));
      } else if (gaining) {
        if (diffFromPrev < 0) {
          setResultMsg(t('🎉 +{n}kg! {name} is getting stronger! 💪', { n: Math.abs(diffFromPrev), name: slothName }));
        } else if (diffFromPrev > 0) {
          setResultMsg(t('🍃 -{n}kg recorded. Time to get some fuel in, zero shame 🐾', { n: diffFromPrev }));
        } else {
          setResultMsg(t('✨ Steady weight recorded! {name} loves consistency 🦥', { name: slothName }));
        }
      } else if (diffFromPrev > 0) {
        setResultMsg(t('🎉 -{n}kg toward your goal! 🦥', { n: diffFromPrev }));
      } else if (diffFromPrev < 0) {
        setResultMsg(t('🍃 +{n}kg recorded. Weight wiggles day to day, zero shame 🐾', { n: Math.abs(diffFromPrev) }));
      } else {
        setResultMsg(t('✨ Steady weight recorded! {name} loves consistency 🦥', { name: slothName }));
      }

      setTimeout(() => {
        onWeightUpdated?.(numWeight);
        onClose();
        setResultMsg(null);
      }, 2200);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="pixel-box-wood w-full max-w-sm p-5 rounded-2xl space-y-4 shadow-2xl text-amber-100 relative"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#442512] pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚖️</span>
                <h3 className="font-pixel text-xs text-amber-200">{t('WEEKLY WEIGH-IN')}</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-amber-300/60 hover:text-amber-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[10px] font-pixel text-emerald-300/90 bg-[#14281e] p-2 rounded-xl border border-emerald-800">
              {t('🦥 Weigh-ins are just data. Zero shame, zero judgment!')}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-pixel text-amber-300/70">{t("THIS WEEK'S WEIGHT (KG)")}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="flex-1 bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2.5 font-pixel text-base focus:outline-none focus:border-amber-500"
                    placeholder={t('e.g. 74.5')}
                    autoFocus
                  />
                  <span className="font-pixel text-xs text-amber-400">{t('KG')}</span>
                </div>
              </div>

              {/* Progress Summary */}
              <div className="bg-[#182c20] border border-[#2b593f] rounded-xl p-2.5 text-[10px] font-pixel space-y-1">
                <div className="flex justify-between text-amber-200/80">
                  <span>{t('Start: {n}kg', { n: startWeight })}</span>
                  <span>{t('Goal: {n}kg', { n: goalWeight })}</span>
                </div>
                <div className="text-emerald-300">
                  {maintaining
                    ? t('Distance from goal: {n}kg', { n: distFromGoal })
                    : gaining
                    ? (diffFromStart < 0 ? t('🎉 Gained since start: +{n}kg!', { n: Math.abs(diffFromStart) }) : diffFromStart > 0 ? t('Change since start: -{n}kg', { n: diffFromStart }) : t('At starting weight'))
                    : (diffFromStart > 0 ? t('🎉 Lost since start: -{n}kg!', { n: diffFromStart }) : diffFromStart < 0 ? t('Change since start: +{n}kg', { n: Math.abs(diffFromStart) }) : t('At starting weight'))}
                </div>
              </div>

              {farFromStart && (
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-700 text-[10px] font-pixel text-amber-200/90 space-y-1.5">
                  <p>{t("That's quite far from your start weight ({s}kg). Typo? Or make {w}kg your new start?", { s: startWeight, w: numWeight })}</p>
                  <button
                    type="button"
                    onClick={handleUseAsStart}
                    disabled={savingStart}
                    className="pixel-btn-wood px-2 py-1 rounded-lg font-pixel text-[10px]"
                  >
                    {savingStart ? <Loader2 className="w-3 h-3 animate-spin" /> : t('Use as new start')}
                  </button>
                </div>
              )}

              {resultMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-2 rounded-xl bg-amber-500/20 border border-amber-400 text-center font-pixel text-xs text-amber-200"
                >
                  {resultMsg}
                </motion.div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="pixel-btn-wood flex-1 py-2.5 rounded-xl font-pixel text-xs"
                >
                  {t('LATER')}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !numWeight}
                  className="pixel-btn-gold flex-1 py-2.5 rounded-xl font-pixel text-xs text-amber-950 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('RECORD 🦥')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
