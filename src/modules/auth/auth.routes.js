
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
const prisma = new PrismaClient();

function generateKeyPair() {
  const privateKey = crypto.randomBytes(32).toString('hex');
  const publicKey = crypto.createHash('sha256').update(privateKey).digest('hex');
  return { privateKey, publicKey };
}

function generateToken(athleteId) {
  const payload = Buffer.from(JSON.stringify({id:athleteId,exp:Date.now()+7*24*60*60*1000})).toString('base64');
  return payload;
}

function verifyToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token,'base64').toString());
    if(payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export async function authRoutes(fastify) {

  // REGISTRO
  fastify.post('/auth/register', async(req,reply) => {
    const {name,email,age,gender,city,state,birthYear} = req.body;
    if(!name||!email) return reply.code(400).send({error:'Nome e email obrigatórios'});
    
    const exists = await prisma.athlete.findFirst({where:{bio:{contains:email}}});
    if(exists) return reply.code(409).send({error:'Email já cadastrado'});
    
    const {privateKey,publicKey} = generateKeyPair();
    
    const athlete = await prisma.athlete.create({data:{
      name, age:parseInt(age)||0, gender:gender||'M',
      city:city||'', state:state||'',
      bio: JSON.stringify({email,publicKey,birthYear:birthYear||null,premium:false,joinedAt:new Date()})
    }});
    
    const token = generateToken(athlete.id);
    
    return {
      success: true,
      message: 'Conta criada! Guarde sua chave privada - ela não pode ser recuperada!',
      athlete: {id:athlete.id,name:athlete.name,city:athlete.city,state:athlete.state},
      auth: {token, publicKey, privateKey},
      warning: '🔐 SALVE SUA CHAVE PRIVADA AGORA: ' + privateKey
    };
  });

  // LOGIN
  fastify.post('/auth/login', async(req,reply) => {
    const {email, privateKey} = req.body;
    if(!email&&!privateKey) return reply.code(400).send({error:'Envie email ou privateKey'});
    
    let athlete = null;
    
    if(privateKey) {
      const publicKey = crypto.createHash('sha256').update(privateKey).digest('hex');
      const all = await prisma.athlete.findMany({where:{bio:{contains:publicKey}}});
      athlete = all[0] || null;
    } else if(email) {
      const all = await prisma.athlete.findMany({where:{bio:{contains:email}}});
      athlete = all[0] || null;
    }
    
    if(!athlete) return reply.code(401).send({error:'Atleta não encontrado'});
    
    const token = generateToken(athlete.id);
    let bio = {};
    try { bio = JSON.parse(athlete.bio||'{}'); } catch{}
    
    return {
      success: true,
      token,
      athlete: {
        id:athlete.id, name:athlete.name,
        city:athlete.city, state:athlete.state,
        gender:athlete.gender, age:athlete.age,
        publicKey:bio.publicKey, premium:bio.premium||false
      }
    };
  });

  // PERFIL COMPLETO DO ATLETA
  fastify.get('/athletes/:id/profile', async(req,reply) => {
    const {id} = req.params;
    const athlete = await prisma.athlete.findUnique({where:{id}});
    if(!athlete) return reply.code(404).send({error:'Não encontrado'});
    
    const results = await prisma.result.findMany({
      where:{athleteId:id},
      include:{race:{select:{name:true,date:true,city:true,distances:true}}},
      orderBy:{race:{date:'desc'}}
    });
    
    let bio = {};
    try { bio = JSON.parse(athlete.bio||'{}'); } catch{}
    
    // Stats
    const totalKm = results.reduce((sum,r) => {
      const km = parseFloat(String(r.distance).replace('km','').replace(',','.'));
      return sum + (isNaN(km)?0:km);
    }, 0);
    
    const podios = results.filter(r=>r.overallRank<=3).length;
    const distCount = {};
    results.forEach(r=>{distCount[r.distance]=(distCount[r.distance]||0)+1;});
    
    return {
      athlete: {
        id:athlete.id, name:athlete.name,
        age:athlete.age, gender:athlete.gender,
        city:athlete.city, state:athlete.state,
        publicKey:bio.publicKey, premium:bio.premium||false,
        joinedAt:bio.joinedAt
      },
      stats: {
        totalRaces:results.length, totalKm:Math.round(totalKm),
        podios, distancesRun:distCount
      },
      results: results.slice(0,10).map(r=>({
        race:r.race?.name, date:r.race?.date,
        city:r.race?.city, distance:r.distance,
        time:r.time, pace:r.pace,
        overallRank:r.overallRank, ageGroup:r.ageGroup
      }))
    };
  });

  // BUSCAR ATLETAS (Tinder do corredor)
  fastify.get('/athletes/nearby', async(req,reply) => {
    const {city,state,gender,minAge,maxAge,limit=20} = req.query;
    const where = {};
    if(city) where.city = {contains:city, mode:'insensitive'};
    else if(state) where.state = state;
    if(gender) where.gender = gender;
    if(minAge||maxAge) {
      where.age = {};
      if(minAge) where.age.gte = parseInt(minAge);
      if(maxAge) where.age.lte = parseInt(maxAge);
    }
    
    const athletes = await prisma.athlete.findMany({
      where, take:parseInt(limit),
      include:{_count:{select:{results:true}}}
    });
    
    return athletes.map(a => {
      let bio = {};
      try { bio = JSON.parse(a.bio||'{}'); } catch{}
      return {
        id:a.id, name:a.name, age:a.age,
        gender:a.gender, city:a.city, state:a.state,
        totalRaces:a._count.results,
        publicKey:bio.publicKey||null,
        pace:a.pace||null
      };
    });
  });

  // MATCH - Tinder do corredor
  fastify.post('/athletes/:id/match', async(req,reply) => {
    const {id} = req.params;
    const {targetId} = req.body;
    if(!targetId) return reply.code(400).send({error:'Envie targetId'});
    
    const existing = await prisma.match.findFirst({
      where:{OR:[{athleteId:id,matchedId:targetId},{athleteId:targetId,matchedId:id}]}
    });
    
    if(existing) {
      if(existing.status==='matched') return {status:'already_matched',message:'Vocês já são parceiros de treino!'};
      if(existing.athleteId===id) return {status:'waiting',message:'Aguardando resposta...'};
      // Outro deu like primeiro — é um match!
      await prisma.match.update({where:{id:existing.id},data:{status:'matched'}});
      return {status:'matched',message:'🎉 Match! Encontraram um parceiro de treino!'};
    }
    
    await prisma.match.create({data:{athleteId:id,matchedId:targetId,status:'pending'}});
    return {status:'liked',message:'Like enviado! Aguardando resposta...'};
  });

  // MEUS MATCHES
  fastify.get('/athletes/:id/matches', async(req,reply) => {
    const {id} = req.params;
    const matches = await prisma.match.findMany({
      where:{OR:[{athleteId:id,status:'matched'},{matchedId:id,status:'matched'}]},
      include:{
        athlete:{select:{id:true,name:true,city:true,age:true,gender:true}},
        matched:{select:{id:true,name:true,city:true,age:true,gender:true}}
      }
    });
    
    return matches.map(m => ({
      matchId: m.id,
      partner: m.athleteId===id ? m.matched : m.athlete,
      matchedAt: m.createdAt
    }));
  });
}
