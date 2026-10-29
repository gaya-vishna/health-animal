import { POOLS, LUCKY, REACTIONS, ARCS } from './reminderPools.js';

// Pure planning helpers for reminders (no Capacitor, no i18n). Rendering is injected so the app can
// translate and personalise, while tests run on the plain English text.

const DAY_MS = 864e5;
const DEFAULT_NAME = 'Slomo';

// Small distinct offsets so different kinds do not rotate in lockstep.
const SALT = { breakfast: 0, lunch: 2, dinner: 4, bedtime: 1, water: 3, test: 5, comeback: 6, snack: 7 };
const LUCKY_SALT = 11;
const REACTION_SALT = 3;

export const WEEK_TITLE = "{name}'s Week · {n}/7";

export const defaultRender = (entry, vars = {}) => {
  const v = { name: DEFAULT_NAME, ...vars };
  const fill = (s) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  return { title: fill(entry.title), body: fill(entry.body) };
};

export const dayNumOf = (day) => Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / DAY_MS);

// Same text all day, a new one the next day. i separates several reminders of one kind on one day.
export function pick(type, day, i = 0, render = defaultRender) {
  const pool = POOLS[type];
  return render(pool[(dayNumOf(day) + SALT[type] + i) % pool.length]);
}

// Exactly 1 in 20 (day, slot) pairs, deterministic.
export const isLucky = (dayNum, slot) => (dayNum * 7 + slot * 13) % 20 === 0;

// ISO-8601 week number (Monday-based weeks).
export function isoWeek(day) {
  const d = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
  const wd = (d.getUTCDay() + 6) % 7; // Monday 0
  d.setUTCDate(d.getUTCDate() - wd + 3); // the Thursday of this week
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThu) / DAY_MS - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

export function sagaFor(day, render = defaultRender) {
  const arc = ARCS[isoWeek(day) % ARCS.length];
  const n = (day.getDay() + 6) % 7; // Monday 0 ... Sunday 6
  const ep = arc.episodes[n];
  const title = render({ title: WEEK_TITLE, body: '' }, { n: n + 1 }).title;
  return { title, body: render({ title: '', body: ep.body }).body, episode: n + 1 };
}

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const typeGroup = (mealType) => (mealType === 'breakfast' || mealType === 'morning' ? 'morning' : mealType === 'lunch' || mealType === 'dinner' ? mealType : null);

// Settings times are [morning, lunch, dinner, ...]. For each meal take the earliest log per day over the last
// 14 days; with at least 3 samples the target is median + 10 min, kept within settings +-90 min and 07:30-22:00.
export function learnMealTimes(history, settingsTimes) {
  const base = Array.isArray(settingsTimes) ? [...settingsTimes] : [];
  const days = (history?.days || []).slice(0, 14);
  ['morning', 'lunch', 'dinner'].forEach((type, idx) => {
    const samples = [];
    for (const day of days) {
      const mins = (day.meals || []).filter((m) => typeGroup(m.mealType) === type && m.time).map((m) => toMin(m.time));
      if (mins.length) samples.push(Math.min(...mins));
    }
    if (samples.length < 3 || !base[idx]) return;
    samples.sort((a, b) => a - b);
    const mid = samples.length >> 1;
    const median = samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
    const setting = toMin(base[idx]);
    const target = clamp(Math.round(median) + 10, setting - 90, setting + 90);
    base[idx] = toHHMM(clamp(target, 7 * 60 + 30, 22 * 60));
  });
  return base;
}

// What did a day earn praise for? Praise only, never a comparison.
function reactionKind(day, targets) {
  if (!day) return null;
  const types = new Set((day.meals || []).map((m) => typeGroup(m.mealType)).filter(Boolean));
  if (types.size >= 3) return 'meals3';
  if (day.proteinHit) return 'protein';
  if (targets?.waterMl && (day.waterMl || 0) >= targets.waterMl) return 'water';
  return null;
}

// { d0: reaction to yesterday (shown today), d1: reaction to today so far (shown tomorrow) }
export function yesterdayReaction(history) {
  const days = history?.days || [];
  const targets = history?.targets;
  return { d0: reactionKind(days[1], targets), d1: reactionKind(days[0], targets) };
}

const MEALS = [
  { type: 'morning', idx: 0 },
  { type: 'lunch', idx: 1 },
  { type: 'dinner', idx: 2 },
];
const DAYS = 60; // plan this far ahead; the lapse taper keeps the real count small
const IDLE_STOP = 60; // after this many idle days we stop reminding altogether
const COMEBACK_TIME = '13:00';
const SNACK_TIMES = ['11:00', '16:30'];
const WATER_TIMES = ['11:00', '14:00', '17:00'];

