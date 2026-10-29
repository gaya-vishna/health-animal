import React from 'react';
import { motion } from 'framer-motion';
import { t } from '../utils/i18n';

export default function PixelGameHud({
  totalCals = 0,
  targetMin = 1450,
  targetMax = 1550,
  totalWaterMl = 0,
  waterTarget = 2500,
  proteinG = 0,
  proteinTargetG = 0,
  energyLevel = 100,
  streakDays = 0,
  goalDirection = 'maintain',
  onOpenLogModal,
  onOpenQuickWater,
}) {
  // Calculate percentage fills
  // Gainers fill the bar toward the minimum target; everyone else toward the upper end
  const gaining = goalDirection === 'gain';
  const calGoal = gaining ? targetMin : targetMax;
  const calPercent = Math.min(100, Math.max(0, (totalCals / (calGoal || 1)) * 100));
  const waterPercent = Math.min(100, Math.max(0, (totalWaterMl / waterTarget) * 100));
  const proteinReached = proteinTargetG > 0 && proteinG >= proteinTargetG;
  const proteinPercent = proteinTargetG > 0 ? Math.min(100, Math.max(0, (proteinG / proteinTargetG) * 100)) : 0;

  return (
    <div className="w-full px-4 pt-2 pb-1 space-y-3">
      {/* Top Currency / Badge Row */}
      <div className="flex items-center justify-between gap-3 max-w-sm mx-auto">
        {/* Gold Acorn / Calorie Bank Badge */}
        <motion.div 
          whileTap={{ scale: 0.95 }}
          className="flex-1 pixel-badge px-3 py-1.5 flex items-center justify-between cursor-pointer border-[#5c3a1e]"
          title={t('Daily Fuel Bank')}
          onClick={onOpenLogModal}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-b from-yellow-400 to-amber-600 flex items-center justify-center text-xs shadow-sm border border-amber-900 font-pixel">
              🌰
            </div>
            <span className="font-pixel text-[11px] text-amber-200 tracking-wider">
              {totalCals > 0 ? `${totalCals}` : '0'} <span className="text-[8px] text-amber-400/80">{t('KCAL')}</span>
            </span>
          </div>
          <div className="w-4 h-4 rounded bg-amber-600/60 border border-amber-500/80 flex items-center justify-center text-[10px] text-amber-200 font-pixel font-bold">
            +
          </div>
        </motion.div>

        {/* Pink Gem / Streak & Rescue Token Badge */}
        <motion.div 
          whileTap={{ scale: 0.95 }}
          className="flex-1 pixel-badge px-3 py-1.5 flex items-center justify-between cursor-pointer border-[#4e203c]"
          title={t('Days you and your sloth have spent together')}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-600 flex items-center justify-center text-xs shadow-sm border border-rose-950">
              💎
            </div>
            <span className="font-pixel text-[11px] text-pink-200 tracking-wider">
              {streakDays} <span className="text-[10px] text-pink-400/80">{t('days together')}</span>
            </span>
          </div>
          <div className="w-4 h-4 rounded bg-rose-600/60 border border-rose-500/80 flex items-center justify-center text-[10px] text-pink-200 font-pixel font-bold">
            +
          </div>
        </motion.div>
      </div>

      {/* 3 Pixel Vitality Bars (Fuel, Water, Protein) */}
      <div className="max-w-sm mx-auto space-y-2">
        {/* 🍗 Fuel (Calories) Bar */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2b170c] border-2 border-[#160c06] flex items-center justify-center text-base shadow-sm shrink-0">
            🍗
          </div>
          <div className="flex-1 relative">
            <div className="h-[18px] pixel-bar-track rounded-full overflow-hidden p-0.5 flex items-center">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-amber-400 shadow-inner"
                initial={{ width: 0 }}
                animate={{ width: `${calPercent > 0 ? Math.max(4, calPercent) : 0}%` }}
                transition={{ type: 'spring', damping: 15, stiffness: 120 }}
              />
            </div>
            <div className="flex justify-between items-center px-1 mt-0.5 text-[10px] font-pixel text-amber-100/70">
              <span>{t('FUEL')}</span>
              <span><bdi dir="ltr">{totalCals} / {calGoal}</bdi> {t('kcal')}</span>
            </div>
          </div>
        </div>

        {/* 💧 Water Bar */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2b170c] border-2 border-[#160c06] flex items-center justify-center text-base shadow-sm shrink-0">
            💧
          </div>
          <div className="flex-1 relative">
            <div className="h-[18px] pixel-bar-track rounded-full overflow-hidden p-0.5 flex items-center">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 shadow-inner"
                initial={{ width: 0 }}
                animate={{ width: `${waterPercent > 0 ? Math.max(4, waterPercent) : 0}%` }}
                transition={{ type: 'spring', damping: 15, stiffness: 120 }}
              />
            </div>
            <div className="flex justify-between items-center px-1 mt-0.5 text-[10px] font-pixel text-yellow-200/70">
              <span>{t('WATER')}</span>
              <span><bdi dir="ltr">{totalWaterMl} / {waterTarget}</bdi> {t('ml')}</span>
            </div>
          </div>
        </div>

        {/* 💪 Protein Bar */}
        {proteinTargetG > 0 ? (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2b170c] border-2 border-[#160c06] flex items-center justify-center text-base shadow-sm shrink-0">
            💪
          </div>
          <div className="flex-1 relative">
            <div className="h-[18px] pixel-bar-track rounded-full overflow-hidden p-0.5 flex items-center">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 shadow-inner"
                initial={{ width: 0 }}
                animate={{ width: `${proteinPercent > 0 ? Math.max(4, proteinPercent) : 0}%` }}
                transition={{ type: 'spring', damping: 15, stiffness: 120 }}
              />
            </div>
            <div className="flex justify-between items-center px-1 mt-0.5 text-[10px] font-pixel text-cyan-200/80">
              <span>{t('PROTEIN')}</span>
              <span><bdi dir="ltr">{proteinG} / {proteinTargetG}</bdi> {t('g')}{proteinReached ? ' ✓' : ''}</span>
            </div>
          </div>
        </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2b170c] border-2 border-[#160c06] flex items-center justify-center text-base shadow-sm shrink-0">
              💪
            </div>
            <span className="text-[11px] font-pixel text-cyan-200/80">{t('Set your weight in Settings to get a protein goal')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
