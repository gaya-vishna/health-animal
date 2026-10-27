import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PixelGameHud from '../components/PixelGameHud';
import MascotWidget from '../components/MascotWidget';
import FoodInventoryDock from '../components/FoodInventoryDock';
import QuickWidgets from '../components/QuickWidgets';
import LogMealModal from '../components/LogMealModal';
import WeighInModal from '../components/WeighInModal';
import { useSearchParams } from 'react-router-dom';
import { playSound } from '../utils/audioHaptics';
import { api } from '../utils/api';
import { mealLogged } from '../utils/reminders';
import { t } from '../utils/i18n';


export default function DashboardView() {
  const [dashboard, setDashboard] = useState({
    totalCals: 0,
    totalWaterMl: 0,
    proteinHit: false,
    targetMin: 1450,
    targetMax: 1550,
    energyLevel: 100,
    currentMood: 'chill',
    streakDays: 0,
    bedtimeReminderTime: '23:00',
  });
  const [recipes, setRecipes] = useState([]);
  const [logOpen, setLogOpen] = useState(false);

  // The nav-bar FEED button links to /dashboard?feed=1 from any tab
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('feed')) {
      setLogOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [weighInOpen, setWeighInOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [journalOpen, setJournalOpen] = useState(false);
  const [isDancing, setIsDancing] = useState(false);
  const [eatingFood, setEatingFood] = useState(null);
  const [isDrinking, setIsDrinking] = useState(false);

  // Weekly checkin state
  const [checkinData, setCheckinData] = useState({
    needsCheckin: false,
    currentWeight: 75,
    startWeight: 80,
    goalWeight: 70,
    weightLost: 0,
    goalDirection: 'lose',
    progressKg: 0,
  });

  const fetchDashboard = useCallback(async () => {
    try {
      const [dashRes, recipeRes, checkinRes] = await Promise.all([
        api('/api/dashboard'),
        api('/api/recipes'),
        api('/api/checkin/status'),
      ]);
      const dashData = await dashRes.json();
      const recipeData = await recipeRes.json();
      const checkinInfo = await checkinRes.json();

      setDashboard(dashData);
      setRecipes(recipeData.recipes || []);
      if (checkinInfo && !checkinInfo.error) {
        setCheckinData(checkinInfo);
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Sloth munches the food (~2.5s, with chomp sounds), then does the happy dance.
  const FOODS = ['🍎', '🥑', '🍣', '🍙', '🥗', '🍞', '🥕', '🍌'];
  function triggerEat(emoji) {
    setEatingFood(emoji || FOODS[Math.floor(Math.random() * FOODS.length)]);
    playSound.chomp();
    setTimeout(() => playSound.chomp(), 600);
    setTimeout(() => playSound.chomp(), 1200);
    setTimeout(() => {
      setEatingFood(null);
      triggerHappyDance();
    }, 2500);
  }

  function triggerDrink() {
    setIsDrinking(true);
    setTimeout(() => setIsDrinking(false), 2400);
  }

  function triggerHappyDance() {
    setIsDancing(true);
    setTimeout(() => {
      setIsDancing(false);
    }, 4500);
  }

  // Quick Feed action from circular food inventory dock
  async function handleQuickFeed(item) {
    try {
      triggerEat(item.emoji);

      const currentHour = new Date().getHours();
      let defaultMealType = 'snack';
      if (currentHour >= 6 && currentHour < 11) defaultMealType = 'morning';
      else if (currentHour >= 11 && currentHour < 16) defaultMealType = 'lunch';
      else if (currentHour >= 16 && currentHour < 22) defaultMealType = 'dinner';

      if (item.cals > 0) {
        mealLogged(defaultMealType);
        await api('/api/log/meal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: t(item.label),
            calories: item.cals,
            mealType: defaultMealType,
            source: 'recipe_exact',
            notes: `Fed to Sloth via quick dock ${item.emoji}`,
          }),
        });
      }

      if (item.waterMl > 0) {
        await api('/api/log/water', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ml: item.waterMl }),
        });
      }

      if (item.setProteinHit) {
        await api('/api/log/protein', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hit: true }),
        });
      }

      fetchDashboard();
    } catch (err) {
      console.error('Quick feed error:', err);
    }
  }

  async function handleAddWater(ml) {
    await api('/api/log/water', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ml }),
    });
    playSound.water();
    triggerDrink();
    fetchDashboard();
  }

  async function handleToggleProtein() {
    playSound.checkin();
    await api('/api/log/protein', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hit: !dashboard.proteinHit }),
    });
    fetchDashboard();
  }

  async function handleWorkout(type, durationMin) {
    const body = typeof type === 'object' ? type : { type, durationMin };
    await api('/api/log/workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const goalDirection = dashboard.goalDirection || checkinData.goalDirection || 'maintain';

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#0d1f17]">
        <motion.div
          animate={{ rotate: [0, 360], scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="text-4xl"
        >
          🦥
        </motion.div>
        <span className="font-pixel text-xs text-emerald-400/80">{t('WAKING UP SLOTH...')}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto safe-bottom bg-[#0a1811] pixel-crt">
      <div className="max-w-sm mx-auto px-3 py-3 space-y-3">
        {/* Top Game HUD with 🍗 Fuel, ⚡ Energy, 😃 Vibe Bars */}
        <PixelGameHud
          totalCals={dashboard.totalCals}
          targetMin={dashboard.targetMin}
          targetMax={dashboard.targetMax}
          totalWaterMl={dashboard.totalWaterMl}
          proteinHit={dashboard.proteinHit}
          energyLevel={dashboard.energyLevel}
          streakDays={dashboard.streakDays}
          onOpenLogModal={() => setLogOpen(true)}
        />

        {/* Centerpiece: Forest Glade with Sloth (עצלן) Mascot */}
        <div className="relative">
          <MascotWidget
            totalCals={dashboard.totalCals}
            targetMin={dashboard.targetMin}
            targetMax={dashboard.targetMax}
            lastMealAt={dashboard.lastMealAt}
            loggedMealTypes={dashboard.loggedMealTypes}
            mealSchedule={dashboard.mealSchedule}
            isDancing={isDancing}
            eatingFood={eatingFood}
            isDrinking={isDrinking}
            needsCheckin={checkinData.needsCheckin}
            goalDirection={goalDirection}
            progressPercent={checkinData.progressPercent}
            weightProgress={checkinData.progressKg}
            onOpenWeighIn={() => setWeighInOpen(true)}
            onTaunt={() => playSound.checkin()}
          />
        </div>

        {/* Main call to action: log what you ate */}
        <motion.button
          id="feed-me-btn"
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            playSound.meal();
            setLogOpen(true);
          }}
          className="w-full py-3.5 rounded-2xl pixel-btn-gold text-amber-950 font-pixel text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
        >
          <span className="text-lg">🍽️</span> {t('FEED ME — LOG A MEAL')}
        </motion.button>

        {/* Bottom Circular Food Inventory Shelf */}
        <FoodInventoryDock
          onQuickFeed={handleQuickFeed}
          onOpenFullLog={() => {
            playSound.meal();
            setLogOpen(true);
          }}
        />

        {/* Camp Journal & Training Drawer */}
        <div className="pt-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="font-pixel text-[10px] text-amber-300/80 flex items-center gap-1.5">
              <span>🎒</span> {t('CAMP SUPPLIES')}
            </span>
            <button
              onClick={() => setJournalOpen(!journalOpen)}
              className="tap-area font-pixel text-[9px] text-emerald-400 underline hover:text-emerald-300 cursor-pointer"
            >
              {journalOpen ? t('HIDE [-]') : t('DETAILS [+]')}
            </button>
          </div>

          <AnimatePresence initial={false}>
            {journalOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-2.5 pb-2"
              >
                <QuickWidgets
                  totalWaterMl={dashboard.totalWaterMl}
                  proteinHit={dashboard.proteinHit}
                  bedtimeTime={dashboard.bedtimeReminderTime}
                  onAddWater={handleAddWater}
                  onToggleProtein={handleToggleProtein}
                  onLogWorkout={handleWorkout}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Zero Shame Daily Footer */}
        <div className="text-center font-pixel text-[9px] text-emerald-500/40 py-1">
          {t('GRAVITY RESETS DAILY · ZERO SHAME · 🦥')}
        </div>
      </div>

      <LogMealModal
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        onLogged={(mealType) => {
          mealLogged(mealType);
          triggerEat();
          fetchDashboard();
        }}
        recipes={recipes}
      />

      <WeighInModal
        isOpen={weighInOpen}
        onClose={() => setWeighInOpen(false)}
        currentWeight={checkinData.currentWeight}
        startWeight={checkinData.startWeight}
        goalWeight={checkinData.goalWeight}
        goalDirection={goalDirection}
        progressPercent={checkinData.progressPercent}
        onWeightUpdated={() => {
          fetchDashboard();
        }}
      />
    </div>
  );
}