// Is the snack nudge on? An explicit choice wins; otherwise it defaults ON only for people who are gaining.
export const snacksOn = (prefs, goalDirection) => (typeof prefs.snacks === 'boolean' ? prefs.snacks : goalDirection === 'gain');

// Pure planner. `make(slot, hhmm, kind, entryFn, extra, flags)` queues one reminder; at the end of each day the
// earliest reactive one may swap in a praise line. Lapse taper (idle = awayDays + d): under 3 idle days the
// normal schedule; 3-6 one gentle midday hello a day; 7-60 one a week; beyond 60 nothing.
// learned: meal times from learnMealTimes (used when smart); reaction: yesterdayReaction(); saga: bedtime story.
export function buildSchedule({
  prefs, times, bedtime, loggedTodayTypes = [], awayDays = 0, goalDirection = null, now = new Date(),
  learned = null, reaction = null, smart = true, saga = true, render = defaultRender, kinds = {},
}) {
  const list = [];
  const snacks = snacksOn(prefs, goalDirection);
  const rawTimes = smart && Array.isArray(learned) && learned.length ? learned : times;
  // However the times were set, meal pings stay within 07:30-22:00 (and a malformed time is skipped).
  const mealTimes = (rawTimes || []).map((t) => {
    const min = toMin(t);
    return Number.isFinite(min) ? toHHMM(clamp(min, 7 * 60 + 30, 22 * 60)) : null;
  });
  for (let d = 0; d < DAYS; d++) {
    const idle = awayDays + d;
    if (idle > IDLE_STOP) break;
    const day = new Date(now);
    day.setDate(now.getDate() + d);
    const dayNum = dayNumOf(day);
    const queue = [];
    const add = (slot, hhmm, kind, msgFn, extra, { luckyOk = true, reactive = true } = {}) => {
      if (!hhmm) return;
      const [h, m] = hhmm.split(':').map(Number);
      const at = new Date(day);
      at.setHours(h, m || 0, 0, 0);
      if (at <= now) return;
      queue.push({ slot, at, kind, msgFn, extra, luckyOk, reactive });
    };

    if (idle >= 3) {
      const anyOn = prefs.meals || prefs.bedtime || prefs.water || snacks; // all reminders off means none, hello included
      if (anyOn && (idle <= 6 || (idle - 7) % 7 === 0)) add(9, COMEBACK_TIME, 'comeback', () => pick('comeback', day, 0, render), { open: 'home' }, { luckyOk: false, reactive: false });
    } else {
      if (prefs.meals) {
        MEALS.forEach((meal, slot) => {
          if (d === 0 && loggedTodayTypes.includes(meal.type)) return; // already fed today
          add(slot, mealTimes[meal.idx], 'meal', () => pick(meal.type === 'morning' ? 'breakfast' : meal.type, day, 0, render), { open: 'feed' });
        });
      }
      if (snacks) SNACK_TIMES.forEach((hhmm, i) => add(7 + i, hhmm, 'meal', () => pick('snack', day, i, render), { open: 'feed' }));
      if (prefs.bedtime) {
        const msgFn = saga ? () => sagaFor(day, render) : () => pick('bedtime', day, 0, render);
        add(3, bedtime, 'bedtime', msgFn, { open: 'home' }, { luckyOk: false, reactive: false });
      }
      if (prefs.water) WATER_TIMES.forEach((hhmm, i) => add(4 + i, hhmm, 'water', () => pick('water', day, i, render), { open: 'home' }));
    }

    // Reaction (never in the taper): earliest remaining reactive reminder of day 0 or 1.
    let reactive = null;
    const kind = idle < 3 && reaction ? (d === 0 ? reaction.d0 : d === 1 ? reaction.d1 : null) : null;
    if (kind && REACTIONS[kind]?.length) {
      reactive = queue.filter((q) => q.reactive).sort((a, b) => a.at - b.at)[0] || null;
    }
    for (const q of queue) {
      let msg;
      if (q === reactive) {
        const pool = REACTIONS[kind];
        msg = render(pool[(dayNum + REACTION_SALT) % pool.length]);
      } else if (q.luckyOk && isLucky(dayNum, q.slot)) {
        msg = render(LUCKY[(dayNum + LUCKY_SALT + q.slot) % LUCKY.length]);
      } else {
        msg = q.msgFn();
      }
      list.push({ id: dayIdFor(day, q.slot), title: msg.title, body: msg.body, schedule: { at: q.at, allowWhileIdle: true }, ...(kinds[q.kind] || {}), smallIcon: 'ic_stat_sloth', extra: q.extra });
    }
  }
  return list;
}

// Stable id per calendar day + slot, so "today's lunch" can be cancelled on its own.
// slot: 0-2 meals, 3 bedtime, 4-6 water, 7-8 snacks, 9 comeback
export const dayIdFor = (day, slot) => ((day.getMonth() + 1) * 100 + day.getDate()) * 10 + slot;
