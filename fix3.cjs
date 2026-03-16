const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:LegLYYuCrLfOAHfuaXeDdGKbqPyxzsDy@maglev.proxy.rlwy.net:27005/railway' } } });

(async () => {
  try {
    // 1. Buscar usuario
    const u = await p.user.findUnique({
      where: { email: 'renisson@proton.me' },
      select: { id: true, name: true, email: true, passwordHash: true, isPremium: true, isAdmin: true }
    });

    if (!u) { console.log('USUARIO NAO ENCONTRADO'); return; }

    console.log('=== DIAGNOSTICO ===');
    console.log('ID:', u.id);
    console.log('Nome:', u.name);
    console.log('Email:', u.email);
    console.log('Admin:', u.isAdmin);
    console.log('Premium:', u.isPremium);
    console.log('Hash atual:', u.passwordHash ? u.passwordHash.substring(0, 20) + '...' : 'VAZIO/NULL');
    console.log('Hash length:', u.passwordHash ? u.passwordHash.length : 0);

    // 2. Gerar novo hash
    const senha = 'Pace@2026!';
    const hash = await bcrypt.hash(senha, 10);
    console.log('\nNovo hash gerado:', hash.substring(0, 20) + '...');

    // 3. Atualizar
    await p.user.update({
      where: { id: u.id },
      data: { passwordHash: hash }
    });
    console.log('Hash salvo no banco!');

    // 4. Verificar se salvou
    const u2 = await p.user.findUnique({
      where: { id: u.id },
      select: { passwordHash: true }
    });
    console.log('Verificacao - hash no banco:', u2.passwordHash ? u2.passwordHash.substring(0, 20) + '...' : 'FALHOU');

    // 5. Testar bcrypt.compare
    const ok = await bcrypt.compare(senha, u2.passwordHash);
    console.log('Teste bcrypt.compare:', ok ? 'SUCESSO' : 'FALHOU');

    // 6. Simular login completo
    if (ok) {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ userId: u.id, email: u.email }, process.env.JWT_SECRET || 'pace-secret-2026');
      console.log('\n=== LOGIN SIMULADO ===');
      console.log('Token:', token.substring(0, 50) + '...');
      console.log('\nTESTE STRAVA:');
      console.log('Abra esta URL no navegador:');
      console.log('https://www.strava.com/oauth/authorize?client_id=212560&redirect_uri=' + encodeURIComponent('https://web-production-990e7.up.railway.app/integracoes/strava/callback') + '&response_type=code&scope=read,activity:read_all&state=' + u.id);
    }

    console.log('\n=== TUDO OK ===');
  } catch(e) {
    console.error('ERRO:', e.message);
    console.error(e.stack);
  }
  finally { await p.$disconnect(); }
})();
