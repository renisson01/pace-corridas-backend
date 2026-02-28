
export async function lojaRoutes(fastify) {
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
    const { nome, descricao, preco, fotos, tamanhos, categoria, assessoriaId, estoque } = req.body;
    return prisma.produto.create({
      data: {
        nome, descricao, preco: parseFloat(preco),
        fotos: Array.isArray(fotos) ? fotos.join(',') : fotos,
        tamanhos: Array.isArray(tamanhos) ? tamanhos.join(',') : tamanhos,
        categoria: categoria || 'camisa',
        assessoriaId: assessoriaId || null,
        estoque: parseInt(estoque) || 0,
      }
    });
  });

  // ADMIN - Editar produto
  fastify.patch('/loja/produtos/:id', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    const data = { ...req.body };
    if (data.preco) data.preco = parseFloat(data.preco);
    if (Array.isArray(data.fotos)) data.fotos = data.fotos.join(',');
    if (Array.isArray(data.tamanhos)) data.tamanhos = data.tamanhos.join(',');
    return prisma.produto.update({ where: { id: req.params.id }, data });
  });

  // ADMIN - Deletar produto
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
        tamanho, quantidade: parseInt(quantidade)||1,
        total, status: 'pendente', obs: obs||null
      }
    });

    // Gerar link WhatsApp
    const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true, phone: true } });
    const msg = encodeURIComponent(
      `🏃 *Pedido PACE Loja*\n\n` +
      `👕 *${produto.nome}*\n` +
      `📏 Tamanho: ${tamanho}\n` +
      `🔢 Qtd: ${quantidade||1}\n` +
      `💰 Total: R$ ${total.toFixed(2)}\n` +
      `👤 Cliente: ${user.name}\n` +
      `📱 Tel: ${user.phone || 'não informado'}\n` +
      `${obs ? `💬 Obs: ${obs}` : ''}\n\n` +
      `_Pedido #${pedido.id.substring(0,8)}_`
    );
    
    // WhatsApp do admin (Renisson)
    const whatsapp = produto.assessoria?.whatsapp || '5579999999999';
    const waLink = `https://wa.me/${whatsapp.replace(/\D/g,'')}?text=${msg}`;
    
    return { success: true, pedido, waLink };
  });

  // ADMIN - listar todos os pedidos
  fastify.get('/loja/pedidos/admin', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    return prisma.pedidoCompleto.findMany({
      orderBy: { criadoEm: 'desc' },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        itens: { include: { variante: { include: { produto: { select: { nome: true } } } } } }
      }
    });
  });

  // ADMIN - mudar status do pedido
  fastify.patch('/loja/pedidos/:id/status', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    const { status } = req.body;
    return prisma.pedidoCompleto.update({ where: { id: req.params.id }, data: { status, visto: true } });
  });

}