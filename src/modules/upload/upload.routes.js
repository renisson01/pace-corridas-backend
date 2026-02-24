import multer from 'multer';
import path from 'path';
import { uploadService } from './upload.service.js';
import { resultsService } from '../results/results.service.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas PDFs são permitidos'));
    }
  }
});

export async function uploadRoutes(fastify) {
  fastify.post('/upload-results', {
    preHandler: upload.single('pdf')
  }, async (request, reply) => {
    try {
      const { raceId, distance } = request.body;
      const file = request.file;
      
      if (!file) {
        return reply.code(400).send({ error: 'Arquivo PDF não enviado' });
      }
      
      if (!raceId || !distance) {
        return reply.code(400).send({ error: 'raceId e distance são obrigatórios' });
      }
      
      // Processar PDF
      const result = await uploadService.processPDF(file.path, raceId, distance);
      
      // Recalcular rankings
      await resultsService.calculateRankings(raceId, distance);
      
      return {
        message: 'PDF processado com sucesso',
        ...result
      };
    } catch (error) {
      console.error('Erro ao processar PDF:', error);
      return reply.code(500).send({ 
        error: 'Erro ao processar PDF',
        message: error.message 
      });
    }
  });
  
  // Endpoint para testar parse sem salvar
  fastify.post('/parse-pdf', {
    preHandler: upload.single('pdf')
  }, async (request, reply) => {
    try {
      const file = request.file;
      
      if (!file) {
        return reply.code(400).send({ error: 'Arquivo PDF não enviado' });
      }
      
      const fs = await import('fs');
      const pdfParse = (await import('pdf-parse')).default;
      
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdfParse(dataBuffer);
      
      return {
        text: data.text,
        pages: data.numpages,
        info: data.info
      };
    } catch (error) {
      console.error('Erro:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
