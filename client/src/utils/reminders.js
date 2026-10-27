import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as NativeApp } from '@capacitor/app';
import { api } from './api';
import { t } from './i18n';
import { pickMessage } from './reminderMessages';
import { setSlothName } from './slothName';

// Reminders are scheduled ON THE PHONE (no server push), so they arrive even when the app is closed.
// We schedule the next DAYS days as one-off notifications and re-plan whenever the app opens, settings
// change, or a meal is logged - that is what lets us skip "lunch" once lunch is already logged.

export const isNativeApp = () => Capacitor.isNativePlatform();

const DAYS = 60; // plan this far ahead; the lapse taper below keeps the real count small
const IDLE_STOP = 60; // after this many idle days we stop reminding altogether
const COMEBACK_TIME = '13:00';
const SNACK_TIMES = ['11:00', '16:30'];
const WATER_TIMES = ['11:00', '14:00', '17:00'];
const MEALS = [
  { type: 'morning', idx: 0 },
  { type: 'lunch', idx: 1 },
  { type: 'dinner', idx: 2 },
];
// Per-kind channel, sound and picture. The native side creates these channels (sound is frozen at creation).
const KIND = {
  meal: { channelId: 'ha_meal_v1', sound: 'sloth_meal.wav', largeIcon: 'sloth_hungry' },
  bedtime: { channelId: 'ha_bedtime_v1', sound: 'sloth_bedtime.wav', largeIcon: 'sloth_sleepy' },
  water: { channelId: 'ha_water_v1', sound: 'sloth_water.wav', largeIcon: 'sloth_thirsty' },
  test: { channelId: 'ha_hello_v1', sound: 'sloth_hello.wav', largeIcon: 'sloth_happy' },
};
KIND.comeback = KIND.test;
const DEFAULT_MEAL_TIMES = ['09:30', '13:30', '18:00', '21:00'];

const PREFS_KEY = 'ha_reminders';
const DEFAULT_PREFS = { meals: true, bedtime: true, water: false };

export function getReminderPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setReminderPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

// Stable id per calendar day + slot, so "today's lunch" can be cancelled on its own.
// slot: 0-2 meals, 3 bedtime, 4-6 water, 7-8 snacks, 9 comeback
const idFor = (day, slot) => ((day.getMonth() + 1) * 100 + day.getDate()) * 10 + slot;

async function ensurePermission() {
  const now = await LocalNotifications.checkPermissions();
  if (now.display === 'granted') return true;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === 'granted';
}

// Re-create each channel so its name follows the app language. On an existing channel this only
// renames it: sound and vibration were set natively and stay frozen.
async function localizeChannels() {
  const names = {
    meal: ['Meal reminders', 'Meal, water and bedtime reminders'],
    bedtime: ['Bedtime reminders', 'Meal, water and bedtime reminders'],
    water: ['Water reminders', 'Meal, water and bedtime reminders'],
    test: ['Test reminder', 'Meal, water and bedtime reminders'],
  };
  for (const [kind, [name, description]] of Object.entries(names)) {
    try {
      await LocalNotifications.createChannel({ id: KIND[kind].channelId, name: t(name), description: t(description), importance: 4 });
    } catch {
      /* channel naming is cosmetic */
    }
  }
}

// Is the snack nudge on? An explicit choice wins; otherwise it defaults ON only for people who are gaining.
export const snacksOn = (prefs, goalDirection) => (typeof prefs.snacks === 'boolean' ? prefs.snacks : goalDirection === 'gain');

