import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playSound } from '../utils/audioHaptics';
import { t } from '../utils/i18n';

const DOCK_ITEMS = [
  { id: 'apple', emoji: '🍎', label: 'Apple', cals: 80, waterMl: 50, proteinG: 0, tag: '+80 KCAL 🍎' },
  { id: 'watermelon', emoji: '🍉', label: 'Melon', cals: 60, waterMl: 300, proteinG: 1, tag: '+300ml 💧' },
  { id: 'sushi', emoji: '🍣', label: 'Sushi', cals: 380, waterMl: 100, proteinG: 22, tag: '+380 KCAL 🍣' },
  { id: 'protein', emoji: '🥩', label: 'Steak', cals: 250, waterMl: 0, proteinG: 32, setProteinHit: true, tag: '+32g PROTEIN 🔥' },
  { id: 'onigiri', emoji: '🍙', label: 'Onigiri', cals: 180, waterMl: 0, proteinG: 4, tag: '+180 KCAL 🍙' },
];

export default function FoodInventoryDock({ onQuickFeed, onOpenFullLog }) {
  const [flyingItems, setFlyingItems] = useState([]);
  const [floatingTexts, setFloatingTexts] = useState([]);

  function handleFeed(item) {
    playSound.chomp();

    // 1. Spawning flying food projectile towards sloth's mouth
    const newId = Date.now() + Math.random();
    setFlyingItems((prev) => [...prev, { id: newId, emoji: item.emoji }]);

    // 2. Spawning floating combat/RPG text
    setFloatingTexts((prev) => [...prev, { id: newId, text: t(item.tag) }]);

    setTimeout(() => {
      setFlyingItems((prev) => prev.filter((p) => p.id !== newId));
      setFloatingTexts((prev) => prev.filter((p) => p.id !== newId));
    }, 1100);

    if (onQuickFeed) {
      onQuickFeed(item);
    }
  }

  return (
    <div className="relative w-full max-w-sm mx-auto px-2">
      {/* Floating Projectile Food Animation Flying Into Sloth */}
      <div className="absolute inset-0 pointer-events-none z-30 flex justify-center items-center">
        <AnimatePresence>
          {flyingItems.map((p) => (
            <motion.div
              key={p.id}
              initial={{ y: 20, scale: 0.8, opacity: 1 }}
              animate={{
                y: -140,
                x: [0, -15, 0],
                scale: [0.8, 1.5, 0.4],
                opacity: [1, 1, 0],
                rotate: [-15, 25, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="text-4xl filter drop-shadow-lg absolute"
            >
              {p.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Floating Combat / RPG Reward Text */}
      <div className="absolute inset-0 pointer-events-none z-40 flex justify-center items-center">
        <AnimatePresence>
          {floatingTexts.map((ft) => (
            <motion.div
              key={ft.id}
              initial={{ y: -20, scale: 0.8, opacity: 1 }}
              animate={{ y: -90, scale: 1.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.95, ease: 'easeOut' }}
              className="font-pixel text-[11px] text-amber-200 bg-[#160b05]/90 border border-amber-400 px-2 py-0.5 rounded-lg shadow-2xl filter drop-shadow absolute"
            >
              {ft.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Dock Shelf Container */}
      <div className="pixel-food-dock py-2 px-2 flex items-center justify-between gap-1 shadow-xl">
        {DOCK_ITEMS.map((item) => (
          <motion.button
            key={item.id}
            whileTap={{ scale: 0.82 }}
            whileHover={{ scale: 1.1 }}
            onClick={() => handleFeed(item)}
            className="w-12 h-12 min-w-12 min-h-12 rounded-full pixel-food-slot flex items-center justify-center text-xl shrink-0 cursor-pointer shadow-md hover:border-amber-400 transition-colors"
            title={`${t(item.label)} (${t(item.tag)})`}
          >
            <span>{item.emoji}</span>
          </motion.button>
        ))}

        {/* Plus / Custom Food Slot (opens full AI vision / recipe log) */}
        <motion.button
          whileTap={{ scale: 0.82 }}
          whileHover={{ scale: 1.1 }}
          onClick={onOpenFullLog}
          className="w-12 h-12 min-w-12 min-h-12 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 border-2 border-[#361a09] flex items-center justify-center text-amber-950 font-pixel font-bold text-lg shadow-md cursor-pointer shrink-0"
          title={t('Log custom meal / AI Vision')}
        >
          +
        </motion.button>
      </div>
    </div>
  );
}
