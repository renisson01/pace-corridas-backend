import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'pace-secret-2026';

function validarSenha(s) {
  const erros = [];
  if(s.length < 8) erros.push('mínimo 8 caracteres');
  if(!/[A-Z]/.test(s)) erros.push('uma maiúscula');
  if(!/[0-9]/.test(s)) erros.push('um número');
  if(!/[^A-Za-z0-9]/.test(s)) erros.push('um caractere especial');
  return { valida: erros.length===0, erros };
}

function gerarBIP39simples() {
  const palavras = ['corrida','maratona','atletismo','ritmo','pace','treino','meta','pista','largada','chegada','medalha','atleta','velocidade','resistencia','superacao','dedicacao','esporte','saude','energia','forca'];
  const result = [];
  while(result.length < 12) {
    const w = palavras[Math.floor(Math.random()*palavras.length)];
    if(!result.includes(w)) result.push(w);
  }
  return result.join(' ');
}

export async function authRoutes(fastify) {

  fastify.post('/auth/register', async (req, reply) => {
    try {
      const { nome, email, senha, genero, idade, cidade, estado, phone } = req.body;
      if(!nome||!email||!senha) return reply.code(400).send({ error: 'Nome, email e senha obrigatórios' });
      const { valida, erros } = validarSenha(senha);
      if(!valida) return reply.code(400).send({ error: 'Senha fraca: ' + erros.join(', ') });
      const existe = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if(existe) return reply.code(400).send({ error: 'E-mail já cadastrado' });

      const bip39Words = gerarBIP39simples();
      const bip39Hash = await bcrypt.hash(bip39Words, 10);
      const passwordHash = await bcrypt.hash(senha, 10);

      const user = await prisma.user.create({
        data: { email: email.toLowerCase(), passwordHash, name: nome, gender: genero||null, age: idade?parseInt(idade):null, city: cidade||null, state: estado||null, phone: phone||null, bip39Hash, emailVerified: true }
      });
      const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
      return reply.code(201).send({ success: true, token, bip39Words, user: { id:user.id, email:user.email, name:user.name, city:user.city, state:user.state, gender:user.gender, isPremium:user.isPremium } });
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.post('/auth/login', async (req, reply) => {
    try {
      const { email, senha } = req.body;
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if(!user) return reply.code(401).send({ error: 'E-mail ou senha incorretos' });
      const ok = await bcrypt.compare(senha, user.passwordHash);
      if(!ok) return reply.code(401).send({ error: 'E-mail ou senha incorretos' });
      const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
      return { success: true, token, user: { id:user.id, email:user.email, name:user.name, city:user.city, state:user.state, gender:user.gender, age:user.age, isPremium:user.isPremium } };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.post('/auth/recover', async (req, reply) => {
    try {
      const { email, bip39Words, novaSenha } = req.body;
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if(!user) return reply.code(400).send({ error: 'E-mail não encontrado' });
      const ok = await bcrypt.compare(bip39Words.trim().toLowerCase(), user.bip39Hash);
      if(!ok) return reply.code(400).send({ error: 'Palavras de recuperação incorretas' });
      const { valida, erros } = validarSenha(novaSenha);
      if(!valida) return reply.code(400).send({ error: 'Senha fraca: ' + erros.join(', ') });
      const passwordHash = await bcrypt.hash(novaSenha, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      return { success: true, message: 'Senha alterada!' };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.get('/auth/me', async (req, reply) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ','');
      if(!token) return reply.code(401).send({ error: 'Token necessário' });
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id:true, email:true, name:true, city:true, state:true, gender:true, age:true, isPremium:true, athleteId:true,
          athlete: { select: { totalRaces:true, totalPoints:true, results: { include: { race: { select:{name:true,date:true,city:true} } }, orderBy: { createdAt:'desc' }, take:10 } } }
        }
      });
      if(!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
      return { success: true, user };
    } catch(e) { return reply.code(401).send({ error: 'Token inválido' }); }
  });


  fastify.patch('/auth/me', async (req, reply) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ','');
      const payload = jwt.verify(token, JWT_SECRET);
      const { city, state, age, phone } = req.body;
      const user = await prisma.user.update({
        where: { id: payload.userId },
        data: { city: city||null, state: state||null, age: age||null, phone: phone||null },
        select: { id:true, email:true, name:true, city:true, state:true, gender:true, age:true, isPremium:true }
      });
      return { success: true, user };
    } catch(e) { return reply.code(401).send({ error: e.message }); }
  });

  // PaceMatch - dar like
  fastify.post('/auth/like/:targetId', async (req, reply) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ','');
      const payload = jwt.verify(token, JWT_SECRET);
      const fromUser = await prisma.user.findUnique({ where: { id: payload.userId } });
      const toUser = await prisma.user.findUnique({ where: { id: req.params.targetId } });
      if(!fromUser||!toUser) return reply.code(404).send({ error: 'Usuário não encontrado' });

      await prisma.like.upsert({
        where: { fromUserId_toUserId: { fromUserId: fromUser.id, toUserId: toUser.id } },
        create: { fromUserId: fromUser.id, toUserId: toUser.id },
        update: {}
      });

      // Verificar match mútuo
      const mutual = await prisma.like.findUnique({
        where: { fromUserId_toUserId: { fromUserId: toUser.id, toUserId: fromUser.id } }
      });

      return { success: true, status: mutual ? 'matched' : 'liked', partner: { id: toUser.id, name: toUser.name, city: toUser.city } };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // PaceMatch - meus matches
  fastify.get('/auth/matches', async (req, reply) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ','');
      const payload = jwt.verify(token, JWT_SECRET);
      const myLikes = await prisma.like.findMany({ where: { fromUserId: payload.userId }, select: { toUserId: true } });
      const myLikeIds = myLikes.map(l => l.toUserId);
      const theyLikeMe = await prisma.like.findMany({ where: { fromUserId: { in: myLikeIds }, toUserId: payload.userId }, include: { fromUser: { select: { id:true, name:true, city:true, state:true, gender:true, age:true } } } });
      return theyLikeMe.map(l => ({ partner: l.fromUser, matchedAt: l.createdAt }));
    } catch(e) { return reply.code(401).send({ error: e.message }); }
  });
}
// já dentro do arquivo - adicionar depois do GET /auth/me via sed
