import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '../../../public/uploads/produtos');

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

export async function uploadRoutes(fastify) {

  fastify.post('/upload/imagem', async (req, reply) => {
    try {
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'Nenhum arquivo enviado' });

      // Ler o buffer completo
      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length === 0) return reply.code(400).send({ error: 'Arquivo vazio' });
      if (buffer.length > 10 * 1024 * 1024) return reply.code(400).send({ error: 'Arquivo muito grande (máx 10MB)' });

      // Detectar extensão
      const mime = data.mimetype || '';
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';

      const nome = `${Date.now()}-${Math.random().toString(36).substr(2,6)}.${ext}`;
      const caminho = join(UPLOAD_DIR, nome);

      writeFileSync(caminho, buffer);

      const url = `/uploads/produtos/${nome}`;
      console.log('[UPLOAD] Salvo:', caminho, buffer.length, 'bytes');
      return { url, nome, tamanho: buffer.length };

    } catch(e) {
      console.error('[UPLOAD ERRO]', e.message, e.stack?.substring(0,200));
      return reply.code(500).send({ error: 'Erro no upload: ' + e.message });
    }
  });

  // Servir arquivos estáticos de uploads
  fastify.get('/uploads/produtos/:nome', async (req, reply) => {
    const { nome } = req.params;
    const caminho = join(UPLOAD_DIR, nome);
    try {
      const { createReadStream, statSync } = await import('fs');
      statSync(caminho); // Verifica se existe
      const ext = nome.split('.').pop();
      const mimes = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif' };
      reply.type(mimes[ext] || 'image/jpeg');
      return reply.send(createReadStream(caminho));
    } catch {
      return reply.code(404).send('Imagem não encontrada');
    }
  });
}
