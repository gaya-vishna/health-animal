import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playSound } from '../utils/audioHaptics';
import { t } from '../utils/i18n';
import { isOverComfort } from '../utils/goal';
import { useSlothName } from '../utils/slothName';

const CRAVING_ITEMS = ['🍃', '🍉', '🍎', '🍣', '🥥', '🥑', '✨', '💤'];

export default function MascotWidget({
  totalCals = 0,
  targetMin = 1450,
  targetMax = 1550,
  lastMealAt = null,
  loggedMealTypes = [],
  mealSchedule = null,
  isDancing = false,
  isDrinking = false, // true for ~2s after a glass of water is logged
  weightProgress = null, // kg moved TOWARD the goal (works for losing and gaining)
  goalDirection = 'maintain', // 'lose' | 'gain' | 'maintain'
  progressPercent = 0, // 0-100 progress toward the goal (maintain: 100 = in band)
  eatingFood = null, // emoji of the food being eaten right now (null = not eating)
  needsCheckin = false,
  onOpenWeighIn,
  onTaunt,
  onXpGained,
}) {
  const slothName = useSlothName();
  const [cravingIndex, setCravingIndex] = useState(0);
  const [bubbleText, setBubbleText] = useState(null);
  const [interactiveWave, setInteractiveWave] = useState(false);
  const [pettingHearts, setPettingHearts] = useState([]);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [butterflies, setButterflies] = useState([]);
  const [statueActive, setStatueActive] = useState(false);

  // Gamification: Sloth Friendship Level & XP
  const [friendshipXp, setFriendshipXp] = useState(35);
  const [friendshipLevel, setFriendshipLevel] = useState(1);
  const [levelUpBanner, setLevelUpBanner] = useState(false);

  // 1. Calculate time, elapsed meal duration & human-like schedule
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;

  const minutesSinceLastMeal = lastMealAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(lastMealAt).getTime()) / 60000))
    : null;
  const hoursSinceLastMeal = minutesSinceLastMeal !== null ? minutesSinceLastMeal / 60 : null;

  const hasBreakfast = loggedMealTypes?.some((t) => t === 'morning' || t === 'breakfast');
  const hasLunch = loggedMealTypes?.some((t) => t === 'lunch');
  const hasDinner = loggedMealTypes?.some((t) => t === 'dinner');

  // Realistic human-like hunger & schedule state
  let state = 'chill';
  let defaultSpeech = null;

  if (eatingFood) {
    state = 'eating';
    defaultSpeech = t('Nom nom nom! 😋');
  } else if (isDrinking) {
    state = 'drinking';
    defaultSpeech = t('Glug glug glug! 💧');
  } else if (isOverComfort(goalDirection, totalCals, targetMax)) {
    state = 'food_coma';
    defaultSpeech = t('Ooof... too full! I am staying on the floor 😵💤');
  } else if (isDancing) {
    state = 'dancing';
    defaultSpeech = t('YUMMY! Happy sloth dance! 💃✨');
  } else if (goalDirection === 'gain' && totalCals >= targetMin) {
    // Gainers: reaching the target is the win
    state = 'chill';
    defaultSpeech = t('Fuel tank full! Strong sloth energy 💪✨');
  } else if (hoursSinceLastMeal !== null && hoursSinceLastMeal <= 2.5) {
    // Just eaten within the last 2.5 hours: full, satisfied, peaceful!
    state = 'chill';
    if (hasDinner && currentHour >= 18) {
      defaultSpeech = t('Dinner was so cozy! Full and peaceful 🦥💖');
    } else if (hasLunch && currentHour >= 12) {
      defaultSpeech = t('Lunch hit the spot! Energized for the day ✨');
    } else if (hasBreakfast || currentHour < 12) {
      defaultSpeech = t('Breakfast was delicious! Full until noonish 🍃');
    } else {
      defaultSpeech = t('Mmm, that was tasty! Full and happy 🦥');
    }
  } else if (currentHour < 11.5) {
    // MORNING WINDOW (until 11:30)
    if (hasBreakfast || totalCals > 0) {
      state = 'chill';
      defaultSpeech = t('Breakfast was delicious! Chilling until noon 🦥🍃');
    } else if (currentHour < 10.25) {
      // Sloth just woke up, gentle morning craving
      state = 'chill';
      defaultSpeech = t('Good morning! Time for some breakfast fuel? ☕🥐');
    } else {
      // Late morning and still haven't eaten breakfast
      state = 'screaming';
      defaultSpeech = t('FEED MEEE!! I need breakfast fuel!! 🥞😱');
    }
  } else if (currentHour >= 11.5 && currentHour < 13.0) {
    // MIDDAY / PRE-LUNCH (11:30 - 13:00)
    if (hasBreakfast || (totalCals > 0 && hoursSinceLastMeal !== null && hoursSinceLastMeal <= 3.5)) {
      state = 'chill';
      defaultSpeech = t('Breakfast held up well! Lunch soon? 🦥🍃');
    } else if (totalCals === 0) {
      state = 'screaming';
      defaultSpeech = t('FEED MEEE!! Noon already and no food!! 🍎😱');
    } else {
      state = 'chill';
      defaultSpeech = t('Tummy is ready for lunchtime! 🍱');
    }
  } else if (currentHour >= 13.0 && currentHour < 16.0) {
    // LUNCH WINDOW (13:00 - 16:00)
    if (hasLunch || (hoursSinceLastMeal !== null && hoursSinceLastMeal <= 2.5)) {
      state = 'chill';
      defaultSpeech = t('Lunch was wonderful! Relaxing on the branch 🌸');
    } else if (currentHour < 14.5) {
      state = 'chill';
      defaultSpeech = t('It is lunchtime! What are we eating? 🍱');
    } else {
      // Past 14:30 without lunch or recent food
      state = 'screaming';
      defaultSpeech = t('FEED MEEE!! I need lunch fuel!! 🥪😱');
    }
  } else if (currentHour >= 16.0 && currentHour < 19.0) {
    // AFTERNOON WINDOW (16:00 - 19:00)
    if ((hoursSinceLastMeal !== null && hoursSinceLastMeal <= 3.5) || totalCals >= targetMin * 0.5) {
      state = 'chill';
      defaultSpeech = t('Basking in the warm afternoon glade 🍃✨');
    } else {
      state = 'screaming';
      defaultSpeech = t('FEED MEEE!! {name} needs fuel!! 🍉😱', { name: slothName });
    }
  } else if (currentHour >= 19.0 && currentHour < 22.0) {
    // DINNER WINDOW (19:00 - 22:00)
    if (hasDinner || (hoursSinceLastMeal !== null && hoursSinceLastMeal <= 2.5)) {
      state = 'chill';
      defaultSpeech = t('Dinner was so comforting! Cozy camp vibes 💖');
    } else if (currentHour < 20.5) {
      state = 'chill';
      defaultSpeech = t('Evening roll call! What is for dinner? 🍲');
    } else {
      state = 'screaming';
      defaultSpeech = t('FEED MEEE!! Starving for dinner!! 🍛😱');
    }
  } else {
    // NIGHT / SLEEP WINDOW (22:00+)
    if (totalCals === 0) {
      state = 'screaming';
      defaultSpeech = t('FEED MEEE!! We forgot to eat all day!! 😱');
    } else {
      state = 'chill';
      defaultSpeech = t('Campfire is warm... getting sleepy 🌙💤');
    }
  }

  if (needsCheckin && state !== 'screaming' && state !== 'dancing') {
    defaultSpeech = t('Time for weekly weigh-in! ⚖️');
  }

  // 2. Body shape is fixed: the sloth never changes size with your weight
  const chubbiness = 1;

  const currentCraving = CRAVING_ITEMS[cravingIndex % CRAVING_ITEMS.length];

  function addXp(amount, label) {
    const newXp = friendshipXp + amount;
    if (newXp >= 100) {
      setFriendshipXp(newXp - 100);
      setFriendshipLevel((prev) => prev + 1);
      setLevelUpBanner(true);
      playSound.levelUp();
      setTimeout(() => setLevelUpBanner(false), 3000);
    } else {
      setFriendshipXp(newXp);
    }

    if (label) {
      const id = Date.now() + Math.random();
      setFloatingTexts((prev) => [...prev, { id, text: label }]);
      setTimeout(() => {
        setFloatingTexts((prev) => prev.filter((t) => t.id !== id));
      }, 1200);
    }

    onXpGained?.(amount);
  }

  // Petting mechanic (Tactile dopamine juice)
  function handlePetSloth(e) {
    e.stopPropagation();
    playSound.pet();
    setInteractiveWave(true);
    setTimeout(() => setInteractiveWave(false), 600);

    // Spawn 3-4 heart/star/leaf burst particles
    const emojis = ['💖', '⭐', '🍃', '✨', '🌸'];
    const newParticles = Array.from({ length: 3 }).map((_, i) => ({
      id: Date.now() + i + Math.random(),
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      x: (Math.random() - 0.5) * 80,
      y: -20 - Math.random() * 40,
    }));
    setPettingHearts((prev) => [...prev, ...newParticles]);
    setTimeout(() => {
      setPettingHearts((prev) => prev.filter((p) => !newParticles.find((np) => np.id === p.id)));
    }, 1000);

    const cuteReactions = ['+5 LOVE! 💖', 'PURRR! 🦥', 'SO COZY! ✨', 'HEHEHE! 🍃'].map((x) => t(x));
    addXp(5, cuteReactions[Math.floor(Math.random() * cuteReactions.length)]);

    if (state === 'screaming') {
      setBubbleText(t('Hungry, but your cuddles help! 💖'));
    } else if (state === 'food_coma') {
      setBubbleText(t('Mmm... belly rubs are the best 💤'));
    } else {
      setBubbleText(t('Awww, that tickles! 🦥💖'));
    }

    if (onTaunt) onTaunt();
    setTimeout(() => setBubbleText(null), 3500);
  }

  // Interactive Secret: Tap Stone Statue
  function handleTapStatue(e) {
    e.stopPropagation();
    playSound.sparkle();
    setStatueActive(true);
    addXp(10, t('+1 ACORN! 🌰'));
    setBubbleText(t('The ancient stone guardian winks at you! ✨'));
    setTimeout(() => {
      setStatueActive(false);
      setBubbleText(null);
    }, 3500);
  }

  // Interactive Secret: Tap Wildflowers
  function handleTapFlowers(e) {
    e.stopPropagation();
    playSound.sparkle();
    const newButterflies = [
      { id: Date.now(), emoji: '🦋', x: 70 + Math.random() * 20 },
      { id: Date.now() + 1, emoji: '🌸', x: 280 + Math.random() * 30 },
    ];
    setButterflies((prev) => [...prev, ...newButterflies]);
    addXp(3, t('+3 VIBE 🌸'));
    setTimeout(() => {
      setButterflies((prev) => prev.filter((b) => !newButterflies.find((nb) => nb.id === b.id)));
    }, 1500);
  }

  function getDefaultBubble() {
    return defaultSpeech;
  }

  const activeBubble = bubbleText || getDefaultBubble();

  return (
    <div className="relative w-full aspect-[4/3] max-w-sm mx-auto overflow-hidden rounded-3xl border-4 border-[#182a20] shadow-2xl bg-[#11241a] select-none">
      {/* Level Up Banner Celebration! */}
      <AnimatePresence>
        {levelUpBanner && (
          <motion.div
            initial={{ y: -50, scale: 0.8, opacity: 0 }}
            animate={{ y: 0, scale: 1.05, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-2 inset-x-4 z-40 pixel-box-gold py-2 px-3 rounded-2xl flex items-center justify-center gap-2 shadow-2xl"
          >
            <span className="text-xl animate-bounce">🌟</span>
            <div className="text-center font-pixel text-xs text-amber-950 font-bold">
              {t('FRIENDSHIP LEVEL UP! Lv. {n} 🎉', { n: friendshipLevel })}
            </div>
            <span className="text-xl animate-bounce">🌟</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friendship XP Bar (Top Left) */}
      <div className="absolute top-2.5 start-3 z-30 flex items-center gap-2 bg-[#12241b]/95 border-2 border-[#244c36] px-2.5 py-1 rounded-full shadow-md">
        <span className="text-xs">🦥</span>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[8px] font-pixel text-emerald-300">
            <span className="text-amber-300 font-bold">{t('LV.')} {friendshipLevel}</span>
            <span className="hide-narrow text-emerald-600/70">·</span>
            <span className="hide-narrow text-emerald-400 font-semibold">{friendshipXp}% {t('XP')}</span>
          </div>
          <div className="w-16 h-1.5 bg-[#0a1610] rounded-full overflow-hidden border border-black/40">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-400 to-amber-300 rounded-full"
              animate={{ width: `${friendshipXp}%` }}
              transition={{ type: 'spring', damping: 15 }}
            />
          </div>
        </div>
      </div>

      {/* Layer 1: Forest Glade SVG Backdrop */}
      <svg
        className="absolute inset-0 w-full h-full object-cover"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#142c22" />
            <stop offset="60%" stopColor="#1b3d2f" />
            <stop offset="100%" stopColor="#25513d" />
          </linearGradient>
          <linearGradient id="grassGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4a8f5d" />
            <stop offset="40%" stopColor="#3d7a4d" />
            <stop offset="100%" stopColor="#255234" />
          </linearGradient>
          <linearGradient id="branchGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3d2716" />
            <stop offset="50%" stopColor="#54371f" />
            <stop offset="100%" stopColor="#2c1a0e" />
          </linearGradient>
        </defs>

        <rect width="400" height="300" fill="url(#skyGrad)" />
        <path d="M-20 180 Q30 90 80 170 Q140 100 200 175 Q270 85 330 170 Q380 110 420 180 L420 300 L-20 300 Z" fill="#132a1f" opacity="0.85" />
        <path d="M-20 200 Q50 140 110 190 Q180 130 250 195 Q320 135 420 190 L420 300 L-20 300 Z" fill="#183627" opacity="0.9" />

        {/* Interactive Ancient Stone Guardian (Click to get secret acorn!) */}
        <g
          transform="translate(45, 140) scale(0.75)"
          className="cursor-pointer transition-transform hover:scale-[0.78]"
          onClick={handleTapStatue}
        >
          <circle cx="40" cy="40" r="35" fill={statueActive ? '#3f6d57' : '#314f40'} />
          <circle cx="20" cy="20" r="10" fill="#314f40" />
          <circle cx="60" cy="20" r="10" fill="#314f40" />
          <circle cx="15" cy="40" r="8" fill="#284235" />
          <circle cx="65" cy="40" r="8" fill="#284235" />
          {/* Eyes: Sparkle when clicked! */}
          {statueActive ? (
            <>
              <circle cx="33" cy="38" r="4" fill="#facc15" />
              <circle cx="47" cy="38" r="4" fill="#facc15" />
            </>
          ) : (
            <>
              <path d="M28 38 Q33 42 38 38" stroke="#1d3027" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M42 38 Q47 42 52 38" stroke="#1d3027" strokeWidth="3" fill="none" strokeLinecap="round" />
            </>
          )}
          <rect x="15" y="70" width="50" height="30" rx="4" fill="#243b2f" />
        </g>

        {/* Mossy Wooden Branch */}
        <path
          d="M60 215 C130 200, 260 205, 350 190 L355 208 C265 220, 135 215, 60 230 Z"
          fill="url(#branchGrad)"
          stroke="#1e1108"
          strokeWidth="2.5"
        />
        <ellipse cx="140" cy="205" rx="14" ry="4" fill="#58a87f" opacity="0.7" />
        <ellipse cx="250" cy="200" rx="20" ry="5" fill="#58a87f" opacity="0.7" />

        {/* Grassy Clearing */}
        <path d="M-10 225 Q100 205 200 220 Q300 205 410 225 L410 300 L-10 300 Z" fill="url(#grassGrad)" />

        {/* Interactive Wildflowers (Click to release butterflies!) */}
        <g className="cursor-pointer" onClick={handleTapFlowers}>
          <g fill="#ffffff" opacity="0.85">
            <circle cx="70" cy="255" r="4" /><circle cx="67" cy="252" r="3" /><circle cx="73" cy="252" r="3" />
            <circle cx="120" cy="270" r="4" /><circle cx="280" cy="260" r="4" /><circle cx="330" cy="265" r="4" />
          </g>
          <g fill="#f5cd44">
            <circle cx="70" cy="252" r="2" /><circle cx="120" cy="270" r="2" />
            <circle cx="280" cy="260" r="2" /><circle cx="330" cy="265" r="2" />
          </g>
        </g>
      </svg>

      {/* Butterflies Fluttering Up on Flower Tap */}
      <AnimatePresence>
        {butterflies.map((b) => (
          <motion.div
            key={b.id}
            initial={{ y: 220, x: b.x, opacity: 1, scale: 0.8 }}
            animate={{ y: 100, x: b.x + (Math.random() - 0.5) * 40, opacity: 0, scale: 1.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.3, ease: 'easeOut' }}
            className="absolute text-xl pointer-events-none z-30"
          >
            {b.emoji}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Floating Tactical XP / Love Text Numbers */}
      <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
        <AnimatePresence>
          {floatingTexts.map((ft) => (
            <motion.div
              key={ft.id}
              initial={{ y: 0, scale: 0.8, opacity: 1 }}
              animate={{ y: -80, scale: 1.15, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              className="font-pixel text-xs text-amber-300 bg-[#160b05]/80 px-2 py-1 rounded-lg border border-amber-500 shadow-xl filter drop-shadow absolute"
            >
              {ft.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Petting Heart & Star Particles */}
      <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
        <AnimatePresence>
          {pettingHearts.map((p) => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 30, scale: 0.6, opacity: 1 }}
              animate={{ x: p.x, y: p.y, scale: [0.6, 1.3, 0.8], opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="text-2xl filter drop-shadow-md absolute"
            >
              {p.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Layer 2: Weekly Weigh-In Alert Badge */}
      {needsCheckin && (
        <motion.button
          whileTap={{ scale: 0.92 }}
          animate={{ scale: [1, 1.05, 1], rotate: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: 2.5 }}
          onClick={onOpenWeighIn}
          className="absolute top-2.5 end-3 z-30 pixel-btn-gold px-2.5 py-1 rounded-xl text-[9px] font-pixel text-amber-950 font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
        >
          <span>⚖️</span> <span className="whitespace-nowrap">{t('WEIGH-IN!')}</span>
        </motion.button>
      )}

      {/* Layer 3: Dynamic Speech Bubble */}
      <div className="absolute top-[16%] left-[53%] transform -translate-x-1/2 z-20 pointer-events-auto">
        <AnimatePresence mode="wait">
          {activeBubble ? (
            <motion.div
              key={activeBubble}
              initial={{ scale: 0.6, opacity: 0, y: 10 }}
              animate={{
                scale: 1,
                opacity: 1,
                y: 0,
                x: state === 'screaming' ? [-3, 3, -3, 3, 0] : 0,
              }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={handlePetSloth}
              className={`pixel-speech-bubble px-3 py-1.5 max-w-[210px] text-center shadow-lg cursor-pointer ${
                state === 'screaming' ? 'border-red-600 bg-red-50 text-red-900' : ''
              }`}
            >
              <p className={`text-[11px] font-pixel leading-snug ${state === 'screaming' ? 'text-red-700 font-bold' : 'text-stone-800'}`}>
                {activeBubble}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="craving"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              whileHover={{ scale: 1.15 }}
              onClick={handlePetSloth}
              className="pixel-speech-bubble px-3.5 py-1.5 flex items-center justify-center cursor-pointer shadow-md"
            >
              <span className="text-2xl filter drop-shadow-sm animate-pulse">
                {currentCraving}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Layer 4: The Animated Pixel Sloth Character (Interactive Petting Zone!) */}
      <div
        className="absolute bottom-5 left-1/2 transform -translate-x-1/2 z-10 cursor-pointer flex flex-col items-center"
        onClick={handlePetSloth}
      >
        {/* ==================== STATE 1: FOOD COMA (flat on his back on the floor, defeated) ==================== */}
        {state === 'food_coma' ? (
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            className="relative flex items-center justify-center filter drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
          >
            {/* Dizzy stars circling his head */}
            <motion.div
              className="absolute text-lg pointer-events-none"
              style={{ left: 8, top: -4 }}
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
            >
              💫
            </motion.div>
            {/* Groan */}
            <motion.div
              animate={{ y: [0, -16], opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeOut' }}
              className="absolute -top-5 end-4 font-pixel text-[10px] text-amber-300 pointer-events-none"
            >
              {t('uuugh…')}
            </motion.div>

            <svg width="170" height="100" viewBox="0 0 170 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Floor shadow */}
              <ellipse cx="85" cy="92" rx="72" ry="6" fill="#000000" opacity="0.28" />

              {/* Legs flopped up in the air (dark outline first, then fur) */}
              <g strokeLinecap="round" fill="none">
                <path d="M118 68 C132 58, 142 44, 148 30" stroke="#3d2f24" strokeWidth="14" />
                <path d="M118 68 C132 58, 142 44, 148 30" stroke="#8d7a69" strokeWidth="9" />
                <path d="M128 76 C142 72, 152 66, 160 58" stroke="#3d2f24" strokeWidth="14" />
                <path d="M128 76 C142 72, 152 66, 160 58" stroke="#8d7a69" strokeWidth="9" />
                <g stroke="#ffffff" strokeWidth="2">
                  <path d="M145 25 L142 18 M149 24 L149 16 M153 26 L156 19" />
                  <path d="M162 53 L168 49 M163 57 L169 56 M162 61 L168 63" />
                </g>
              </g>

              {/* Big round bloated belly */}
              <ellipse cx="85" cy="66" rx={44 * chubbiness} ry={26 * chubbiness} fill="#9e8a78" stroke="#3d2f24" strokeWidth="3.5" />
              <ellipse cx="85" cy="64" rx={33 * chubbiness} ry={18 * chubbiness} fill="#d9cbbe" />
              <ellipse cx="96" cy="58" rx="9" ry="4" fill="#f4ece1" opacity="0.7" />

              {/* Arms: one flopped on the floor, one limp in the air */}
              <g strokeLinecap="round" fill="none">
                <path d="M60 74 C50 80, 40 84, 30 86" stroke="#3d2f24" strokeWidth="13" />
                <path d="M60 74 C50 80, 40 84, 30 86" stroke="#8d7a69" strokeWidth="8" />
                <path d="M78 52 C84 40, 90 28, 92 16" stroke="#3d2f24" strokeWidth="13" />
                <path d="M78 52 C84 40, 90 28, 92 16" stroke="#8d7a69" strokeWidth="8" />
                <g stroke="#ffffff" strokeWidth="2">
                  <path d="M27 84 L21 82 M27 87 L20 88 M29 90 L24 94" />
                  <path d="M88 12 L85 6 M92 11 L92 4 M96 12 L99 6" />
                </g>
              </g>

              {/* Head, face up */}
              <circle cx="34" cy="60" r="22" fill="#9e8a78" stroke="#3d2f24" strokeWidth="3.5" />
              <ellipse cx="36" cy="60" rx="15" ry="14" fill="#f4ece1" />
              <ellipse cx="26" cy="56" rx="6.5" ry="4.5" fill="#4a3b2c" transform="rotate(-20 26 56)" />
              <ellipse cx="46" cy="56" rx="6.5" ry="4.5" fill="#4a3b2c" transform="rotate(20 46 56)" />
              {/* X eyes */}
              <path d="M23 53 L29 59 M29 53 L23 59" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M43 53 L49 59 M49 53 L43 59" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
              {/* Nose, wobbly mouth, tongue out */}
              <ellipse cx="36" cy="64" rx="4.5" ry="3" fill="#3a2a1d" />
              <path d="M29 69 Q33 72 36 69 Q39 72 43 69" stroke="#3a2a1d" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M35 70 Q36 82 42 75 Q40 71 38 70 Z" fill="#f43f5e" stroke="#3a2a1d" strokeWidth="1.5" />
              {/* Cheeks, sweat drop */}
              <circle cx="20" cy="64" r="4" fill="#e2847a" opacity="0.55" />
              <circle cx="52" cy="64" r="4" fill="#e2847a" opacity="0.55" />
              <path d="M14 40 Q9 49 14 52 Q19 49 14 40 Z" fill="#38bdf8" opacity="0.85" />
              {/* Leaf */}
              <g transform="translate(36, 40) rotate(-25)">
                <path d="M0 12 C-5 6, 2 0, 9 0 C12 6, 7 12, 0 12 Z" fill="#48bb78" stroke="#1c4d32" strokeWidth="2" />
              </g>
            </svg>
          </motion.div>
        ) : (
          /* ==================== NORMAL, DANCING, OR SCREAMING STATES ==================== */
          <motion.div
            animate={
              state === 'eating'
                ? { y: [0, -3, 0], rotate: [-2, 2, -2] }
                : state === 'drinking'
                ? { y: [0, -2, 0], rotate: [-1, 1, -1] }
                : state === 'dancing'
                ? {
                    y: [0, -22, 0, -15, 0],
                    rotate: [-10, 10, -8, 8, 0],
                    scale: [1, 1.15, 0.95, 1.1, 1],
                  }
                : state === 'screaming'
                ? {
                    x: [-3, 3, -3, 3, 0],
                    y: [-2, 2, -2, 2, 0],
                  }
                : interactiveWave
                ? { rotate: [-6, 8, -6, 6, 0], scale: [1, 1.12, 1] }
                : { y: [0, -3, 0], rotate: [-1, 1, -1] }
            }
            transition={
              state === 'eating'
                ? { repeat: Infinity, duration: 0.4, ease: 'easeInOut' }
                : state === 'drinking'
                ? { repeat: Infinity, duration: 0.9, ease: 'easeInOut' }
                : state === 'dancing'
                ? { repeat: Infinity, duration: 1.1, ease: 'easeInOut' }
                : state === 'screaming'
                ? { repeat: Infinity, duration: 0.12 }
                : interactiveWave
                ? { duration: 0.6, ease: 'easeInOut' }
                : { repeat: Infinity, duration: 3.5, ease: 'easeInOut' }
            }
            className="relative flex items-center justify-center filter drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]"
          >
            {/* Eating: food flies to the mouth, gets nibbled away, crumbs fly */}
            {state === 'eating' && (
              <>
                <motion.div
                  key={eatingFood}
                  className="absolute z-20 text-3xl pointer-events-none"
                  style={{ left: '50%', top: '30%', marginLeft: -16 }}
                  initial={{ y: 70, scale: 1.3, opacity: 0 }}
                  animate={{ y: [70, 6, 6, 6, 6], scale: [1.3, 1, 0.8, 0.55, 0.25], opacity: [0, 1, 1, 1, 0] }}
                  transition={{ duration: 2.4, times: [0, 0.2, 0.5, 0.8, 1], ease: 'easeOut' }}
                >
                  {eatingFood}
                </motion.div>
                {[0, 1, 2, 3].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute z-20 text-sm text-amber-200 pointer-events-none"
                    style={{ left: '50%', top: '42%' }}
                    animate={{ x: [0, (i % 2 ? 1 : -1) * (16 + i * 7)], y: [0, -12 - i * 4, 18], opacity: [1, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.17, ease: 'easeOut' }}
                  >
                    •
                  </motion.span>
                ))}
                <motion.div
                  className="absolute -top-4 end-1 font-pixel text-[10px] text-amber-200 pointer-events-none"
                  animate={{ y: [0, -16], opacity: [0, 1, 0], scale: [0.8, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'easeOut' }}
                >
                  {t('NOM!')}
                </motion.div>
              </>
            )}

            {/* Drinking: a glass flies up, tips toward the mouth and drains; droplets and GLUG! */}
            {state === 'drinking' && (
              <>
                <motion.div
                  className="absolute z-20 pointer-events-none"
                  style={{ left: '50%', top: '24%', marginLeft: -19 }}
                  initial={{ y: 60, opacity: 0, rotate: 0 }}
                  animate={{ y: [60, 4, 4, 4], opacity: [0, 1, 1, 0], rotate: [0, 0, -38, -38] }}
                  transition={{ duration: 2.4, times: [0, 0.2, 0.7, 1], ease: 'easeInOut' }}
                >
                  <svg width="38" height="48" viewBox="0 0 28 36" fill="none">
                    <defs>
                      <clipPath id="cupClip">
                        <path d="M3 3 L25 3 L22 33 L6 33 Z" />
                      </clipPath>
                    </defs>
                    <motion.rect
                      x="0"
                      width="28"
                      fill="#38bdf8"
                      opacity="0.85"
                      clipPath="url(#cupClip)"
                      initial={{ y: 8, height: 26 }}
                      animate={{ y: [8, 8, 30], height: [26, 26, 4] }}
                      transition={{ duration: 2.4, times: [0, 0.2, 0.95], ease: 'easeInOut' }}
                    />
                    <path d="M3 3 L25 3 L22 33 L6 33 Z" fill="rgba(255,255,255,0.25)" stroke="#ffffff" strokeWidth="2.2" strokeLinejoin="round" />
                    <path d="M7 8 L8.5 26" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
                  </svg>
                </motion.div>
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute z-20 text-sm pointer-events-none"
                    style={{ left: '50%', top: '46%' }}
                    animate={{ x: [0, (i - 1) * 16], y: [0, -6, 18], opacity: [0, 1, 0], scale: [0.6, 1, 0.7] }}
                    transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.3, ease: 'easeOut' }}
                  >
                    💧
                  </motion.span>
                ))}
                <motion.div
                  className="absolute -top-4 end-1 font-pixel text-[10px] text-cyan-200 pointer-events-none"
                  animate={{ y: [0, -16], opacity: [0, 1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: 'easeOut' }}
                >
                  {t('GLUG!')}
                </motion.div>
              </>
            )}

            {/* Happy Dance Sparkles */}
            {state === 'dancing' && (
              <>
                <motion.div
                  animate={{ y: [-5, -40], opacity: [0, 1, 0], scale: [0.8, 1.4, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'easeOut' }}
                  className="absolute -top-7 left-2 text-xl pointer-events-none"
                >
                  ✨
                </motion.div>
                <motion.div
                  animate={{ y: [-2, -35], opacity: [0, 1, 0], scale: [0.8, 1.3, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.4, delay: 0.3, ease: 'easeOut' }}
                  className="absolute -top-9 right-3 text-xl pointer-events-none"
                >
                  💖
                </motion.div>
              </>
            )}

            <svg
              width="135"
              height="120"
              viewBox="0 0 135 120"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Chubby Sloth Body (Morphs with chubbiness!) */}
              <ellipse
                cx="68"
                cy="74"
                rx={40 * chubbiness}
                ry={34 * chubbiness}
                fill="#9e8a78"
                stroke="#3d2f24"
                strokeWidth="3.5"
              />

              {/* Belly Patch */}
              <ellipse
                cx="68"
                cy="80"
                rx={27 * chubbiness}
                ry={22 * chubbiness}
                fill="#d9cbbe"
              />

              {/* Left Sloth Arm */}
              <g id="arm-l" className={state === 'eating' ? 'arm-eat-l' : state === 'drinking' ? 'arm-drink-l' : undefined}>
              <motion.g
                animate={
                  state === 'eating' || state === 'drinking'
                    ? { rotate: 0 }
                    : state === 'screaming' || state === 'dancing'
                    ? { rotate: [-35, 20, -35] }
                    : { rotate: [0, -3, 0] }
                }
                transition={{ repeat: Infinity, duration: state === 'eating' ? 0.4 : state === 'dancing' ? 0.55 : 0.18 }}
                style={{ originX: 0.72, originY: -0.05 }}
              >
                <path
                  d="M32 68 C22 75, 20 90, 36 96 C42 98, 48 93, 44 85 C40 78, 38 72, 32 68 Z"
                  fill="#8d7a69"
                  stroke="#3d2f24"
                  strokeWidth="3"
                />
                <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M26 94 C23 99, 27 103, 31 101" />
                  <path d="M30 96 C29 102, 34 105, 37 101" />
                  <path d="M36 97 C37 103, 42 104, 43 100" />
                </g>
              </motion.g>
              </g>

              {/* Right Sloth Arm */}
              <g id="arm-r" className={state === 'eating' ? 'arm-eat-r' : state === 'drinking' ? 'arm-drink-r' : undefined}>
              <motion.g
                animate={
                  state === 'eating' || state === 'drinking'
                    ? { rotate: 0 }
                    : state === 'screaming' || state === 'dancing'
                    ? { rotate: [35, -20, 35] }
                    : interactiveWave
                    ? { rotate: [-20, 30, -20] }
                    : { rotate: [0, 4, 0] }
                }
                transition={{
                  repeat: Infinity,
                  duration: state === 'eating' ? 0.4 : state === 'dancing' ? 0.55 : state === 'screaming' ? 0.18 : 3.2,
                }}
                style={{ originX: 0.2, originY: -0.05 }}
              >
                <path
                  d="M96 68 C108 73, 115 85, 106 96 C100 100, 92 95, 92 87 C92 78, 94 72, 96 68 Z"
                  fill="#8d7a69"
                  stroke="#3d2f24"
                  strokeWidth="3"
                />
                <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M107 94 C111 99, 107 103, 103 101" />
                  <path d="M103 96 C104 102, 99 105, 96 101" />
                  <path d="M97 97 C96 103, 91 104, 90 100" />
                </g>
              </motion.g>
              </g>

              {/* Sloth Head */}
              <circle cx="68" cy="46" r="28" fill="#9e8a78" stroke="#3d2f24" strokeWidth="3.5" />
              <path
                d="M50 48 C48 36, 60 30, 68 35 C76 30, 88 36, 86 48 C85 60, 76 66, 68 66 C60 66, 51 60, 50 48 Z"
                fill="#f4ece1"
              />

              {/* Sloth Eye Stripes */}
              <path d="M48 44 C47 48, 52 56, 59 54 C60 52, 57 44, 53 43 C50 42, 48 43, 48 44 Z" fill="#4a3b2c" />
              <path d="M88 44 C89 48, 84 56, 77 54 C76 52, 79 44, 83 43 C86 42, 88 43, 88 44 Z" fill="#4a3b2c" />

              {/* Eyes & Mouth: Interactive expressions! */}
              {state === 'eating' || state === 'drinking' ? (
                <>
                  <path d="M50 48 Q55 43 60 48" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                  <path d="M76 48 Q81 43 86 48" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                  <ellipse cx="68" cy="53" rx="5" ry="3.5" fill="#3a2a1d" />
                  <motion.ellipse
                    cx="68"
                    cy="60"
                    rx="6"
                    fill="#3a2a1d"
                    stroke="#3d2f24"
                    strokeWidth="1.5"
                    animate={{ ry: [1.5, 6, 1.5] }}
                    transition={{ repeat: Infinity, duration: state === 'drinking' ? 0.9 : 0.4, ease: 'easeInOut' }}
                  />
                </>
              ) : state === 'screaming' ? (
                <>
                  <circle cx="55" cy="48" r="5" fill="#ffffff" />
                  <circle cx="55" cy="48" r="3" fill="#140a04" />
                  <circle cx="81" cy="48" r="5" fill="#ffffff" />
                  <circle cx="81" cy="48" r="3" fill="#140a04" />
                  <circle cx="48" cy="54" r="2" fill="#38bdf8" />
                  <ellipse cx="68" cy="60" rx="7" ry="6" fill="#881337" stroke="#3d2f24" strokeWidth="2" />
                  <ellipse cx="68" cy="62" rx="4" ry="2.5" fill="#f43f5e" />
                </>
              ) : state === 'dancing' ? (
                <>
                  <path d="M52 46 L58 50 M58 46 L52 50" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M78 46 L84 50 M84 46 L78 50" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                  <ellipse cx="68" cy="52" rx="5.5" ry="4" fill="#3a2a1d" />
                  <path d="M59 57 Q68 66 77 57" stroke="#3a2a1d" strokeWidth="3" fill="#f43f5e" />
                </>
              ) : interactiveWave ? (
                <>
                  {/* Ecstatic Purring Eyes when petted! */}
                  <path d="M50 48 Q55 43 60 48" stroke="#f43f5e" strokeWidth="2.8" fill="none" strokeLinecap="round" />
                  <path d="M76 48 Q81 43 86 48" stroke="#f43f5e" strokeWidth="2.8" fill="none" strokeLinecap="round" />
                  <ellipse cx="68" cy="53" rx="5.5" ry="4" fill="#3a2a1d" />
                  <path d="M62 58 Q68 65 74 58" stroke="#3a2a1d" strokeWidth="2.5" fill="#f43f5e" />
                </>
              ) : (
                <>
                  <path d="M51 48 Q55 52 59 48" stroke="#ffffff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                  <path d="M77 48 Q81 52 85 48" stroke="#ffffff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                  <ellipse cx="68" cy="53" rx="6" ry="4.5" fill="#3a2a1d" />
                  <circle cx="66" cy="52" r="1" fill="#ffffff" opacity="0.6" />
                  <path d="M62 58 Q68 63 74 58" stroke="#3a2a1d" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </>
              )}

              {/* Glowing Rosy Cheeks */}
              <circle cx="48" cy="55" r={interactiveWave || state === 'eating' || state === 'drinking' ? 5.5 * chubbiness : 4 * chubbiness} fill="#e2847a" opacity={interactiveWave || state === 'eating' || state === 'drinking' ? 0.8 : 0.5} />
              <circle cx="88" cy="55" r={interactiveWave || state === 'eating' || state === 'drinking' ? 5.5 * chubbiness : 4 * chubbiness} fill="#e2847a" opacity={interactiveWave || state === 'eating' || state === 'drinking' ? 0.8 : 0.5} />

              {/* Leaf & Garland */}
              {((weightProgress ?? 0) >= 1.5 || (goalDirection === 'maintain' && progressPercent === 100)) ? (
                <g transform="translate(68, 17)">
                  <path d="M-15 15 Q0 8 15 15" stroke="#f59e0b" strokeWidth="3" fill="none" strokeLinecap="round" />
                  <circle cx="0" cy="10" r="3.5" fill="#eab308" />
                  <circle cx="-10" cy="13" r="2.5" fill="#22c55e" />
                  <circle cx="10" cy="13" r="2.5" fill="#22c55e" />
                </g>
              ) : (
                <g transform="translate(68, 18) rotate(15)">
                  <path d="M0 14 C-5 7, 2 0, 10 0 C13 7, 8 14, 0 14 Z" fill="#48bb78" stroke="#1c4d32" strokeWidth="2" />
                  <circle cx="1" cy="14" r="3" fill="#f472b6" />
                  <circle cx="1" cy="14" r="1" fill="#fef08a" />
                </g>
              )}

              {/* Eating: draw the paws again in FRONT of the face, holding the food to the mouth */}
              {(state === 'eating' || state === 'drinking') && (
                <>
                  <use href="#arm-l" />
                  <use href="#arm-r" />
                </>
              )}

              {/* Resting Back Paws */}
              <ellipse cx="50" cy="100" rx={9 * chubbiness} ry="6" fill="#8d7a69" stroke="#3d2f24" strokeWidth="2.5" />
              <ellipse cx="86" cy="100" rx={9 * chubbiness} ry="6" fill="#8d7a69" stroke="#3d2f24" strokeWidth="2.5" />
            </svg>
          </motion.div>
        )}
      </div>
    </div>
  );
}
