import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Volume2, Sparkles, Scale, Clock, Ruler } from 'lucide-react';
import { playSound } from '../utils/audioHaptics';
import { api } from '../utils/api';
import { LOCAL } from '../local/mode';
import { exportBackup, importBackup } from '../local/backup';
import { App as NativeApp } from '@capacitor/app';
import { isNativeApp, getReminderPrefs, setReminderPrefs, refreshReminders, sendTestReminder } from '../utils/reminders';
import { t } from '../utils/i18n';
import { goalDirectionOf } from '../utils/goal';
import { setSlothName, useSlothName } from '../utils/slothName';
import AiKeySettings from '../components/AiKeySettings';


const SOUND_OPTIONS = [
  { key: 'meal', label: 'Meal Logged', emoji: '🍽️', desc: 'Soft bell sine chime' },
  { key: 'bedtime', label: 'Camp Rest', emoji: '🌙', desc: 'Warm wind-down triangle tone' },
  { key: 'workout', label: 'Quest Complete', emoji: '⚔️', desc: 'Energetic 8-bit sawtooth' },
  { key: 'checkin', label: 'Sloth Chirp', emoji: '🦥', desc: 'Harp chime arpeggio' },
];

// Nutritional plan from Mifflin-St Jeor + the 7,700 kcal/kg rule. Works in every direction:
// losing means a deficit, gaining a surplus, and a goal within ~1kg means eating at maintenance.
function computeDietPlan(height, currentW, goalW, weeks, sex, birthYear) {
  const h = parseFloat(height) || 165;
  const cw = parseFloat(currentW) || 70;
  const gw = parseFloat(goalW) || 60;
  const w = Math.max(1, parseFloat(weeks) || 12);

  const dir = goalDirectionOf(cw, gw);
  const weightDiff = Math.abs(gw - cw);
  const totalDays = w * 7;
  const rate = weightDiff / w;
  const dailyChange = Math.round((weightDiff * 7700) / totalDays);

  // Mifflin-St Jeor with a light activity factor of 1.35; sex and age are optional refinements
  const by = parseInt(birthYear);
  const age = Number.isFinite(by) ? Math.min(90, Math.max(14, new Date().getFullYear() - by)) : 30;
  const sexConst = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  const bmr = (10 * cw) + (6.25 * h) - (5 * age) + sexConst;
  const tdee = Math.round(bmr * 1.35);

  let target;
  let range = 50;
  let tooFast = false;
  if (dir === 'maintain') {
    target = tdee;
    range = 100;
  } else if (dir === 'gain') {
    // Surplus is capped so a short timeline can't recommend an extreme intake
    target = tdee + Math.min(dailyChange, 500);
    tooFast = rate > 0.5;
  } else {
    // Gentle floor so a short timeline can't recommend too little
    target = Math.max(sex === 'male' ? 1500 : 1200, tdee - dailyChange);
    tooFast = rate > 1;
  }
  const safeTarget = Math.round(target);

  return {
    dir,
    gain: dir === 'gain',
    weightDiff: Math.round(weightDiff * 10) / 10,
    weeklyRateKg: rate.toFixed(2),
    tooFast,
    goalBmi: gw / ((h / 100) ** 2),
    tdee,
    dailyChange,
    target: safeTarget,
    targetMin: Math.max(1000, safeTarget - range),
    targetMax: safeTarget + range,
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HHMM = /^\d{2}:\d{2}$/;
const AUTOSAVE_MS = 800;

// Only fields that hold a usable value are sent, so a half-typed or cleared input never overwrites good data.
function buildPayload(v, { includeTargetDate }) {
  const payload = {};
  const pos = (x) => Number.isFinite(x) && x > 0;
  const height = parseFloat(v.heightCm);
  const start = parseFloat(v.currentWeight);
  const goal = parseFloat(v.goalWeight);
  const min = parseInt(v.targetMin);
  const max = parseInt(v.targetMax);
  if (pos(height)) payload.heightCm = height;
  if (pos(start)) payload.startWeightKg = start;
  if (pos(goal)) payload.targetWeightKg = goal;
  if (pos(min)) payload.dailyCaloricTargetMin = min;
  if (pos(max)) payload.dailyCaloricTargetMax = max;
  payload.sex = v.sex === 'female' || v.sex === 'male' ? v.sex : null;
  const by = String(v.birthYear).trim();
  if (/^\d{4}$/.test(by)) payload.birthYear = parseInt(by);
  else if (by === '') payload.birthYear = null;
  const name = String(v.slothName).trim();
  payload.slothName = name === '' ? null : name;
  if (HHMM.test(v.bedtime)) payload.bedtimeReminderTime = v.bedtime;
  if (v.mealTimes.length && v.mealTimes.every((m) => HHMM.test(m))) payload.mealTimesJson = v.mealTimes;
  const weeks = parseFloat(v.durationWeeks);
  if (includeTargetDate && pos(weeks)) payload.targetDate = new Date(Date.now() + weeks * WEEK_MS).toISOString();
  return Object.keys(payload).length ? payload : null;
}

export default function SettingsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoStatus, setAutoStatus] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [setupPending, setSetupPending] = useState(false); // first run: welcome banner + LET'S GO
  const navigate = useNavigate();
  const savedName = useSlothName();

  // Diet & Body Profile inputs
  const [heightCm, setHeightCm] = useState('168');
  const [currentWeight, setCurrentWeight] = useState('74');
  const [goalWeight, setGoalWeight] = useState('64');
  const [durationWeeks, setDurationWeeks] = useState('12');
  const [sex, setSex] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [slothName, setSlothNameInput] = useState('');
  const [latestKg, setLatestKg] = useState(null);

  // Targets & Bedtime
  const [targetMin, setTargetMin] = useState(1450);
  const [targetMax, setTargetMax] = useState(1550);
  const [bedtime, setBedtime] = useState('23:00');
  const [mealTimes, setMealTimes] = useState(['09:30', '13:30', '18:00', '21:00']);
  const [prefs, setPrefs] = useState(getReminderPrefs());
  const [testMsg, setTestMsg] = useState('');
  const native = isNativeApp();
  const restoreRef = useRef();
  const [dataMsg, setDataMsg] = useState('');

  // Autosave bookkeeping lives in refs so the debounce timer and unmount flush never see stale values.
  const loadedOkRef = useRef(false);
  const lastSavedRef = useRef({ mealTimes: null, bedtime: null, slothName: null });
  const dirtyRef = useRef(false);
  const weeksDirtyRef = useRef(false);
  const timerRef = useRef(null);
  const statusTimerRef = useRef(null);
  const valuesRef = useRef({});
  const saveRef = useRef(null);

  async function handleBackup() {
    try {
      await exportBackup();
      setDataMsg(t('Backup ready ✓'));
    } catch (err) {
      if (!/cancel/i.test(String(err?.message))) setDataMsg(t('Something went wrong'));
    }
  }

  async function handleRestore(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !window.confirm(t('Restore this backup? It replaces everything on this phone.'))) return;
    try {
      await importBackup(file);
      setDataMsg(t('Restored ✓'));
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setDataMsg(t('That file is not a Health Animal backup.'));
    }
  }

  function togglePref(key) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setReminderPrefs(next);
    refreshReminders();
  }

  async function handleTest() {
    const ok = await sendTestReminder();
    setTestMsg(ok ? t('Test sent, it arrives in 5 seconds.') : t('Notifications are blocked. Allow them in Android settings.'));
  }

  useEffect(() => {
    api('/api/settings')
      .then((r) => {
        if (!r.ok) throw new Error(`settings load failed: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.heightCm) setHeightCm(String(data.heightCm));
        if (data.startWeightKg) setCurrentWeight(String(data.startWeightKg));
        if (data.targetWeightKg) setGoalWeight(String(data.targetWeightKg));
        if (data.sex === 'female' || data.sex === 'male') setSex(data.sex);
        if (data.birthYear) setBirthYear(String(data.birthYear));
        if (data.slothName) setSlothNameInput(data.slothName);
        setSlothName(data.slothName);
        if (data.dailyCaloricTargetMin) setTargetMin(data.dailyCaloricTargetMin);
        if (data.dailyCaloricTargetMax) setTargetMax(data.dailyCaloricTargetMax);
        if (data.bedtimeReminderTime) setBedtime(data.bedtimeReminderTime);
        if (Array.isArray(data.mealTimesJson) && data.mealTimesJson.length) setMealTimes(data.mealTimesJson);
        if (data.setupDone === false) setSetupPending(true);
        lastSavedRef.current = {
          mealTimes: Array.isArray(data.mealTimesJson) && data.mealTimesJson.length ? data.mealTimesJson : null,
          bedtime: data.bedtimeReminderTime || null,
          slothName: data.slothName || null,
        };
        // The timeline is stored as a target date; turn it back into weeks
        const msLeft = data.targetDate ? new Date(data.targetDate).getTime() - Date.now() : NaN;
        setDurationWeeks(String(Number.isFinite(msLeft) && msLeft > WEEK_MS ? Math.round(msLeft / WEEK_MS) : 12));
        loadedOkRef.current = true;
      })
      .catch((err) => {
        console.error(err);
        setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // Latest weigh-in feeds the plan; a failure just means the plan falls back to the start weight
  useEffect(() => {
    api('/api/checkin/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const kg = parseFloat(d?.latestCheckin?.weightKg); if (kg > 0) setLatestKg(kg); })
      .catch(() => {});
  }, []);

  // Pending edits are written when the user leaves: unmount, tab hidden, or the app going to background.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    const pauseHandle = native ? NativeApp.addListener('pause', flush) : null;
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      pauseHandle?.then((h) => h.remove()).catch(() => {});
      flush();
      clearTimeout(statusTimerRef.current);
    };
  }, []);

  // Compute plan dynamically
  const plan = computeDietPlan(heightCm, latestKg || currentWeight, goalWeight, durationWeeks, sex, birthYear);

  // Auto apply plan targets when inputs change
  function handleApplyPlan() {
    setTargetMin(plan.targetMin);
    setTargetMax(plan.targetMax);
    markDirty();
    playSound.checkin();
  }

  valuesRef.current = { sex, birthYear, slothName, heightCm, currentWeight, goalWeight, durationWeeks, targetMin, targetMax, bedtime, mealTimes };
  saveRef.current = save;

  function flashStatus(msg) {
    setAutoStatus(msg);
    clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setAutoStatus(''), 2500);
  }

  async function save({ manual = false, finishSetup = false } = {}) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const includeTargetDate = weeksDirtyRef.current;
    const wasDirty = dirtyRef.current;
    let payload = buildPayload(valuesRef.current, { includeTargetDate });
    if (finishSetup) payload = { ...payload, setupDone: true };
    dirtyRef.current = false;
    weeksDirtyRef.current = false;

    if (manual) setSaving(true);
    let ok = false;
    try {
      if (!payload) throw new Error('nothing valid to save');
      const res = await api('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      ok = res.ok;
      if (ok) setSlothName((await res.json()).config?.slothName);
    } catch (err) {
      console.error(err);
    }

    if (ok) {
      const last = lastSavedRef.current;
      const timesChanged = payload.mealTimesJson && JSON.stringify(payload.mealTimesJson) !== JSON.stringify(last.mealTimes);
      const bedChanged = payload.bedtimeReminderTime && payload.bedtimeReminderTime !== last.bedtime;
      const nameChanged = (payload.slothName ?? null) !== last.slothName;
      if (timesChanged || bedChanged || nameChanged) {
        lastSavedRef.current = {
          mealTimes: payload.mealTimesJson || last.mealTimes,
          bedtime: payload.bedtimeReminderTime || last.bedtime,
          slothName: payload.slothName ?? null,
        };
        refreshReminders();
      }
    } else if (wasDirty) {
      // Keep the edit pending so the next change, or leaving the screen, tries again
      dirtyRef.current = true;
      if (includeTargetDate) weeksDirtyRef.current = true;
    }

    if (manual) {
      setSaving(false);
      if (ok) {
        playSound.checkin();
        setSaved(true);
        setAutoStatus('');
        setTimeout(() => setSaved(false), 2500);
      } else {
        flashStatus(t('Not saved, try again'));
      }
    } else {
      flashStatus(ok ? t('Saved ✓') : t('Not saved, try again'));
    }
    return ok;
  }

  // Called by every user edit: wait for a pause in typing, then save the latest values.
  function markDirty({ weeks = false } = {}) {
    dirtyRef.current = true;
    if (weeks) weeksDirtyRef.current = true;
    if (!loadedOkRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveRef.current?.(), AUTOSAVE_MS);
  }

  // Save right now if an edit is waiting on the timer; otherwise there is nothing to do.
  function flush() {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    saveRef.current?.();
  }

  async function handleSave() {
    await save({ manual: true });
  }

  async function handleFinishSetup() {
    if (await save({ manual: true, finishSetup: true })) {
      setSetupPending(false);
      navigate('/dashboard');
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#0b1912]">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        <span className="font-pixel text-xs text-amber-300">{t('LOADING JOURNAL...')}</span>
      </div>
    );
  }

  const apkUrl = import.meta.env.VITE_APK_DOWNLOAD_URL || '';
  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000 (proxy)';

  return (
    <div className="flex-1 overflow-y-auto safe-bottom bg-[#0b1912] pixel-crt text-amber-100">
      <div className="max-w-sm mx-auto px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-pixel text-xs text-amber-200 flex items-center gap-2">
            <span>🦥</span> {t('SLOTH FUEL PLANNER')}
          </h1>
          <span className="shrink-0 whitespace-nowrap text-[9px] font-pixel text-emerald-400 bg-[#12281b] px-2 py-0.5 rounded border border-emerald-800">
            {t('AUTO MATH')}
          </span>
        </div>

        {setupPending && (
          <div className="pixel-box-wood p-4 rounded-2xl space-y-3">
            <p className="text-[11px] font-pixel text-amber-200 leading-relaxed">
              {t("Welcome! 🦥 Let's set your goals first: your weight, goal and timeline. {name} will tailor everything to you.", { name: savedName })}
            </p>
            <p className="text-[10px] font-pixel text-emerald-300/80 leading-relaxed">
              {t("{name} is a tracking buddy, not a professional. This app doesn't replace advice from a doctor, dietitian or nutritionist.", { name: savedName })}
            </p>
            <div className="space-y-1">
              <label className="text-[10px] font-pixel text-amber-300/70 flex items-center gap-1">
                {t('What will you call your sloth?')}
              </label>
              <input
                type="text"
                value={slothName}
                maxLength={20}
                onChange={(e) => { setSlothNameInput(e.target.value); markDirty(); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs focus:outline-none focus:border-amber-500"
                placeholder={t('Slomo')}
              />
            </div>
            <motion.button
              type="button"
              onClick={handleFinishSetup}
              disabled={saving}
              whileTap={{ scale: 0.96 }}
              className="w-full py-3 rounded-xl font-pixel text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg pixel-btn-gold text-amber-950 font-bold"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("LET'S GO 🦥")}
            </motion.button>
          </div>
        )}

        {/* 1. Body & Diet Goal Form */}
        <div className="pixel-box-wood p-4 rounded-2xl space-y-3">
          <h2 className="font-pixel text-xs text-amber-300 flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5" /> {t('BODY STATS & TIMELINE')}
          </h2>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Sloth name */}
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] font-pixel text-amber-300/70 flex items-center gap-1">
                {t("SLOTH'S NAME")}
              </label>
              <input
                type="text"
                value={slothName}
                maxLength={20}
                onChange={(e) => { setSlothNameInput(e.target.value); markDirty(); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs focus:outline-none focus:border-amber-500"
                placeholder={t('Slomo')}
              />
            </div>

            {/* Height */}
            <div className="space-y-1">
              <label className="text-[10px] font-pixel text-amber-300/70 flex items-center gap-1">
                {t('HEIGHT (CM)')}
              </label>
              <input
                type="number"
                value={heightCm}
                onChange={(e) => { setHeightCm(e.target.value); markDirty(); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs focus:outline-none focus:border-amber-500"
                placeholder="168"
              />
            </div>

            {/* Current Weight */}
            <div className="space-y-1">
              <label className="text-[10px] font-pixel text-amber-300/70 flex items-center gap-1">
                {t('START (KG)')}
              </label>
              <input
                type="number"
                step="0.5"
                value={currentWeight}
                onChange={(e) => { setCurrentWeight(e.target.value); markDirty(); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs focus:outline-none focus:border-amber-500"
                placeholder="74"
              />
              {latestKg && (
                <div className="text-[9px] font-pixel text-emerald-400/80">
                  {t('Latest weigh-in: {n}kg', { n: latestKg })}
                  {latestKg !== parseFloat(currentWeight) && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={() => { setCurrentWeight(String(latestKg)); markDirty(); }}
                        className="underline cursor-pointer"
                      >
                        {t('Start fresh from {n}kg', { n: latestKg })}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Goal Weight */}
            <div className="space-y-1">
              <label className="text-[10px] font-pixel text-amber-300/70 flex items-center gap-1">
                {t('GOAL (KG)')}
              </label>
              <input
                type="number"
                step="0.5"
                value={goalWeight}
                onChange={(e) => { setGoalWeight(e.target.value); markDirty(); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs focus:outline-none focus:border-amber-500"
                placeholder="64"
              />
            </div>

            {/* Duration in Weeks */}
            <div className="space-y-1">
              <label className="text-[10px] font-pixel text-amber-300/70 flex items-center gap-1">
                {t('DURATION (WKS)')}
              </label>
              <input
                type="number"
                value={durationWeeks}
                onChange={(e) => { setDurationWeeks(e.target.value); markDirty({ weeks: true }); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs focus:outline-none focus:border-amber-500"
                placeholder="12"
                min="2"
                max="52"
              />
            </div>

            {/* Sex */}
            <div className="space-y-1">
              <label className="text-[10px] font-pixel text-amber-300/70 flex items-center gap-1">
                {t('SEX')}
              </label>
              <select
                value={sex}
                onChange={(e) => { setSex(e.target.value); markDirty(); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="">{t('Prefer not to say')}</option>
                <option value="female">{t('Female')}</option>
                <option value="male">{t('Male')}</option>
              </select>
            </div>

            {/* Birth year */}
            <div className="space-y-1">
              <label className="text-[10px] font-pixel text-amber-300/70 flex items-center gap-1">
                {t('BIRTH YEAR')}
              </label>
              <input
                type="number"
                value={birthYear}
                onChange={(e) => { setBirthYear(e.target.value); markDirty(); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs focus:outline-none focus:border-amber-500"
                placeholder="1995"
              />
            </div>
          </div>

          {/* Dynamic AI / Nutritional Plan Preview */}
          <div className="bg-[#182c20] border-2 border-[#2b593f] rounded-xl p-3 space-y-2 mt-2 shadow-inner">
            <div className="flex items-center justify-between text-[10px] font-pixel text-emerald-300">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" /> {t('SLOTH CALCULATION')}
              </span>
              <span>{t('~{n} kg/week', { n: plan.weeklyRateKg })}</span>
            </div>

            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[10px] font-pixel text-amber-200/70">{t('RECOMMENDED FUEL:')}</span>
                <div className="text-lg font-pixel text-amber-300">
                  {plan.targetMin} – {plan.targetMax} <span className="text-xs text-amber-400">{t('KCAL')}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleApplyPlan}
                className="pixel-btn-action text-[9px] font-pixel px-2.5 py-1.5 rounded-lg cursor-pointer shadow-md"
              >
                {t('APPLY 🎯')}
              </button>
            </div>

            <div className="text-[9px] font-pixel text-emerald-400/80 border-t border-[#254d37] pt-1.5 flex justify-between">
              <span>
                {plan.dir === 'maintain'
                  ? t('Goal: maintain ~{kg}kg', { kg: parseFloat(goalWeight) || '' })
                  : plan.gain
                    ? t('Goal: +{kg}kg in {w}wks', { kg: plan.weightDiff, w: durationWeeks })
                    : t('Goal: -{kg}kg in {w}wks', { kg: plan.weightDiff, w: durationWeeks })}
              </span>
              <span>{t('Burn: ~{n} kcal', { n: plan.tdee })}</span>
            </div>
            {plan.tooFast && (
              <div className="text-[9px] font-pixel text-amber-300/80">
                {plan.gain
                  ? t('Tip: gaining more than ~0.5kg/week is hard to do healthily, try more weeks.')
                  : t('Tip: losing more than ~1kg/week is a lot, try more weeks.')}
              </div>
            )}
            {plan.dir === 'lose' && plan.goalBmi < 18.5 && (
              <div className="text-[9px] font-pixel text-amber-300/80">
                {t('This goal is below the usual healthy range for your height. Maybe check it with a doctor or dietitian 🍃')}
              </div>
            )}
            {(plan.weightDiff >= 10 || plan.tooFast) && (
              <div className="text-[9px] font-pixel text-amber-300/80">
                {t('For big changes, a doctor or dietitian can help you plan.')}
              </div>
            )}
          </div>
        </div>

        {/* 2. Active Calorie Targets (Editable if user wants custom tweaks) */}
        <div className="pixel-box-wood p-4 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-pixel text-xs text-amber-300 flex items-center gap-1.5">
              <span>🍗</span> {t('ACTIVE DAILY FUEL TARGET')}
            </h2>
            <span className="text-[9px] font-pixel text-amber-400/60">{t('KCAL/DAY')}</span>
          </div>

          <div className="flex gap-2.5">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-pixel text-amber-300/70">{t('MIN KCAL')}</label>
              <input
                type="number"
                value={targetMin}
                onChange={(e) => { setTargetMin(parseInt(e.target.value) || 0); markDirty(); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-pixel text-amber-300/70">{t('MAX KCAL')}</label>
              <input
                type="number"
                value={targetMax}
                onChange={(e) => { setTargetMax(parseInt(e.target.value) || 0); markDirty(); }}
                className="w-full bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs"
              />
            </div>
          </div>
        </div>

        {/* 3. Reminders & times */}
        <div className="pixel-box-wood p-4 rounded-2xl space-y-3">
          <h2 className="font-pixel text-xs text-amber-300 flex items-center gap-1.5">
            <span>🔔</span> {t('REMINDERS & TIMES')}
          </h2>
          {[['BREAKFAST', 0, '🥣'], ['LUNCH', 1, '🍱'], ['DINNER', 2, '🍲']].map(([name, i, icon]) => (
            <div key={name} className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-pixel text-amber-200/80">{icon} {t(name)}</span>
              <input
                type="time"
                value={mealTimes[i] || ''}
                onChange={(e) => { const val = e.target.value; setMealTimes((m) => m.map((v, j) => (j === i ? val : v))); markDirty(); }}
                className="bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs w-32"
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-pixel text-amber-200/80">🌙 {t('BEDTIME')}</span>
            <input type="time" value={bedtime} onChange={(e) => { setBedtime(e.target.value); markDirty(); }} className="bg-[#120a05] border-2 border-[#3f2413] text-amber-100 rounded-xl px-3 py-2 font-pixel text-xs w-32" />
          </div>

          <div className="pt-3 border-t border-[#3b2011] space-y-2.5">
            {native ? (
              <>
                {[['meals', 'Meal reminders'], ['bedtime', 'Bedtime wind-down'], ['water', 'Water breaks (11:00, 14:00, 17:00)']].map(([key, name]) => (
                  <button
                    key={key}
                    type="button"
                    role="switch"
                    aria-checked={prefs[key]}
                    onClick={() => togglePref(key)}
                    className="w-full flex items-center justify-between gap-3 py-1.5 cursor-pointer"
                  >
                    <span className="text-[10px] font-pixel text-amber-100 text-start">{t(name)}</span>
                    <span className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${prefs[key] ? 'bg-emerald-600' : 'bg-[#3a2212]'}`}>
                      <span className={`absolute top-0.5 start-0.5 w-5 h-5 rounded-full bg-amber-100 transition-transform ${prefs[key] ? 'translate-x-5 rtl:-translate-x-5' : ''}`} />
                    </span>
                  </button>
                ))}
                <button type="button" onClick={handleTest} className="w-full py-2.5 rounded-xl pixel-btn-wood text-[10px] font-pixel cursor-pointer">
                  {t('SEND A TEST REMINDER')}
                </button>
                {testMsg && <p className="text-[10px] font-pixel text-emerald-300">{testMsg}</p>}
                <p className="text-[9px] font-pixel text-amber-300/50">{t('Meal reminders are skipped for meals you already logged.')}</p>
              </>
            ) : (
              <p className="text-[10px] font-pixel text-amber-200/70">
                {t('Reminders arrive in the Android app.')}{' '}
                {apkUrl
                  ? <a href={apkUrl} className="text-emerald-400 underline">{t('Download the Android app')}</a>
                  : t('Build the Android app from the source code (see README).')}
              </p>
            )}
          </div>
        </div>

        {/* 4. Acoustic Routing */}
        <div className="pixel-box-wood p-4 rounded-2xl space-y-3">
          <h2 className="font-pixel text-xs text-amber-300 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5" />
            {t('8-BIT SYNTH AUDIO')}
          </h2>
          <div className="space-y-2">
            {SOUND_OPTIONS.map(({ key, label, emoji, desc }) => (
              <div
                key={key}
                className="flex items-center justify-between bg-[#180e08] border border-[#3b2011] rounded-xl px-3 py-2.5"
              >
                <div>
                  <div className="text-xs font-pixel text-amber-200">
                    {emoji} {t(label)}
                  </div>
                  <div className="text-[10px] font-pixel text-amber-200/50 mt-0.5">{t(desc)}</div>
                </div>
                <motion.button
                  id={`test-sound-${key}`}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => playSound[key]?.()}
                  className="pixel-btn-wood text-[10px] font-pixel px-3 py-2 rounded-lg cursor-pointer"
                >
                  {t('PLAY')}
                </motion.button>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Where the data lives */}
        {LOCAL ? (
          <>
          <div className="pixel-box-wood p-4 rounded-2xl space-y-3">
            <h2 className="font-pixel text-xs text-amber-300 flex items-center gap-1.5">
              <span>📱</span> {t('DATA ON THIS PHONE')}
            </h2>
            <p className="text-[10px] font-pixel text-amber-200/70">{t('Your history is saved on this phone, no account needed.')}</p>
            <button type="button" onClick={handleBackup} className="w-full py-2.5 rounded-xl pixel-btn-wood text-[10px] font-pixel cursor-pointer">
              💾 {t('BACKUP TO FILE')}
            </button>
            <button type="button" onClick={() => restoreRef.current?.click()} className="w-full py-2.5 rounded-xl pixel-btn-wood text-[10px] font-pixel cursor-pointer">
              📂 {t('RESTORE FROM FILE')}
            </button>
            <input ref={restoreRef} type="file" className="hidden" onChange={handleRestore} />
            {dataMsg && <p className="text-[10px] font-pixel text-emerald-300">{dataMsg}</p>}
            <p className="text-[9px] font-pixel text-amber-300/50">
              {t('Save the backup somewhere safe (Drive, or WhatsApp to yourself). If the phone is lost or reset, only a backup can bring your history back.')}
            </p>
          </div>
          <AiKeySettings />
          </>
        ) : (
          <div className="pixel-box-wood p-4 rounded-2xl space-y-2">
            <h2 className="font-pixel text-xs text-amber-300 flex items-center gap-1.5">
              <span>📡</span> {t('HOME SERVER LINK')}
            </h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-pixel text-emerald-300/80 break-all">{apiUrl}</span>
            </div>
          </div>
        )}

        {loadFailed && (
          <p className="text-[10px] font-pixel text-amber-300">{t('Could not load your settings. Changes are not saved automatically, use the save button.')}</p>
        )}
        {autoStatus && <p className="text-[10px] font-pixel text-emerald-300 text-center" role="status">{autoStatus}</p>}

        {/* 6. Save Button */}
        <motion.button
          onClick={handleSave}
          disabled={saving}
          whileTap={{ scale: 0.96 }}
          className={`w-full py-3 rounded-xl font-pixel text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
            saved
              ? 'pixel-btn-action'
              : 'pixel-btn-gold text-amber-950 font-bold'
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? t('✓ SAVED TO DIARY!') : t('SAVE SETTINGS 📜')}
        </motion.button>

        <div className="space-y-1 px-1 pt-2 text-center">
          <p className="text-[9px] font-pixel text-amber-300/60 leading-relaxed">
            {t("Not medical or nutritional advice. For personal guidance, talk to a doctor, dietitian or nutritionist.")}
          </p>
          <p className="text-[9px] font-pixel text-amber-300/60 leading-relaxed">
            {t("If food or weight feels heavy right now, please reach out to a professional or a support line. You deserve support 🍃")}
          </p>
        </div>
      </div>
    </div>
  );
}
