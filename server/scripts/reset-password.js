#!/usr/bin/env node
// Family password reset. Run on the server (nobody else can):
//
//   List accounts:        docker compose exec app node scripts/reset-password.js --list
//   Reset (new random):   docker compose exec app node scripts/reset-password.js mom
//   Reset (you choose):   docker compose exec app node scripts/reset-password.js mom NewPass123
//
// Locally (dev): node scripts/reset-password.js mom
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters

const randomPassword = () =>
  Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

async function main() {
  const [arg, chosen] = process.argv.slice(2);
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });

  if (!arg || arg === '--list') {
    console.log(users.length ? 'Accounts:' : 'No accounts yet.');
    users.forEach((u) => console.log(`  ${u.email}   (created ${u.createdAt.toISOString().slice(0, 10)})`));
    if (!arg) console.log('\nTo reset one:  node scripts/reset-password.js <username> [new-password]');
    return;
  }

  const username = arg.trim().toLowerCase();
  const user = users.find((u) => u.email === username);
  if (!user) {
    console.error(`No account named "${username}".`);
    console.error('Existing accounts: ' + (users.map((u) => u.email).join(', ') || '(none)'));
    process.exitCode = 1;
    return;
  }

  const password = chosen || randomPassword();
  if (password.length < 6) {
    console.error('The password must be at least 6 characters.');
    process.exitCode = 1;
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  console.log(`Password for "${user.email}" is now: ${password}`);
  console.log('They can sign in with it right away (existing sessions stay signed in).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
