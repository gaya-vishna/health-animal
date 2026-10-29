#!/usr/bin/env node
// Set or clear a web password. Run on the server (nobody else can):
//
//   List accounts:     docker compose exec app node scripts/reset-password.js --list
//   Set a password:    docker compose exec app node scripts/reset-password.js --user mom --password NewPass123
//   Remove password:   docker compose exec app node scripts/reset-password.js --user mom --clear
//
// Locally (dev): node scripts/reset-password.js --user mom --password NewPass123
// Passwords are 8-128 characters. An account with no password signs in with just its name
// (unless the server runs with REQUIRE_PASSWORD=true, which then locks it out until you set one).
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../lib/password');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list' || a === '--clear') out[a.slice(2)] = true;
    else if (a === '--user' || a === '--password') out[a.slice(2)] = argv[++i];
    else out.bad = a;
  }
  return out;
}

const usage = () => {
  console.error('Usage:\n  node scripts/reset-password.js --list\n  node scripts/reset-password.js --user <name> --password <8-128 characters>\n  node scripts/reset-password.js --user <name> --clear');
  process.exitCode = 1;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.bad) return usage();
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });

  if (args.list || (!args.user && !args.password && !args.clear)) {
    console.log(users.length ? 'Accounts:' : 'No accounts yet.');
    users.forEach((u) => console.log(`  ${u.email}   (created ${u.createdAt.toISOString().slice(0, 10)})`));
    if (!args.list) usage();
    return;
  }

  if (typeof args.user !== 'string' || !args.user.trim() || (!!args.clear === !!args.password)) return usage();
  const username = args.user.trim().toLowerCase();
  const user = users.find((u) => u.email === username);
  if (!user) {
    console.error(`No account named "${username}".`);
    console.error('Existing accounts: ' + (users.map((u) => u.email).join(', ') || '(none)'));
    process.exitCode = 1;
    return;
  }

  if (args.clear) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: null } });
    console.log(`Password removed for "${user.email}". They sign in with just their name.`);
    return;
  }

  if (typeof args.password !== 'string' || args.password.length < 8 || args.password.length > 128) {
    console.error('The password must be 8-128 characters.');
    process.exitCode = 1;
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(args.password) } });
  console.log(`Password set for "${user.email}". Existing sessions stay signed in until they expire.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
