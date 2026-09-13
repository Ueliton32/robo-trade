/**
 * Descobre o userId correto para o e-mail ueliton32@gmail.com
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true },
  });

  console.log('Usuários encontrados:');
  for (const u of users) {
    console.log(`${u.id} — ${u.email}`);
  }

  const target = users.find(u => u.email === 'ueliton32@gmail.com');
  if (target) {
    console.log(`\n✅ userId para ueliton32@gmail.com: ${target.id}`);
  } else {
    console.log('\n⚠ ueliton32@gmail.com não encontrado.');
  }

  const settings = await prisma.userSettings.findMany({
    select: { userId: true, enabledStrategies: true },
  });

  console.log('\nUserSettings:');
  for (const s of settings) {
    console.log(`userId: ${s.userId} — enabledStrategies: ${JSON.stringify(s.enabledStrategies)}`);
  }
}

main().catch(console.error);