// Pure planner: which one-off notifications to schedule from `now`. No Capacitor calls, so it can be tested.
// Lapse taper, where idle = awayDays + d for the future day d: under 3 idle days the normal schedule; 3-6 one
// gentle midday hello a day; 7-60 one a week; beyond 60 nothing. The hello never mentions missed days.
export function buildSchedule({ prefs, times, bedtime, loggedTodayTypes = [], awayDays = 0, goalDirection = null, now = new Date() }) {
  const list = [];
  const snacks = snacksOn(prefs, goalDirection);
  for (let d = 0; d < DAYS; d++) {
    const idle = awayDays + d;
    if (idle > IDLE_STOP) break;
    const day = new Date(now);
    day.setDate(now.getDate() + d);
    const add = (slot, hhmm, kind, msg, extra) => {
      if (!hhmm) return;
      const [h, m] = hhmm.split(':').map(Number);
      const at = new Date(day);
      at.setHours(h, m || 0, 0, 0);
      if (at <= now) return;
      list.push({ id: idFor(day, slot), title: msg.title, body: msg.body, schedule: { at, allowWhileIdle: true }, ...KIND[kind], smallIcon: 'ic_stat_sloth', extra });
    };

    if (idle >= 3) {
      const anyOn = prefs.meals || prefs.bedtime || prefs.water || snacks; // all reminders off means none, hello included
      if (anyOn && (idle <= 6 || (idle - 7) % 7 === 0)) add(9, COMEBACK_TIME, 'comeback', pickMessage('comeback', day), { open: 'home' });
      continue;
    }
    if (prefs.meals) {
      MEALS.forEach((meal, slot) => {
        if (d === 0 && loggedTodayTypes.includes(meal.type)) return; // already fed today
        add(slot, times[meal.idx], 'meal', pickMessage(meal.type === 'morning' ? 'breakfast' : meal.type, day), { open: 'feed' });
      });
    }
    if (snacks) SNACK_TIMES.forEach((hhmm, i) => add(7 + i, hhmm, 'meal', pickMessage('snack', day, i), { open: 'feed' }));
    if (prefs.bedtime) add(3, bedtime, 'bedtime', pickMessage('bedtime', day), { open: 'home' });
    if (prefs.water) WATER_TIMES.forEach((hhmm, i) => add(4 + i, hhmm, 'water', pickMessage('water', day, i), { open: 'home' }));
  }
  return list;
}

export async function syncReminders({ mealTimes, bedtime }, loggedTodayTypes = [], { awayDays = 0, goalDirection = null } = {}) {
  if (!isNativeApp()) return;
  if (!(await ensurePermission())) return;
  await localizeChannels();

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }

  const times = Array.isArray(mealTimes) && mealTimes.length ? mealTimes : DEFAULT_MEAL_TIMES;
  const list = buildSchedule({ prefs: getReminderPrefs(), times, bedtime, loggedTodayTypes, awayDays, goalDirection });

  if (list.length) {
    await LocalNotifications.schedule({ notifications: list });
    // The old single channel is replaced by the per-kind ones.
    try {
      await LocalNotifications.deleteChannel({ id: 'reminders' });
    } catch {
      /* already gone */
    }
  }
}

// Pull the latest times + what was already eaten today from the server, then re-plan.
export async function refreshReminders() {
  if (!isNativeApp()) return;
  try {
    const [settings, dash] = await Promise.all([
      api('/api/settings').then((r) => r.json()),
      api('/api/dashboard').then((r) => r.json()),
    ]);
    setSlothName(settings.slothName);
    await syncReminders(
      { mealTimes: settings.mealTimesJson, bedtime: settings.bedtimeReminderTime },
      dash.loggedMealTypes || [],
      { awayDays: dash.awayDays || 0, goalDirection: dash.goalDirection || null }
    );
  } catch (err) {
    console.warn('Could not refresh reminders:', err);
  }
}

// A meal was just logged: drop today's reminder for it.
export async function mealLogged(mealType) {
  if (!isNativeApp()) return;
  const slot = MEALS.findIndex((m) => m.type === mealType);
  if (slot < 0) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: idFor(new Date(), slot) }] });
  } catch {
    /* nothing scheduled */
  }
}

export async function sendTestReminder() {
  if (!isNativeApp() || !(await ensurePermission())) return false;
  await localizeChannels();
  // A repeat test would be silenced (only-alert-once) while the last one is still in the tray.
  try {
    await LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: 99 }] });
  } catch {
    /* nothing delivered */
  }
  try {
    await LocalNotifications.cancel({ notifications: [{ id: 99 }] });
  } catch {
    /* nothing pending */
  }
  const msg = pickMessage('test', new Date(), Math.floor(Math.random() * 100));
  await LocalNotifications.schedule({
    notifications: [{
      id: 99,
      title: msg.title,
      body: msg.body,
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      ...KIND.test,
      smallIcon: 'ic_stat_sloth',
      extra: { open: 'home' },
    }],
  });
  return true;
}

// Move the web app to a route without reloading (BrowserRouter listens to popstate).
function goTo(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

let wired = false;
// Native-only wiring: tapping a reminder opens the right screen, the Android back button walks
// back through the app, and returning to the app re-plans reminders.
export function initNativeApp() {
  if (!isNativeApp() || wired) return;
  wired = true;
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    goTo(action.notification?.extra?.open === 'feed' ? '/dashboard?feed=1' : '/dashboard');
  });
  NativeApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else NativeApp.exitApp();
  });
  NativeApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) refreshReminders();
  });
}
