import { t } from './i18n';
import { getSlothName } from './slothName';

// Playful sloth-voice reminder texts. Zero shame: nudges and invitations only, never guilt.
// Every string here needs a Hebrew twin in strings.he.js (keyed by the exact English text).
export const POOLS = {
  breakfast: [
    { title: '🥣 Good morning, leaf friend', body: '{name} stretched one arm and is thinking about breakfast. Tap to log it.' },
    { title: '🍃 Breakfast is hanging nearby', body: 'Slow and steady wins the morning. Tap to log your breakfast.' },
    { title: '🌿 Rise and munch', body: 'The canopy is warm and {name} is peckish. Tap to log breakfast.' },
    { title: '☀️ A sunny snack awaits', body: '{name} saved you a spot at the branch. Tap to log breakfast.' },
    { title: '🥑 Morning fuel, sloth style', body: 'No rush at all, just a cozy bite. Tap to log breakfast.' },
    { title: '🐾 Yawn... and nibble', body: '{name} is up (mostly). Tap to log your first meal of the day.' },
    { title: '🍞 Toast-scented thoughts', body: '{name} is dreaming of something warm and crunchy. A gentle breakfast is waiting.' },
    { title: '🍌 Branch-side banana?', body: 'No pressure, just a friendly nudge toward a cozy morning bite.' },
    { title: '🌅 Slow sunrise, soft start', body: '{name} is stretching toward the sun. Breakfast whenever you are ready.' },
    { title: '🥛 A little something first', body: 'Morning is nicer with a bite. Tap to log breakfast.' },
  ],
  lunch: [
    { title: '🍱 Lunch o\'clock, slowly', body: '{name} is humming a leafy tune. Tap to log your lunch.' },
    { title: '🌴 Midday munch break', body: 'Time to hang out with something tasty. Tap to log lunch.' },
    { title: '🍃 Pause the napping, a little', body: 'Lunch is calling in a very gentle voice. Tap to log it.' },
    { title: '🥗 {name} smells lunch', body: 'It is a good moment for a cozy bite. Tap to log lunch.' },
    { title: '🦥 Branch meeting: lunch', body: 'One item on the agenda, and it is delicious. Tap to log it.' },
    { title: '🍉 Snack-adjacent feelings', body: '{name} is feeling lunchy. Tap to log your meal.' },
    { title: '🥪 {name} spotted a sandwich cloud', body: 'Midday is a lovely time for a bite. Tap to log lunch.' },
    { title: '🌞 Sun is high, branch is cozy', body: 'A slow lunch makes the afternoon softer.' },
    { title: '🍜 Warm bowl weather', body: '{name} is sniffing the air for something tasty. Lunch whenever you like.' },
    { title: '🥕 Crunch break', body: 'Take a gentle pause and eat something nice. Tap to log lunch.' },
  ],
  dinner: [
    { title: '🍲 Dinner is on the branch', body: '{name} set the table, mostly with leaves. Tap to log dinner.' },
    { title: '🌇 Golden hour, cozy bowl', body: 'Evening glow and a warm plate. Tap to log your dinner.' },
    { title: '🍃 Time for a leafy supper', body: '{name} is unhurried and hungry. Tap to log dinner.' },
    { title: '🌙 Dinner before the dreams', body: 'A good meal makes the softest nap. Tap to log dinner.' },
    { title: '🥘 {name} is dinner-ready', body: 'Pull up a branch and enjoy it slowly. Tap to log dinner.' },
    { title: '✨ Cozy supper time', body: 'Warm food, calm vibes. Tap to log your dinner.' },
    { title: '🍛 Evening feast, leaf-sized', body: '{name} is setting out a cozy plate. Dinner whenever you are ready.' },
    { title: '🌆 The day is winding down', body: 'A calm dinner is a lovely way to close it. Tap to log dinner.' },
    { title: '🍝 {name} votes for something warm', body: 'Take your time and enjoy it. Tap to log dinner.' },
    { title: '🕯️ Soft light, full plate', body: 'Dinner is a good excuse to slow down.' },
  ],
  bedtime: [
    { title: '🌙 The canopy is getting dim', body: '{name} is yawning in solidarity. Screens off soon?' },
    { title: '🛌 Wind-down time', body: 'Soft light, slow breaths, and maybe the phone goes to sleep first.' },
    { title: '💤 Sleepy sloth signal', body: 'Time to curl up like a cozy leaf. Screens off soon?' },
    { title: '🍃 Tuck in, little leaf', body: 'The branch is ready for a long, gentle rest. Phone down when you can.' },
    { title: '🌿 Slow-motion bedtime', body: '{name} is already halfway to dreamland. Join in?' },
    { title: '🌌 Stars are out', body: 'A quiet moment, a blanket, and screens off. Sweet dreams ahead.' },
    { title: '🌛 Moonrise on the branch', body: '{name} is tucking in. The day was enough.' },
    { title: '🧸 Cozy-mode on', body: 'Dim the lights and let the day soften. Screens off when you can.' },
    { title: '😴 One slow yawn later', body: '{name} is nearly asleep. Care to follow?' },
    { title: '🌠 Dream delivery incoming', body: 'Blanket up, phone down. Tomorrow is a fresh leaf.' },
  ],
  water: [
    { title: '💧 Sip sip, sloth style', body: 'A little water makes the leaves greener. Take a slow sip.' },
    { title: '🌊 Hydration whimsy', body: '{name} just remembered how nice water is. Fancy a glass?' },
    { title: '🫗 Water break, no rush', body: 'A gentle glass keeps the jungle happy.' },
    { title: '🌧️ Little rain shower for you', body: 'Pour yourself a glass and enjoy it slowly.' },
    { title: '🐸 The pond says hello', body: '{name} is raising a tiny cup to you. Cheers!' },
    { title: '🍃 Cool, clear, refreshing', body: 'A few sips and {name} feels brand new.' },
    { title: '🥤 Tiny sip invitation', body: '{name} is holding a leaf cup. Join for a sip?' },
    { title: '💦 Splash of calm', body: 'A few slow sips can feel wonderful.' },
    { title: '🌴 Oasis moment', body: 'The jungle suggests a glass of water. No rush.' },
    { title: '🧊 Cool and clear', body: '{name} thinks water sounds lovely right now.' },
  ],
  test: [
    { title: '🦥 Hello from the treetops', body: 'Reminders are working. {name} waved, slowly.' },
    { title: '🎉 {name} says hi', body: 'Your reminders are all set and cozy.' },
    { title: '🍃 Test leaf delivered', body: 'It arrived! {name} is very proud.' },
    { title: '🌿 Ping from the canopy', body: 'Everything works. Time for a slow celebration.' },
    { title: '✨ Sloth mail has landed', body: 'Reminders are working. No rush to reply.' },
    { title: '🐾 Tiny paws, big signal', body: 'This is only a test, and it went beautifully.' },
    { title: '🌤️ Hello, sunny canopy', body: 'Reminders are working. {name} did a very slow wave.' },
    { title: '📬 Leaf mail, delivered', body: 'Everything is set up. {name} approves.' },
    { title: '🦥 All systems cozy', body: 'This test arrived safely. No reply needed.' },
    { title: '🎈 Gentle ping', body: '{name} says your reminders are good to go.' },
  ],
  snack: [
    { title: '🥜 A small bite?', body: '2 minutes is enough. Anything tiny counts.' },
    { title: '🍌 Snack time, gently', body: '{name} found a banana-shaped idea.' },
    { title: '🧀 Tiny bites count', body: 'A handful of something tasty is plenty.' },
    { title: '🥛 A cozy sip-and-nibble', body: 'A shake, a yogurt, or whatever sounds nice.' },
    { title: '🍃 Little fuel stop', body: '{name} suggests a small snack with no rush.' },
    { title: '🥑 Between-meal magic', body: 'Something small now makes the next stretch softer.' },
  ],
  comeback: [
    { title: '🍃 {name} saved your spot', body: 'The branch is cozy whenever you feel like visiting.' },
    { title: '🌿 A little hello', body: '{name} was thinking of you. No rush, just a wave from the canopy.' },
    { title: '☀️ Sunny branch, open door', body: 'Come by when it suits you. Everything is right where you left it.' },
    { title: '🦥 Slow wave from the treetops', body: '{name} is here and happy to see you whenever you are ready.' },
    { title: '🌙 Soft landing spot', body: 'A snack, a sip, or just a hello. All of it is welcome.' },
    { title: '🍂 Fresh leaf, fresh day', body: '{name} kept the branch warm for you.' },
  ],
};

// Small distinct offsets so different kinds do not rotate in lockstep.
const SALT = { breakfast: 0, lunch: 2, dinner: 4, bedtime: 1, water: 3, test: 5, comeback: 6, snack: 7 };

// Same text all day, a new one the next day. i separates several reminders of one kind on one day.
export function pickMessage(type, day, i = 0) {
  const pool = POOLS[type];
  const dayNum = Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 864e5);
  const p = pool[(dayNum + SALT[type] + i) % pool.length];
  const vars = { name: getSlothName() };
  return { title: t(p.title, vars), body: t(p.body, vars) };
}
