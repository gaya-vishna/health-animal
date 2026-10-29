const { PrismaClient } = require('@prisma/client');
const createUser = require('../lib/createUser');

const prisma = new PrismaClient();

const DEMO = { email: 'demo@healthanimal.app', name: 'Demo' };

// Creates (or resets) a demo account with a week of health stats.
async function main() {
  console.log('🌱 Seeding demo account...');

  const old = await prisma.user.findUnique({ where: { email: DEMO.email } });
  if (old) {
    const where = { userId: old.id };
    await prisma.$transaction([
      prisma.dailyLog.deleteMany({ where }),
      prisma.workoutLog.deleteMany({ where }),
      prisma.weeklyCheckin.deleteMany({ where }),
      prisma.recipe.deleteMany({ where }),
      prisma.avatarState.deleteMany({ where }),
      prisma.userConfig.deleteMany({ where }),
      prisma.user.delete({ where: { id: old.id } }),
    ]);
  }

  const user = await createUser(prisma, DEMO);
  await prisma.userConfig.update({
    where: { userId: user.id },
    data: { heightCm: 165, startWeightKg: 72, targetWeightKg: 62, targetDate: new Date(Date.now() + 120 * 864e5), setupDone: true },
  });

  const day = (n) => new Date(Date.now() - n * 864e5);
  const weights = [72, 71.6, 71.3, 71.1];
  for (let i = 0; i < weights.length; i++) {
    await prisma.weeklyCheckin.create({
      data: { userId: user.id, weekStartDate: day((weights.length - 1 - i) * 7), weightKg: weights[i], avgDailyCals: 1500, aiReflection: `Weigh-in logged: ${weights[i]}kg`, createdAt: day((weights.length - 1 - i) * 7) },
    });
  }

  const oats = await prisma.recipe.findFirst({ where: { userId: user.id, name: 'Coconut Cream Oats' } });
  const chicken = await prisma.recipe.findFirst({ where: { userId: user.id, name: 'Grilled Chicken Breast' } });
  await prisma.dailyLog.createMany({
    data: [
      { userId: user.id, mealType: 'breakfast', inputMode: 'recipe', recipeId: oats.id, weightGram: 250 },
      { userId: user.id, mealType: 'lunch', inputMode: 'recipe', recipeId: chicken.id, weightGram: 200 },
      { userId: user.id, mealType: 'water', inputMode: 'recipe', waterMl: 250 },
      { userId: user.id, mealType: 'water', inputMode: 'recipe', waterMl: 250 },
    ],
  });
  await prisma.workoutLog.create({ data: { userId: user.id, type: 'walk', durationMin: 35 } });

  console.log(`✅ Demo login: ${DEMO.email} (no password)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
