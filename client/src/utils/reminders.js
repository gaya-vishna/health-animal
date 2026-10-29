import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as NativeApp } from '@capacitor/app';
import { api } from './api';
import { t } from './i18n';
import { setSlothName, getSlothName } from './slothName';
import { dayIdFor, buildSchedule as planSchedule, learnMealTimes, yesterdayReaction, pick, snacksOn } from './reminderPlan.js';

export { learnMealTimes, yesterdayReaction, pick, snacksOn };

// Render a pool entry in the app language with the sloth's name (and e.g. the saga day number).
const render = (entry, vars = {}) => {
  const v = { name: getSlothName(), ...vars };
  return { title: t(entry.title, v), body: t(entry.body, v) };
};

// Reminders are scheduled ON THE PHONE (no server push), so they arrive even when the app is closed.
// We schedule the next DAYS days as one-off notifications and re-plan whenever the app opens, settings
// change, or a meal is logged - that is what lets us skip "lunch" once lunch is already logged.

export const isNativeApp = () => Capacitor.isNativePlatform();

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
const DEFAULT_PREFS = { meals: true, bedtime: true, water: false, smartTiming: true, saga: true };

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
const idFor = dayIdFor;

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

// The planner lives in reminderPlan.js (pure, tested); this wrapper adds the app-language renderer and channels.
export function buildSchedule(opts) {
  return planSchedule({ render, kinds: KIND, ...opts });
}

export async function syncReminders({ mealTimes, bedtime }, loggedTodayTypes = [], { awayDays = 0, goalDirection = null, history = null } = {}) {
  if (!isNativeApp()) return;
  if (!(await ensurePermission())) return;
  await localizeChannels();

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }

  const times = Array.isArray(mealTimes) && mealTimes.length ? mealTimes : DEFAULT_MEAL_TIMES;
  const prefs = getReminderPrefs();
  const list = buildSchedule({
    prefs, times, bedtime, loggedTodayTypes, awayDays, goalDirection,
    smart: prefs.smartTiming !== false,
    saga: prefs.saga !== false,
    learned: history ? learnMealTimes(history, times) : null,
    reaction: history ? yesterdayReaction(history) : null,
  });

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
    const [settingsRes, dashRes, histRes] = await Promise.allSettled([
      api('/api/settings').then((r) => r.json()),
      api('/api/dashboard').then((r) => r.json()),
      api('/api/history?days=14').then((r) => r.json()),
    ]);
    if (settingsRes.status !== 'fulfilled') throw settingsRes.reason;
    if (dashRes.status !== 'fulfilled') throw dashRes.reason;
    const settings = settingsRes.value;
    const dash = dashRes.value;
    const history = histRes.status === 'fulfilled' && Array.isArray(histRes.value?.days) ? histRes.value : null; // falls back to the settings times
    setSlothName(settings.slothName);
    await syncReminders(
      { mealTimes: settings.mealTimesJson, bedtime: settings.bedtimeReminderTime },
      dash.loggedMealTypes || [],
      { awayDays: dash.awayDays || 0, goalDirection: dash.goalDirection || null, history }
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
  const msg = pick('test', new Date(), Math.floor(Math.random() * 100), render);
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
