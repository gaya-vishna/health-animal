import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playSound } from '../utils/audioHaptics';
import { t } from '../utils/i18n';

// --- Water Canteen Widget ---
function WaterWidget({ totalMl = 0, onAdd }) {
  const [splashing, setSplashing] = useState(false);

  const handleAdd = async () => {
    setSplashing(true);
    playSound.water();
    setTimeout(() => setSplashing(false), 600);
    await onAdd(250);
  };

  const glasses = Math.round(totalMl / 250);
  const goalGlasses = 8;

  return (
    <motion.button
      id="water-widget"
      whileTap={{ scale: 0.94 }}
      onClick={handleAdd}
      className="pixel-box-wood flex-1 p-3 rounded-2xl flex flex-col gap-1.5 cursor-pointer text-start relative overflow-hidden"
    >
      <div className="flex items-center justify-between">
        <span className="text-lg">🍶</span>
        <span className="text-[9px] font-pixel text-cyan-300 bg-[#122b27] px-1.5 py-0.5 rounded border border-cyan-800">
          {t('+250ml')}
        </span>
      </div>
      <div className="text-base font-pixel text-cyan-200">
        {(totalMl / 1000).toFixed(1)}L
      </div>
      <div className="flex gap-1">
        {Array.from({ length: goalGlasses }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-sm border border-black/40 ${
              i < glasses ? 'bg-cyan-400' : 'bg-black/40'
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] font-pixel text-amber-200/70">{glasses}/{goalGlasses} {t('cups')}</span>

      {/* Splash animation */}
      <AnimatePresence>
        {splashing && (
          <motion.div
            key="splash"
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 2.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="w-12 h-12 rounded-full bg-cyan-400/40" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// --- Protein Crystal Widget ---
function ProteinWidget({ hit = false, onToggle }) {
  return (
    <motion.button
      id="protein-widget"
      whileTap={{ scale: 0.94 }}
      onClick={onToggle}
      className={`pixel-box-wood flex-1 p-3 rounded-2xl flex flex-col gap-1.5 cursor-pointer text-start transition-all ${
        hit ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg">{hit ? '🥩' : '🍗'}</span>
        <span className="text-[9px] font-pixel text-amber-300 bg-[#351c0d] px-1.5 py-0.5 rounded border border-amber-800">
          {t('FLOOR')}
        </span>
      </div>
      <div className={`text-base font-pixel ${hit ? 'text-emerald-300' : 'text-stone-300'}`}>
        {hit ? t('HIT! ✓') : t('TAP LOG')}
      </div>
      <span className="text-[10px] font-pixel text-amber-200/70">{t('80–100g target')}</span>
    </motion.button>
  );
}

// --- Workout Training Widget ---
function WorkoutWidget({ onLog }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('cardio');
  const [duration, setDuration] = useState(30);

  const handleLog = async () => {
    playSound.workout();
    await onLog({ type, durationMin: duration });
    setOpen(false);
  };

  return (
    <>
      <motion.button
        id="workout-widget"
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(true)}
        className="pixel-box-wood flex-1 p-3 rounded-2xl flex flex-col gap-1.5 cursor-pointer text-start"
      >
        <div className="flex items-center justify-between">
          <span className="text-lg">⚔️</span>
          <span className="text-[9px] font-pixel text-purple-300 bg-[#281536] px-1.5 py-0.5 rounded border border-purple-800">
            {t('ACTIVE')}
          </span>
        </div>
        <div className="text-base font-pixel text-purple-200">{t('TRAIN')}</div>
        <span className="text-[10px] font-pixel text-amber-200/70">{t('Log quest 🏃')}</span>
      </motion.button>

      {/* Mini workout modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="pixel-box-wood w-full max-w-sm p-5 rounded-2xl space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#5a361e] pb-2">
                <h3 className="font-pixel text-xs text-amber-300 flex items-center gap-2">
                  <span>⚔️</span> {t('LOG ACTIVITY')}
                </h3>
                <button onClick={() => setOpen(false)} className="text-xs text-amber-300/60 font-pixel">✕</button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {['cardio', 'strength', 'walk', 'yoga'].map((k) => (
                    <button
                      key={k}
                      onClick={() => setType(k)}
                      className={`p-2 rounded-xl text-xs font-pixel uppercase transition-all ${
                        type === k 
                          ? 'pixel-btn-gold text-amber-950 font-bold' 
                          : 'bg-[#221309] text-amber-200/70 border border-[#442714]'
                      }`}
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-[#1c0f07] border border-[#3e210e]">
                  <span className="text-xs font-pixel text-amber-200/80">{t('Duration:')}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                      className="bg-black/50 border border-amber-900/60 text-amber-100 rounded-lg px-2 py-1 text-center font-pixel text-xs w-16"
                      min={5}
                      max={180}
                    />
                    <span className="text-[10px] font-pixel text-amber-400">{t('MIN')}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setOpen(false)} className="pixel-btn-wood flex-1 py-2 rounded-xl text-xs font-pixel">
                  {t('BACK')}
                </button>
                <button onClick={handleLog} className="pixel-btn-action flex-1 py-2 rounded-xl text-xs font-pixel">
                  {t('RECORD!')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// --- Bedtime Campfire Widget ---
function BedtimeWidget({ bedtimeTime = '23:00' }) {
  const [hour, minute] = bedtimeTime.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const diffMs = target - now;
  const diffH = Math.floor(diffMs / 3600000);
  const diffM = Math.floor((diffMs % 3600000) / 60000);
  const isSoon = diffH < 1;

  return (
    <motion.div
      className={`pixel-box-wood flex-1 p-3 rounded-2xl flex flex-col gap-1.5 ${
        isSoon ? 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg">🏕️</span>
        <span className="text-[9px] font-pixel text-amber-300 bg-[#351c0d] px-1.5 py-0.5 rounded border border-amber-800">
          {t('CAMP')}
        </span>
      </div>
      <div className={`text-base font-pixel ${isSoon ? 'text-amber-300' : 'text-stone-300'}`}>
        {bedtimeTime}
      </div>
      <span className="text-[10px] font-pixel text-amber-200/70">
        {isSoon ? t('⚠️ Sleep soon!') : t('{h}h {m}m left', { h: diffH, m: diffM })}
      </span>
    </motion.div>
  );
}

// --- Main QuickWidgets export ---
export default function QuickWidgets({
  totalWaterMl,
  proteinHit,
  bedtimeTime,
  onAddWater,
  onToggleProtein,
  onLogWorkout,
}) {
  return (
    <div className="space-y-2.5 max-w-sm mx-auto">
      <div className="flex gap-2.5">
        <WaterWidget totalMl={totalWaterMl} onAdd={onAddWater} />
        <ProteinWidget hit={proteinHit} onToggle={onToggleProtein} />
      </div>
      <div className="flex gap-2.5">
        <WorkoutWidget onLog={onLogWorkout} />
        <BedtimeWidget bedtimeTime={bedtimeTime} />
      </div>
    </div>
  );
}
