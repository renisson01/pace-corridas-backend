import prisma from '../../lib/prisma.js';
import { writeFileSync, mkdirSync, existsSync, createReadStream, statSync } from 'fs';
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

      const chunks = [];
      for await (const chunk of data.file) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) return reply.code(400).send({ error: 'Arquivo vazio' });

      const mime = data.mimetype || '';
      const ext = mime.includes('png')?'png':mime.includes('webp')?'webp':'jpg';
      const nome = `${Date.now()}.${ext}`;
      writeFileSync(join(UPLOAD_DIR, nome), buffer);
      console.log('[UPLOAD OK]', nome, buffer.length+'bytes');
      return { url: `/uploads/produtos/${nome}`, fonte: 'local' };

    } catch(e) {
      console.error('[UPLOAD ERRO]', e.message);
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.get('/uploads/produtos/:nome', async (req, reply) => {
    try {
      const caminho = join(UPLOAD_DIR, req.params.nome);
      statSync(caminho);
      const ext = req.params.nome.split('.').pop();
      const mimes = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp' };
      reply.type(mimes[ext] || 'image/jpeg');
      return reply.send(createReadStream(caminho));
    } catch { return reply.code(404).send('Não encontrado'); }
  });

  fastify.post("/upload/avatar", async (req, reply) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return reply.code(401).send({ error: "Login necessario" });
      const jwt = await import("jsonwebtoken");
      const decoded = jwt.default.verify(token, process.env.JWT_SECRET || "pace-secret-2026");
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: "Nenhum arquivo" });
      const chunks = [];
      for await (const chunk of data.file) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      const AVATAR_DIR = join(__dirname, "../../../public/uploads/avatars");
      if (!existsSync(AVATAR_DIR)) mkdirSync(AVATAR_DIR, { recursive: true });
      const ext = (data.mimetype||"").includes("png")?"png":"jpg";
      const nome = decoded.userId + "." + ext;
      writeFileSync(join(AVATAR_DIR, nome), buffer);
      await prisma.user.update({ where:{id:decoded.userId}, data:{avatar:"/uploads/avatars/"+nome} }).catch(()=>{});
      return { url: "/uploads/avatars/" + nome };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.get("/uploads/avatars/:file", async (req, reply) => {
    try {
      const fp = join(__dirname, "../../../public/uploads/avatars", req.params.file);
      if (!existsSync(fp)) return reply.code(404).send("Not found");
      return reply.type(req.params.file.endsWith(".png")?"image/png":"image/jpeg").send(createReadStream(fp));
    } catch(e) { return reply.code(404).send("Not found"); }
  });
}
