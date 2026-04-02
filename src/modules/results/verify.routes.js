import prisma from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';

const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

const SITES_CHIPAGEM = [
  'runningchip.com.br','chip4you.com.br','mariusresultados.com.br',
  'runtimize.com.br','trackandfield.com.br','tempochip.com.br',
  'cbat.org.br','worldathletics.org','corridasonline.com.br',
  'ticket.com.br','sympla.com.br','athlinks.com'
];

function isSiteConfiavel(url) {
  try { const h=new URL(url).hostname.toLowerCase().replace('www.',''); return SITES_CHIPAGEM.some(s=>h.includes(s)); }
  catch { return false; }
}

function extrairDados(html, nome) {
  const txt=html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').toLowerCase();
  const n=nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const encontrouNome=txt.includes(n.split(' ')[0])||txt.includes(n.split(' ').slice(-1)[0]);
  const tempoMatch=html.match(/(\d{1,2}:\d{2}:\d{2}|\d{2}:\d{2})/);
  const posMatch=html.match(/(\d+)[°ºo]?\s*(lugar|geral|colocado|position)/i);
  return { encontrouNome, tempo: tempoMatch?tempoMatch[0]:null, posicao: posMatch?parseInt(posMatch[1]):null };
}

export async function verifyRoutes(fastify) {

  fastify.post('/resultados/verificar-link', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { linkResultado, nomeAtleta, distancia, dataProva, tempoInformado } = req.body || {};
    if (!linkResultado) return reply.code(400).send({ error: 'Link obrigatório' });
    let urlValida=false;
    try { new URL(linkResultado); urlValida=true; } catch {}
    if (!urlValida) return reply.code(400).send({ error: 'URL inválida' });
    const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true } });
    const nomeVerif = nomeAtleta || user?.name || '';
    const siteConfiavel = isSiteConfiavel(linkResultado);
    let html='', acessoOk=false, extraido={};
    try {
      const ctrl=new AbortController();
      const to=setTimeout(()=>ctrl.abort(),8000);
      const res=await fetch(linkResultado,{signal:ctrl.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; PACEBrasil/1.0)'}});
      clearTimeout(to);
      if(res.ok){ html=await res.text(); acessoOk=true; extraido=extrairDados(html,nomeVerif); }
    } catch(e) { console.log('[VERIFY]',e.message); }
    let analiseIA=null;
    if(process.env.ANTHROPIC_API_KEY && acessoOk && html){
      try {
        const txt=html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').substring(0,3000);
        const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:400,messages:[{role:'user',content:`Analise este resultado de corrida. Atleta: "${nomeVerif}", Distância: "${distancia||'?'}", Tempo informado: "${tempoInformado||'?'}". Conteúdo: "${txt}". Responda APENAS JSON: {"encontrou_atleta":true/false,"tempo_encontrado":"string ou null","posicao_encontrada":numero_ou_null,"distancia_bateu":true/false/null,"confianca":"alta/media/baixa","resumo":"frase curta"}`}]})});
        const d=await r.json();
        analiseIA=JSON.parse((d.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim());
      } catch(e) { console.log('[VERIFY IA]',e.message); }
    }
    let score=0;
    if(siteConfiavel) score+=40;
    if(acessoOk) score+=20;
    if(extraido.encontrouNome) score+=20;
    if(extraido.tempo) score+=10;
    if(analiseIA?.encontrou_atleta) score+=30;
    if(analiseIA?.distancia_bateu) score+=10;
    score=Math.min(score,100);
    const status=score>=70?'verificado':score>=40?'parcial':'nao_verificado';
    const msg=score>=70?'✅ Resultado verificado!':score>=40?'⚠️ Verificação parcial':'❌ Não foi possível confirmar';
    if(score>=50){
      try {
        let u2=await prisma.user.findUnique({where:{id:u.userId},select:{athleteId:true,name:true}});
        let atletaId=u2.athleteId;
        if(!atletaId){
          const a=await prisma.athlete.create({data:{name:u2.name,totalRaces:0,totalPoints:0}});
          await prisma.user.update({where:{id:u.userId},data:{athleteId:a.id}});
          atletaId=a.id;
        }
        await prisma.resultadoEnviado.create({data:{userId:u.userId,atletaId,linkOriginal:linkResultado,nomeAtleta:nomeVerif,distancia:distancia||'',tempoInformado:tempoInformado||extraido.tempo||analiseIA?.tempo_encontrado||'',dataProva:dataProva?new Date(dataProva):new Date(),scoreVerificacao:score,statusVerificacao:status,dadosExtraidos:JSON.stringify({...extraido,analiseIA})}}).catch(()=>{});
        // Auto-import to real Results when verified (score >= 70)
        if (score >= 70 && atletaId) {
          const tempo = tempoInformado || extraido.tempo || analiseIA?.tempo_encontrado || '';
          const dist = distancia || '';
          if (tempo && dist) {
            try {
              // Find or create race
              const nomeProva = extraido.nomeProva || 'Corrida verificada por link';
              let race = await prisma.race.findFirst({ where: { name: { contains: nomeProva.slice(0, 15), mode: 'insensitive' } } });
              if (!race) {
                race = await prisma.race.create({ data: { name: nomeProva, city: '', state: '', date: dataProva ? new Date(dataProva) : new Date(), distances: dist, organizer: 'Atleta (verificado)', status: 'completed' } });
              }
              // Create result (if not duplicate)
              const exists = await prisma.result.findUnique({ where: { athleteId_raceId: { athleteId: atletaId, raceId: race.id } } });
              if (!exists) {
                await prisma.result.create({ data: { athleteId: atletaId, raceId: race.id, time: tempo, distance: dist, points: 0 } });
                await prisma.athlete.update({ where: { id: atletaId }, data: { totalRaces: { increment: 1 } } });
              }
            } catch(e2) { console.log('[VERIFY AUTO-IMPORT]', e2.message); }
          }
        }
      } catch(e) { console.log('[VERIFY SAVE]',e.message); }
    }
    return { status, score, mensagem:msg, siteConfiavel, acessoOk, dadosEncontrados:{nome:extraido.encontrouNome||analiseIA?.encontrou_atleta||false,tempo:extraido.tempo||analiseIA?.tempo_encontrado||null,posicao:extraido.posicao||analiseIA?.posicao_encontrada||null}, analiseIA:analiseIA?{resumo:analiseIA.resumo,confianca:analiseIA.confianca}:null, proximoPasso:status==='verificado'?'Resultado salvo! Aparecerá no perfil após aprovação.':'Você pode enviar assim mesmo — um admin irá revisar.' };
  });

  fastify.post('/resultados/enviar-manual', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { linkResultado, nomeProva, distancia, tempoInformado, dataProva, cidade, estado, posicaoGeral } = req.body || {};
    if (!tempoInformado || !distancia) return reply.code(400).send({ error: 'Tempo e distância obrigatórios' });
    const u2=await prisma.user.findUnique({where:{id:u.userId},select:{name:true,athleteId:true}});
    let atletaId=u2.athleteId;
    if(!atletaId){
      const a=await prisma.athlete.create({data:{name:u2.name,totalRaces:0,totalPoints:0}});
      await prisma.user.update({where:{id:u.userId},data:{athleteId:a.id}});
      atletaId=a.id;
    }
    const r=await prisma.resultadoEnviado.create({data:{userId:u.userId,atletaId,linkOriginal:linkResultado||'',nomeAtleta:u2.name,nomeProva:nomeProva||'',distancia,tempoInformado,dataProva:dataProva?new Date(dataProva):new Date(),cidade:cidade||'',estado:estado||'',posicaoGeral:posicaoGeral?parseInt(posicaoGeral):null,scoreVerificacao:linkResultado?30:10,statusVerificacao:'pendente_revisao',dadosExtraidos:'{}'}});
    return { success:true, id:r.id, mensagem:'📋 Resultado enviado! Será revisado em até 24h.' };
  });

  fastify.get('/resultados/meus-enviados', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    return prisma.resultadoEnviado.findMany({where:{userId:u.userId},orderBy:{dataProva:'desc'},take:50}).catch(()=>[]);
  });

  fastify.get('/resultados/admin/pendentes', async (req, reply) => {
    if(req.headers['x-admin-key']!==(process.env.ADMIN_KEY||'pace-admin-2026')) return reply.code(403).send({error:'Sem permissão'});
    return prisma.resultadoEnviado.findMany({where:{statusVerificacao:{in:['pendente_revisao','parcial']}},orderBy:{criadoEm:'desc'},include:{user:{select:{name:true,email:true}}}}).catch(()=>[]);
  });

  fastify.patch('/resultados/admin/:id/aprovar', async (req, reply) => {
    if(req.headers['x-admin-key']!==(process.env.ADMIN_KEY||'pace-admin-2026')) return reply.code(403).send({error:'Sem permissão'});
    const env=await prisma.resultadoEnviado.findUnique({where:{id:req.params.id}});
    if(!env) return reply.code(404).send({error:'Não encontrado'});
    let race=await prisma.race.findFirst({where:{name:{contains:env.nomeProva||'Prova',mode:'insensitive'}}});
    if(!race) race=await prisma.race.create({data:{name:env.nomeProva||'Prova enviada pelo atleta',date:env.dataProva,city:env.cidade||'Brasil',state:env.estado||'BR',distances:env.distancia,organizer:'Enviado pelo atleta',status:'completed'}});
    await prisma.result.upsert({where:{athleteId_raceId:{athleteId:env.atletaId,raceId:race.id}},create:{athleteId:env.atletaId,raceId:race.id,time:env.tempoInformado,distance:env.distancia,overallRank:env.posicaoGeral,points:10},update:{time:env.tempoInformado}}).catch(()=>{});
    await prisma.resultadoEnviado.update({where:{id:req.params.id},data:{statusVerificacao:'aprovado'}});
    return { success:true, mensagem:'Resultado aprovado!' };
  });

  fastify.get('/ranking/buscar', async (req) => {
    const { nome, cidade, estado, distancia, faixaEtaria, pagina=1 } = req.query;
    const take=50, skip=(parseInt(pagina)-1)*take;
    const where={};
    if(nome) where.name={contains:nome,mode:'insensitive'};
    if(estado) where.state=estado;
    const faixas={'sub20':{lt:20},'20-29':{gte:20,lt:30},'30-39':{gte:30,lt:40},'40-49':{gte:40,lt:50},'50-59':{gte:50,lt:60},'60+':{gte:60}};
    if(faixaEtaria&&faixas[faixaEtaria]) where.age=faixas[faixaEtaria];
    const [atletas,total]=await Promise.all([
      prisma.athlete.findMany({where,include:{results:{where:distancia?{distance:{contains:distancia}}:{},orderBy:{createdAt:'desc'},take:3,include:{race:{select:{name:true,date:true,city:true}}}},user:{select:{photo:true,city:true}}},orderBy:{totalPoints:'desc'},take,skip}),
      prisma.athlete.count({where})
    ]);
    return { atletas:atletas.map((a,i)=>({posicao:skip+i+1,id:a.id,nome:a.name,foto:a.user?.photo,cidade:a.user?.city||a.state,estado:a.state,totalProvas:a.totalRaces,pontos:a.totalPoints,ultimosResultados:a.results.slice(0,3)})), total, pagina:parseInt(pagina), totalPaginas:Math.ceil(total/take) };
  });
}
