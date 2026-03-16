const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:LegLYYuCrLfOAHfuaXeDdGKbqPyxzsDy@maglev.proxy.rlwy.net:27005/railway' } } });
(async () => {
  try {
    const hash = await bcrypt.hash('Pace@2026!', 10);
    const u = await p.user.update({
      where: { email: 'renisson@proton.me' },
      data: { passwordHash: hash }
    });
    console.log('SENHA ATUALIZADA para:', u.name, u.email);
  } catch(e) { console.error('ERRO:', e.message); }
  finally { await p.$disconnect(); }
})();
