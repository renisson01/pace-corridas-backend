import { v2 as cloudinary } from 'cloudinary';

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadRoutes(fastify) {

  fastify.post('/upload/imagem', async (req, reply) => {
    try {
      // Verificar se Cloudinary está configurado
      const semCloud = !process.env.CLOUDINARY_CLOUD_NAME;

      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'Nenhum arquivo enviado' });

      const chunks = [];
      for await (const chunk of data.file) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) return reply.code(400).send({ error: 'Arquivo vazio' });

      if (semCloud) {
        // Fallback: salvar local (temporário)
        const { writeFileSync, mkdirSync, existsSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const dir = join(__dirname, '../../../public/uploads/produtos');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const mime = data.mimetype || '';
        const ext = mime.includes('png')?'png':mime.includes('webp')?'webp':'jpg';
        const nome = `${Date.now()}.${ext}`;
        writeFileSync(join(dir, nome), buffer);
        return { url: `/uploads/produtos/${nome}`, fonte: 'local' };
      }

      // Upload para Cloudinary
      const resultado = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'pace/produtos', resource_type: 'image', transformation: [{ width: 800, crop: 'limit', quality: 'auto' }] },
          (error, result) => error ? reject(error) : resolve(result)
        );
        stream.end(buffer);
      });

      console.log('[CLOUDINARY OK]', resultado.secure_url);
      return { url: resultado.secure_url, public_id: resultado.public_id, fonte: 'cloudinary' };

    } catch(e) {
      console.error('[UPLOAD ERRO]', e.message);
      return reply.code(500).send({ error: e.message });
    }
  });

  // Servir uploads locais (fallback)
  fastify.get('/uploads/produtos/:nome', async (req, reply) => {
    try {
      const { createReadStream, statSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const caminho = join(__dirname, '../../../public/uploads/produtos', req.params.nome);
      statSync(caminho);
      const ext = req.params.nome.split('.').pop();
      const mimes = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp' };
      reply.type(mimes[ext] || 'image/jpeg');
      return reply.send(createReadStream(caminho));
    } catch { return reply.code(404).send('Não encontrado'); }
  });
}
