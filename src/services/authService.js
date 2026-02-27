import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as bip39 from 'bip39';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'pace-secret-2026-change-in-prod';

// Gera 12 palavras BIP39 em português adaptado
export function gerarBIP39() {
  const mnemonic = bip39.generateMnemonic(128); // 12 palavras
  return mnemonic;
}

// Valida força da senha
export function validarSenha(senha) {
  const erros = [];
  if(senha.length < 8) erros.push('Mínimo 8 caracteres');
  if(!/[A-Z]/.test(senha)) erros.push('Uma letra maiúscula');
  if(!/[a-z]/.test(senha)) erros.push('Uma letra minúscula');
  if(!/[0-9]/.test(senha)) erros.push('Um número');
  if(!/[^A-Za-z0-9]/.test(senha)) erros.push('Um caractere especial (!@#$...)');
  return { valida: erros.length === 0, erros };
}

export async function registrar({ email, senha, nome, genero, idade, cidade, estado, phone }) {
  // Validar email
  if(!email || !email.includes('@')) throw new Error('E-mail inválido');

  // Verificar se já existe
  const existe = await prisma.user.findUnique({ where:{ email: email.toLowerCase() } });
  if(existe) throw new Error('E-mail já cadastrado');

  // Validar senha
  const { valida, erros } = validarSenha(senha);
  if(!valida) throw new Error('Senha fraca: ' + erros.join(', '));

  // Gerar BIP39
  const bip39Words = gerarBIP39();
  const bip39Hash = await bcrypt.hash(bip39Words, 12);

  // Hash da senha
  const passwordHash = await bcrypt.hash(senha, 12);

  // Token de verificação de email
  const verifyToken = Math.random().toString(36).substring(2) + Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name: nome,
      gender: genero,
      age: idade ? parseInt(idade) : null,
      city: cidade,
      state: estado,
      phone,
      bip39Hash,
      verifyToken,
      emailVerified: true // por ora auto-verifica, depois ativa email
    }
  });

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

  return {
    user: { id: user.id, email: user.email, name: user.name, city: user.city, state: user.state },
    token,
    bip39Words, // retorna UMA VEZ para o usuário anotar
    message: 'Conta criada com sucesso!'
  };
}

export async function login({ email, senha }) {
  const user = await prisma.user.findUnique({ where:{ email: email.toLowerCase() } });
  if(!user) throw new Error('E-mail ou senha incorretos');

  const ok = await bcrypt.compare(senha, user.passwordHash);
  if(!ok) throw new Error('E-mail ou senha incorretos');

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  
  return {
    user: { id: user.id, email: user.email, name: user.name, city: user.city, state: user.state, gender: user.gender, isPremium: user.isPremium },
    token
  };
}

export async function recuperarComBIP39({ email, bip39Words, novaSenha }) {
  const user = await prisma.user.findUnique({ where:{ email: email.toLowerCase() } });
  if(!user) throw new Error('E-mail não encontrado');

  const bip39Ok = await bcrypt.compare(bip39Words.trim().toLowerCase(), user.bip39Hash);
  if(!bip39Ok) throw new Error('Palavras de recuperação incorretas');

  const { valida, erros } = validarSenha(novaSenha);
  if(!valida) throw new Error('Senha fraca: ' + erros.join(', '));

  const passwordHash = await bcrypt.hash(novaSenha, 12);
  await prisma.user.update({ where:{id: user.id}, data:{ passwordHash } });

  return { message: 'Senha alterada com sucesso!' };
}

export function verificarToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch(e) {
    throw new Error('Token inválido ou expirado');
  }
}
