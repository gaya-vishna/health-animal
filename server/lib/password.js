const bcrypt = require('bcryptjs');

// Web passwords are optional. A stored hash looks like "pw1:<bcrypt>". Older accounts hold a random,
// never-shown hash from before passwords existed (no prefix): those count as "no password set".
const PREFIX = 'pw1:';
const COST = 10;
// Compared against when the username is unknown, so a miss takes about as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

const hasPassword = (user) => !!user && typeof user.passwordHash === 'string' && user.passwordHash.startsWith(PREFIX);
const hashPassword = async (pw) => PREFIX + (await bcrypt.hash(pw, COST));
const checkPassword = (pw, user) => bcrypt.compare(String(pw), user.passwordHash.slice(PREFIX.length));
const fakeCheck = (pw) => bcrypt.compare(String(pw), DUMMY_HASH);

module.exports = { hasPassword, hashPassword, checkPassword, fakeCheck, PREFIX };
