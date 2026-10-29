import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, learnMealTimes, yesterdayReaction, isLucky, sagaFor, pick, dayNumOf } from '../src/utils/reminderPlan.js';
import { REACTIONS, POOLS } from '../src/utils/reminderPools.js';

const mk = (type, time) => ({ mealType: type, time });
const histWith = (perDay) => ({ days: perDay.map((meals) => ({ meals, waterMl: 0, proteinHit: false })), targets: { waterMl: 2000 } });
const SETTINGS = ['09:30', '13:30', '18:00', '21:00'];

test('learnMealTimes: median + 10 min, clamped, needs 3 samples', () => {
  const lunch = ['12:30', '12:40', '12:50', '12:40', '12:40'];
  const dinner = ['19:15', '18:55', '19:05', '19:10', '19:00'];
  const days = lunch.map((l, i) => [mk('lunch', l), mk('dinner', dinner[i])]);
  const t = learnMealTimes(histWith(days), SETTINGS);
  assert.equal(t[1], '12:50');
  assert.equal(t[2], '19:15');
  assert.equal(t[0], '09:30'); // no samples
  assert.equal(t[3], '21:00');
});

test('learnMealTimes: breakfast clamps to setting -90 min; breakfast counts as morning', () => {
  const days = [0, 1, 2].map(() => [mk('breakfast', '06:50')]);
  assert.equal(learnMealTimes(histWith(days), SETTINGS)[0], '08:00');
});

test('learnMealTimes: floor 07:30 and fewer than 3 samples keep the setting', () => {
  const early = [0, 1, 2].map(() => [mk('morning', '05:00')]);
  assert.equal(learnMealTimes(histWith(early), ['08:00', '13:00', '18:00'])[0], '07:30');
  const two = [0, 1].map(() => [mk('lunch', '12:00')]);
  assert.equal(learnMealTimes(histWith(two), SETTINGS)[1], '13:30');
});

const NOW = new Date(2026, 5, 1, 6, 0, 0); // a Monday morning
const PREFS = { meals: true, bedtime: true, water: true, snacks: true };
const base = { prefs: PREFS, times: SETTINGS, bedtime: '21:00', now: NOW };

test('smart off uses settings times', () => {
  const learned = ['08:00', '12:00', '17:00'];
  const clock = (l) => l.filter((n) => n.id < 1e5 && n.id % 10 < 3).slice(0, 3).map((n) => n.schedule.at.toTimeString().slice(0, 5));
  assert.deepEqual(clock(buildSchedule({ ...base, learned, smart: false })), ['09:30', '13:30', '18:00']);
  assert.deepEqual(clock(buildSchedule({ ...base, learned, smart: true })), ['08:00', '12:00', '17:00']);
});

test('lucky share over a 400-day sweep (20 full cycles) is <= 5% and never on bedtime/comeback', () => {
  let hits = 0, total = 0;
  for (let n = 0; n < 400; n++) for (const slot of [0, 1, 2, 4, 5, 6, 7, 8]) { total++; if (isLucky(20000 + n, slot)) hits++; }
  assert.ok(hits / total <= 0.05, `lucky share ${hits / total}`);
  assert.ok(hits > 0);
  const list = buildSchedule({ ...base, saga: false });
  const bedtimes = list.filter((n) => n.id % 10 === 3);
  assert.ok(bedtimes.length >= 2);
  for (const b of bedtimes) assert.ok(POOLS.bedtime.some((p) => b.title === p.title.replaceAll('{name}', 'Slomo')), 'bedtime from pool');
  // comeback
  const away = buildSchedule({ ...base, awayDays: 4 });
  for (const c of away.filter((n) => n.id % 10 === 9)) assert.ok(POOLS.comeback.some((p) => c.title === p.title.replaceAll('{name}', 'Slomo')));
});

test('slot 3 carries the saga episode for the weekday, or the bedtime pool when off', () => {
  const on = buildSchedule({ ...base, saga: true }).filter((n) => n.id % 10 === 3);
  for (const n of on) {
    const day = new Date(n.schedule.at);
    const wd = (day.getDay() + 6) % 7;
    assert.match(n.title, new RegExp(`· ${wd + 1}/7$`));
    assert.equal(n.body, sagaFor(day).body);
  }
  const off = buildSchedule({ ...base, saga: false }).filter((n) => n.id % 10 === 3);
  for (const n of off) assert.ok(!/\/7$/.test(n.title));
});

test('reaction only on the first remaining reminder when a trigger is met', () => {
  const none = buildSchedule({ ...base, reaction: { d0: null, d1: null } });
  const hit = buildSchedule({ ...base, reaction: { d0: 'protein', d1: null } });
  const react = (n) => REACTIONS.protein.some((r) => n.title === r.title.replaceAll('{name}', 'Slomo'));
  const day0 = hit.filter((n) => n.schedule.at.getDate() === NOW.getDate()).sort((a, b) => a.schedule.at - b.schedule.at);
  assert.ok(react(day0[0]));
  assert.ok(day0.slice(1).every((n) => !react(n)));
  assert.ok(hit.filter((n) => n.schedule.at.getDate() !== NOW.getDate()).every((n) => !react(n)));
  assert.deepEqual(none.map((n) => n.title), buildSchedule({ ...base }).map((n) => n.title));
  // tapering: no reaction
  const taper = buildSchedule({ ...base, awayDays: 4, reaction: { d0: 'protein', d1: 'protein' } });
  assert.ok(taper.every((n) => !react(n)));
});

test('yesterdayReaction triggers', () => {
  const h = {
    targets: { waterMl: 2000 },
    days: [
      { meals: [mk('lunch', '12:00')], waterMl: 2500, proteinHit: false },
      { meals: [mk('breakfast', '08:00'), mk('lunch', '12:00'), mk('dinner', '19:00')], waterMl: 0, proteinHit: false },
    ],
  };
  assert.deepEqual(yesterdayReaction(h), { d0: 'meals3', d1: 'water' });
  assert.deepEqual(yesterdayReaction({ days: [{ meals: [], waterMl: 0 }, { meals: [], proteinHit: true }] }), { d0: 'protein', d1: null });
});

test('no duplicate ids and count never exceeds the old behaviour', () => {
  // Old behaviour: same slots, so compare with every learning feature off and the standard pools.
  for (const awayDays of [0, 4, 10, 70]) {
    const full = buildSchedule({ ...base, awayDays, learned: ['08:00', '12:00', '17:00'], reaction: { d0: 'meals3', d1: 'water' } });
    const plain = buildSchedule({ ...base, awayDays, smart: false, saga: false });
    const ids = full.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, `dup ids at ${awayDays}`);
    assert.ok(full.length <= plain.length + 0, `count ${full.length} > ${plain.length} at ${awayDays}`);
    console.log(`awayDays ${awayDays}: ${full.length} reminders`);
  }
  assert.equal(buildSchedule({ ...base, awayDays: 70 }).length, 0);
  assert.ok(pick('lunch', NOW).title.length > 0 && dayNumOf(NOW) > 0);
});
