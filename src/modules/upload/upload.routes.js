import { PrismaClient } from '@prisma/client';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '../../../public/uploads/produtos');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

export async function uploadRoutes(fastify) {

  // Upload de imagem - retorna URL pública
  fastify.post('/upload/imagem', async (req, reply) => {
    try {
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'Nenhum arquivo enviado' });

      const ext = data.filename.split('.').pop().toLowerCase();
      const allowed = ['jpg','jpeg','png','webp','gif'];
      if (!allowed.includes(ext)) return reply.code(400).send({ error: 'Formato inválido. Use JPG, PNG ou WebP' });

      const nome = `${Date.now()}-${Math.random().toString(36).substr(2,6)}.${ext}`;
      const path = join(UPLOAD_DIR, nome);

      await pipeline(data.file, createWriteStream(path));

      return { url: `/uploads/produtos/${nome}`, nome };
    } catch(e) {
      console.error('[UPLOAD]', e.message);
      return reply.code(500).send({ error: e.message });
    }
  });
}
