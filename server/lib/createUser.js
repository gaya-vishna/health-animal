const bcrypt = require('bcryptjs');
const starterRecipes = require('./starterRecipes');

// Creates a user plus their default preferences, avatar and starter recipes.
async function createUser(prisma, { email, password, name, lang }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash, name: name || null } });
    await tx.userConfig.create({ data: { userId: user.id, setupDone: false } });
    await tx.avatarState.create({ data: { userId: user.id } });
    await tx.recipe.createMany({ data: (lang === 'he' ? starterRecipes.he : starterRecipes.en).map((r) => ({ ...r, userId: user.id })) });
    return user;
  });
}

module.exports = createUser;
