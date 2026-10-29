// One set of rules for what a config value may be. Used by saveSettings (user input) and by backup
// restore (untrusted file), so a damaged backup can't put an object where the UI expects a string.

export const DEFAULT_CONFIG = {
  heightCm: 165,
  startWeightKg: 70,
  targetWeightKg: 60,
  sex: null,
  birthYear: null,
  slothName: null,
  dailyCaloricTargetMin: 1450,
  dailyCaloricTargetMax: 1550,
  mealTimesJson: ['09:30', '13:30', '18:00', '21:00'],
  bedtimeReminderTime: '23:00',
  notificationSoundsJson: { meal: 'bell', bedtime: 'winddown', workout: 'tick', checkin: 'harp' },
};

export const SOUND_KEYS = ['meal', 'bedtime', 'workout', 'checkin'];

// Every key this module validates.
export const MANAGED_KEYS = [
  'heightCm', 'startWeightKg', 'targetWeightKg', 'dailyCaloricTargetMin', 'dailyCaloricTargetMax',
  'sex', 'birthYear', 'proteinTargetG', 'slothName', 'targetDate', 'mealTimesJson',
  'bedtimeReminderTime', 'notificationSoundsJson', 'setupDone',
];

const isHhmm = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// Applies the valid fields of `b` onto config `c` (mutates and returns it). Invalid values are ignored.
export function applyConfigInput(c, b) {
  const num = (k, parse = parseFloat) => {
    if (b[k] === undefined) return;
    const v = parse(b[k]);
    if (Number.isFinite(v) && v > 0) c[k] = v;
  };
  num('heightCm'); num('startWeightKg'); num('targetWeightKg');
  num('dailyCaloricTargetMin', (v) => parseInt(v, 10)); num('dailyCaloricTargetMax', (v) => parseInt(v, 10));
  // sex / birthYear: null or '' clears, a valid value sets, anything else is ignored.
  if (b.sex === null || b.sex === '') c.sex = null;
  else if (b.sex === 'female' || b.sex === 'male') c.sex = b.sex;
  if (b.birthYear === null || b.birthYear === '') c.birthYear = null;
  else if (b.birthYear !== undefined) {
    const y = Number(b.birthYear);
    if (Number.isInteger(y) && y >= 1900 && y <= new Date().getFullYear() - 10) c.birthYear = y;
  }
  // proteinTargetG: null or '' clears it; an integer 1-400 sets it; anything else is ignored.
  if (b.proteinTargetG === null || b.proteinTargetG === '') c.proteinTargetG = null;
  else if (b.proteinTargetG !== undefined) {
    const p = Number(b.proteinTargetG);
    if (Number.isInteger(p) && p >= 1 && p <= 400) c.proteinTargetG = p;
  }
  // slothName: null, '' or blank clears it; a trimmed 1-20 character string sets it; anything else is ignored.
  if (b.slothName === null || b.slothName === '') c.slothName = null;
  else if (typeof b.slothName === 'string') {
    const n = b.slothName.trim();
    if (!n) c.slothName = null;
    else if ([...n].length <= 20) c.slothName = n;
  }
  if (b.targetDate !== undefined && (typeof b.targetDate === 'string' || typeof b.targetDate === 'number')) {
    const d = new Date(b.targetDate);
    if (!isNaN(d.getTime())) c.targetDate = d.toISOString();
  }
  if (Array.isArray(b.mealTimesJson) && b.mealTimesJson.length <= 6 && b.mealTimesJson.every(isHhmm)) c.mealTimesJson = b.mealTimesJson;
  if (isHhmm(b.bedtimeReminderTime)) c.bedtimeReminderTime = b.bedtimeReminderTime;
  // Sounds: only the known keys, each a short plain name; unknown keys and bad values are dropped.
  if (b.notificationSoundsJson && typeof b.notificationSoundsJson === 'object' && !Array.isArray(b.notificationSoundsJson)) {
    const cur = c.notificationSoundsJson && typeof c.notificationSoundsJson === 'object' ? c.notificationSoundsJson : DEFAULT_CONFIG.notificationSoundsJson;
    const sounds = { ...cur };
    for (const k of SOUND_KEYS) {
      const v = Object.prototype.hasOwnProperty.call(b.notificationSoundsJson, k) ? b.notificationSoundsJson[k] : undefined;
      if (typeof v === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(v)) sounds[k] = v;
    }
    c.notificationSoundsJson = sounds;
  }
  if (typeof b.setupDone === 'boolean') c.setupDone = b.setupDone;
  return c;
}

// A restored config: unknown fields are kept as-is, every validated field is rebuilt from safe values.
export function sanitizeRestoredConfig(raw) {
  const c = {};
  for (const k of Object.keys(raw)) if (!MANAGED_KEYS.includes(k)) c[k] = raw[k];
  Object.assign(c, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  return applyConfigInput(c, raw);
}
