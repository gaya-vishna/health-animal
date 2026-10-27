import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronDown, X } from 'lucide-react';
import { api } from '../utils/api';
import { t, getLang } from '../utils/i18n';

const litres = (ml) => (ml / 1000).toFixed(1);

function dayLabel(dateKey, index) {
  if (index === 0) return t('Today');
  if (index === 1) return t('Yesterday');
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString(getLang() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function Chip({ emoji, children, tone = 'text-amber-200/80' }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-pixel ${tone}`}>
      <span>{emoji}</span>
      {children}
    </span>
  );
}

function EntryRow({ time, children, right, onDelete }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[#3a2212]/60 last:border-0">
      <span className="text-[10px] font-pixel text-amber-300/50 tabular-nums w-14 shrink-0">{time}</span>
      <div className="flex-1 min-w-0 text-[11px] font-pixel text-amber-100 truncate">{children}</div>
      {right && <span className="text-[10px] font-pixel text-amber-300/80 shrink-0">{right}</span>}
      <button
        onClick={onDelete}
        aria-label={t('Delete')}
        className="p-2.5 -m-1 text-amber-300/40 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function HistoryView() {
  const [range, setRange] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState({ 0: true });

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/history?days=${range}`);
      if (!res.ok) throw new Error('bad');
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, [range]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  async function remove(kind, id) {
    if (!window.confirm(t('Delete this entry?'))) return;
    await api(`/api/${kind}/${id}`, { method: 'DELETE' });
    load();
  }

  if (error) {
    return <div className="flex-1 flex items-center justify-center text-xs font-pixel text-rose-300 px-6 text-center">{t('Could not load history.')}</div>;
  }
  if (!data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#0b1912]">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        <span className="font-pixel text-xs text-amber-300">{t('LOADING JOURNAL...')}</span>
      </div>
    );
  }

  const { days, targets, summary } = data;

  return (
    <div className="flex-1 overflow-y-auto safe-bottom bg-[#0b1912] pixel-crt text-amber-100">
      <div className="max-w-sm mx-auto px-4 py-4 space-y-3">
        {/* Title + range toggle */}
        <div className="flex items-center justify-between">
          <h1 className="font-pixel text-xs text-amber-200 flex items-center gap-2 whitespace-nowrap">
            <span>📖</span> {t('MY JOURNAL')}
          </h1>
          <div className="flex rounded-lg overflow-hidden border border-[#3d2212]">
            {[7, 30].map((n) => (
              <button
                key={n}
                onClick={() => setRange(n)}
                className={`px-2.5 py-2.5 text-[10px] font-pixel cursor-pointer whitespace-nowrap ${
                  range === n ? 'bg-[#3d2212] text-amber-200' : 'text-amber-100/40'
                }`}
              >
                {t('{n} days', { n })}
              </button>
            ))}
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="pixel-box-wood rounded-xl p-2.5 text-center">
            <div className="text-[9px] font-pixel text-cyan-300/80">{t('AVG WATER')}</div>
            <div className="text-sm font-pixel text-cyan-200 mt-1 whitespace-nowrap">{t('{n} L', { n: litres(summary.avgWaterMl) })}</div>
          </div>
          <div className="pixel-box-wood rounded-xl p-2.5 text-center">
            <div className="text-[9px] font-pixel text-purple-300/80 whitespace-nowrap">{t('WORKOUTS')}</div>
            <div className="text-sm font-pixel text-purple-200 mt-1 whitespace-nowrap">{t('{n} days', { n: summary.workoutDays })}</div>
            <div className="text-[9px] font-pixel text-amber-200/50">{t('{n} min', { n: summary.workoutMinutes })}</div>
          </div>
          <div className="pixel-box-wood rounded-xl p-2.5 text-center">
            <div className="text-[9px] font-pixel text-orange-300/80">{t('AVG FUEL')}</div>
            <div className="text-sm font-pixel text-orange-200 mt-1">{summary.avgCalories}</div>
            <div className="text-[9px] font-pixel text-amber-200/50">{t('KCAL')}</div>
          </div>
        </div>

        {/* Day cards */}
        <div className="space-y-2 pb-2">
          {days.map((d, i) => {
            const empty = !d.calories && !d.waterMl && !d.workouts.length && !d.weighIn;
            const minutes = d.workouts.reduce((s, w) => s + w.durationMin, 0);
            const isOpen = !!open[i];
            return (
              <div key={d.date} className={`pixel-box-wood rounded-2xl ${empty ? 'opacity-50' : ''}`}>
                <button
                  disabled={empty}
                  onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-start cursor-pointer disabled:cursor-default"
                >
                  <div className="min-w-0">
                    <div className="font-pixel text-xs text-amber-100">{dayLabel(d.date, i)}</div>
                    {empty ? (
                      <div className="text-[10px] font-pixel text-amber-200/40 mt-1">{t('Nothing logged')}</div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        {d.calories > 0 && <Chip emoji="🍗" tone="text-orange-200">{d.calories}</Chip>}
                        {d.waterMl > 0 && <Chip emoji="💧" tone="text-cyan-200">{t('{n} L', { n: litres(d.waterMl) })}</Chip>}
                        {minutes > 0 && <Chip emoji="⚔️" tone="text-purple-200">{t('{n} min', { n: minutes })}</Chip>}
                        {d.weighIn && <Chip emoji="⚖️">{t('{n}kg', { n: d.weighIn })}</Chip>}
                      </div>
                    )}
                  </div>
                  {!empty && <ChevronDown className={`w-4 h-4 text-amber-300/50 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && !empty && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-3 space-y-3">
                        {d.meals.length > 0 && (
                          <div>
                            <div className="text-[9px] font-pixel text-orange-300/70 mb-0.5">{t('MEALS')}</div>
                            {d.meals.map((m) => (
                              <EntryRow
                                key={m.id}
                                time={m.time}
                                right={t('{n} kcal', { n: m.calories })}
                                onDelete={() => remove('log', m.id)}
                              >
                                {m.name || t(m.mealType)}
                              </EntryRow>
                            ))}
                          </div>
                        )}
                        {d.water.length > 0 && (
                          <div>
                            <div className="text-[9px] font-pixel text-cyan-300/70 mb-0.5">{t('WATER')}</div>
                            {d.water.map((w) => (
                              <EntryRow key={w.id} time={w.time} right={`+${w.ml}${t('ml')}`} onDelete={() => remove('log', w.id)}>
                                💧
                              </EntryRow>
                            ))}
                          </div>
                        )}
                        {d.workouts.length > 0 && (
                          <div>
                            <div className="text-[9px] font-pixel text-purple-300/70 mb-0.5">{t('WORKOUTS')}</div>
                            {d.workouts.map((w) => (
                              <EntryRow
                                key={w.id}
                                time={w.time}
                                right={t('{n} min', { n: w.durationMin })}
                                onDelete={() => remove('workout', w.id)}
                              >
                                {t(w.type)}
                              </EntryRow>
                            ))}
                          </div>
                        )}
                        {d.proteinHit && <div className="text-[10px] font-pixel text-emerald-300">{t('Protein goal hit ✓')}</div>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
