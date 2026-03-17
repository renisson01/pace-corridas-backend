import prisma from '../lib/prisma.js';
import jwt from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';

const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

// ✅ Cloudinary configurado
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function getUser(req) {
  try {
    return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT);
  } catch { return null; }
}

async function isAdmin(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }).catch(() => null);
  return user?.isAdmin === true;
}

export async function lojaRoutes(fastify) {

  // ✅ UPLOAD DE FOTO — POST /loja/upload-foto
  fastify.post('/loja/upload-foto', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });

    try {
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'Nenhum arquivo enviado' });

      const chunks = [];
      for await (const chunk of data.file) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      // Upload para Cloudinary
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'pace-loja', resource_type: 'image', transformation: [{ width: 800, crop: 'limit', quality: 'auto' }] },
          (error, result) => error ? reject(error) : resolve(result)
        ).end(buffer);
      });

      return { success: true, url: result.secure_url, publicId: result.public_id };
    } catch (e) {
      console.error('[LOJA UPLOAD]', e.message);
      return reply.code(500).send({ error: 'Erro no upload: ' + e.message });
    }
  });

  // Listar todos os produtos
  fastify.get('/loja/produtos', async (req) => {
    const { assessoriaId, categoria } = req.query;
    const where = { ativo: true };
    if (assessoriaId) where.assessoriaId = assessoriaId;
    if (categoria) where.categoria = categoria;
    return prisma.produto.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { assessoria: { select: { nome: true, slug: true } } }
    });
  });

  // Buscar produto
  fastify.get('/loja/produtos/:id', async (req, reply) => {
    const p = await prisma.produto.findUnique({
      where: { id: req.params.id },
      include: { assessoria: { select: { nome: true, slug: true, whatsapp: true } } }
    });
    if (!p) return reply.code(404).send({ error: 'Produto não encontrado' });
    return p;
  });

  // ADMIN - Criar produto
  fastify.post('/loja/produtos', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    const { nome, descricao, preco, fotos, tamanhos, cores, categoria, assessoriaId, estoquePorTamanho } = req.body;

    if (!nome || !preco) return reply.code(400).send({ error: 'Nome e preço obrigatórios' });

    const produto = await prisma.produto.create({
      data: {
        nome, descricao: descricao || null,
        preco: parseFloat(preco),
        fotos: Array.isArray(fotos) ? fotos.join(',') : (fotos || ''),
        tamanhos: Array.isArray(tamanhos) ? tamanhos.join(',') : (tamanhos || 'PP,P,M,G,GG'),
        categoria: categoria || 'camisa',
        assessoriaId: assessoriaId || null,
        estoque: estoquePorTamanho
          ? Object.values(estoquePorTamanho).reduce((s, v) => s + parseInt(v || 0), 0)
          : 0,
      }
    });

    // Criar variantes por tamanho e cor
    if (cores && tamanhos) {
      const coresArr = Array.isArray(cores) ? cores : cores.split(',');
      const tamArr = Array.isArray(tamanhos) ? tamanhos : tamanhos.split(',');
      for (const cor of coresArr) {
        for (const tam of tamArr) {
          await prisma.produtoVariante.create({
            data: {
              produtoId: produto.id, cor, tamanho: tam,
              estoque: estoquePorTamanho?.[tam] ? parseInt(estoquePorTamanho[tam]) : 10
            }
          }).catch(() => {});
        }
      }
    }

    return produto;
  });

  // ADMIN - Editar produto
  fastify.patch('/loja/produtos/:id', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    const data = { ...req.body };
    if (data.preco) data.preco = parseFloat(data.preco);
    if (Array.isArray(data.fotos)) data.fotos = data.fotos.join(',');
    if (Array.isArray(data.tamanhos)) data.tamanhos = data.tamanhos.join(',');
    if (Array.isArray(data.cores)) data.cores = data.cores.join(',');
    return prisma.produto.update({ where: { id: req.params.id }, data });
  });

  // ADMIN - Deletar produto (soft delete)
  fastify.delete('/loja/produtos/:id', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    await prisma.produto.update({ where: { id: req.params.id }, data: { ativo: false } });
    return { success: true };
  });

  // Fazer pedido - vai direto pro WhatsApp
  fastify.post('/loja/pedidos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { produtoId, tamanho, quantidade, obs } = req.body;

    const produto = await prisma.produto.findUnique({
      where: { id: produtoId },
      include: { assessoria: true }
    });
    if (!produto) return reply.code(404).send({ error: 'Produto não encontrado' });

    const total = produto.preco * (quantidade || 1);
    const pedido = await prisma.pedido.create({
      data: {
        userId: u.userId, produtoId,
        tamanho, quantidade: parseInt(quantidade) || 1,
        total, status: 'pendente', obs: obs || null
      }
    });

    const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true, phone: true } });
    const msg = encodeURIComponent(
      `🏃 *Pedido PACE Loja*\n\n` +
      `👕 *${produto.nome}*\n` +
      `📏 Tamanho: ${tamanho}\n` +
      `🔢 Qtd: ${quantidade || 1}\n` +
      `💰 Total: R$ ${total.toFixed(2)}\n` +
      `👤 Cliente: ${user.name}\n` +
      `📱 Tel: ${user.phone || 'não informado'}\n` +
      `${obs ? `💬 Obs: ${obs}` : ''}\n\n` +
      `_Pedido #${pedido.id.substring(0, 8)}_`
    );

    const whatsapp = produto.assessoria?.whatsapp || process.env.WHATSAPP_ADMIN || '5579999999999';
    const waLink = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${msg}`;

    return { success: true, pedido, waLink };
  });

  // ADMIN - listar todos os pedidos
  fastify.get('/loja/pedidos/admin', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    return prisma.pedido.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        produto: { select: { nome: true, fotos: true } }
      }
    });
  });

  // ADMIN - mudar status do pedido
  fastify.patch('/loja/pedidos/:id/status', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    const { status } = req.body;
    return prisma.pedido.update({ where: { id: req.params.id }, data: { status } });
  });
}
