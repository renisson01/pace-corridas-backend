import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const corridas = [
  { nome: "Tropical Run", data: new Date("2026-03-01"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "Speed Producoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida Rustica 191 Anos da PMSE", data: new Date("2026-03-07"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km", organizador: "Policia Militar", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Circuito SEMEDI - Etapa Lagarto", data: new Date("2026-03-08"), cidade: "Lagarto", estado: "SE", distancias: "3km, 5km, 10km", organizador: "RC Producoes e Eventos", linkInscricao: "https://leveyourun.com/evt/circuito-semedi-de-corrida-derua-2026-dc4" },
  { nome: "Corrida do Peixe-Boi", data: new Date("2026-03-14"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km", organizador: "Fundacao Mamiferos Aquaticos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "1a Corrida da Policia Penal de Sergipe", data: new Date("2026-03-15"), cidade: "Aracaju", estado: "SE", distancias: "3km, 5km, 10km", organizador: "RC Producoes e Eventos", linkInscricao: "https://leveyourun.com/evt/1-corrida-da-policia-penal-desergipe-20-8kr" },
  { nome: "5a Corrida da Luz", data: new Date("2026-03-21"), cidade: "Lagarto", estado: "SE", distancias: "3km, 5km, 10km", organizador: "RC Producoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida Cidade de Aracaju", data: new Date("2026-03-28"), cidade: "Aracaju", estado: "SE", distancias: "5km, 10km, 24km", organizador: "Pref. Mun. de Aracaju / SEJESP", linkInscricao: "https://www.sympla.com.br" },
  { nome: "10a Corrida dos Amigos", data: new Date("2026-04-05"), cidade: "Porto da Folha", estado: "SE", distancias: "5km", organizador: "MM Informatica", linkInscricao: "https://www.sportschrono.com.br/evento/2026/corrida-de-rua/10-corrida-dos-amigos-de-porto-da-folha" },
  { nome: "Sunset Run", data: new Date("2026-04-11"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "Speed Producoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida Bob Esponja", data: new Date("2026-04-12"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "Conceito Solucoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Cactos Run 2026", data: new Date("2026-04-12"), cidade: "Caninde do Sao Francisco", estado: "SE", distancias: "6km, 7km, 10km", organizador: "Sertao Gelato", linkInscricao: "https://www.chipower.com.br/evento/2026/corrida-derua/cactos-run-2026" },
  { nome: "WE CAN RUN - 1a Etapa", data: new Date("2026-04-12"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "Conceito Solucoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida Trail Verao", data: new Date("2026-04-12"), cidade: "Aracaju", estado: "SE", distancias: "5km, 8km", organizador: "Sindicas Sergipe Brasil", linkInscricao: "https://leveyourun.com/evt/circuito-de-corrida-sindicas-desergipe-il4" },
  { nome: "Atena Night Run", data: new Date("2026-04-18"), cidade: "Itabaiana", estado: "SE", distancias: "3km, 5km, 10km", organizador: "Atena Protecao Veicular / Oliver Run", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida Corre Cristao", data: new Date("2026-04-19"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km", organizador: "Confins Producoes", linkInscricao: "https://www.centraldasinscricoes.com.br/evento/corrida-corre-cristao-aracaju" },
  { nome: "Circuito de Corridas TV Atalaia - 1a Etapa", data: new Date("2026-04-25"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "TV Atalaia / Speed Producoes", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida Nacional do SESI", data: new Date("2026-05-01"), cidade: "Aracaju", estado: "SE", distancias: "3km, 5km, 10km", organizador: "SESI / Speed Producoes", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida do Trabalhador - Itaporanga", data: new Date("2026-05-01"), cidade: "Itaporanga d Ajuda", estado: "SE", distancias: "6km", organizador: "Pref. Mun. de Itaporanga", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Track and Field Run Series - Aracaju I", data: new Date("2026-05-03"), cidade: "Aracaju", estado: "SE", distancias: "5km, 10km, 21km", organizador: "TFSports Eventos Esportivos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Live Run XP", data: new Date("2026-05-10"), cidade: "Aracaju", estado: "SE", distancias: "5km, 10km", organizador: "Conceito Solucoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Marata Night Race Aracaju", data: new Date("2026-05-23"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km, 15km", organizador: "Speed Producoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "1a Corrida da Academia Espaco Fitness", data: new Date("2026-05-31"), cidade: "Telha", estado: "SE", distancias: "5km", organizador: "Academia Espaco Fitness", linkInscricao: "https://inscricoes.com.br/eventos/1a-corrida-da-academia-espaco-fitness" },
  { nome: "Corrida da Colina do Santo Antonio", data: new Date("2026-06-06"), cidade: "Aracaju", estado: "SE", distancias: "5km, 10km", organizador: "Conceito Solucoes e Eventos", linkInscricao: "https://centraldacorrida.com.br/evento/colina26" },
  { nome: "Corrida Volta do Canarinho", data: new Date("2026-06-13"), cidade: "Estancia", estado: "SE", distancias: "5km, 10km", organizador: "Estanciano Sport Club", linkInscricao: "https://www.sportschrono.com.br/eventos" },
  { nome: "Cats Run", data: new Date("2026-06-13"), cidade: "Aracaju", estado: "SE", distancias: "5km, 10km", organizador: "ATP Marketing Esportiva", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida do Milhao 2026", data: new Date("2026-06-21"), cidade: "Aracaju", estado: "SE", distancias: "5km, 10km", organizador: "Federacao Sergipana de Atletismo", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida do Fogo", data: new Date("2026-07-04"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "Corpo de Bombeiros", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Itabaiana Night Race", data: new Date("2026-07-19"), cidade: "Itabaiana", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "Speed Producoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Meia Maratona do Parque", data: new Date("2026-07-26"), cidade: "Aracaju", estado: "SE", distancias: "3km, 5km, 10km, 21km", organizador: "Go Bravos", linkInscricao: "https://centraldacorrida.com.br/evento/meiadoparque2026" },
  { nome: "Aracaju 21K - Etapa Caju", data: new Date("2026-08-01"), cidade: "Aracaju", estado: "SE", distancias: "5km, 10km, 15km, 21km", organizador: "Federacao Sergipana de Atletismo", linkInscricao: "https://www.sympla.com.br" },
  { nome: "14a Corrida da Advocacia", data: new Date("2026-08-02"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "OAB-SE / Speed Producoes", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida Duque de Caxias", data: new Date("2026-08-16"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "28o BC", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Circuito TV Atalaia - 3a Etapa", data: new Date("2026-08-22"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "TV Atalaia / Speed Producoes", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Ultramaratona de Sergipe 100km", data: new Date("2026-08-29"), cidade: "Estancia", estado: "SE", distancias: "100km", organizador: "Projeto Seja Ultra", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Meia Maratona do Parque - Desafio 25km", data: new Date("2026-08-29"), cidade: "Aracaju", estado: "SE", distancias: "25km, 50km", organizador: "Projeto Seja Ultra", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Track and Field Run Series - Aracaju II", data: new Date("2026-09-27"), cidade: "Aracaju", estado: "SE", distancias: "5km, 10km, 15km", organizador: "TFSports Eventos Esportivos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Circuito SESC de Corridas - Etapa Aracaju", data: new Date("2026-09-20"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "SESC Sergipe", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Corrida Ze do Bairro - 8a Edicao", data: new Date("2026-10-04"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km, 15km", organizador: "Speed Producoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Circuito de Corridas CAIXA 2026 - Etapa Aracaju", data: new Date("2026-10-18"), cidade: "Aracaju", estado: "SE", distancias: "5km, 10km", organizador: "HT Sports", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Maratona de Aracaju - 1a Etapa", data: new Date("2026-10-25"), cidade: "Aracaju", estado: "SE", distancias: "10km, 21km", organizador: "Speed Producoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Maratona de Aracaju - 2a Etapa (42km)", data: new Date("2026-11-01"), cidade: "Aracaju", estado: "SE", distancias: "5km, 42km", organizador: "Speed Producoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "3a Corrida Beneficente Santa Dulce dos Pobres", data: new Date("2026-11-07"), cidade: "Itabaiana", estado: "SE", distancias: "3km, 5km, 10km", organizador: "Oratorio Santa Dulce", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Electric Run", data: new Date("2026-11-28"), cidade: "Aracaju", estado: "SE", distancias: "2,5km, 5km, 10km", organizador: "Speed Producoes e Eventos", linkInscricao: "https://www.sympla.com.br" },
  { nome: "Meia da Conceicao", data: new Date("2026-12-06"), cidade: "Aracaju", estado: "SE", distancias: "3km, 6km, 13km, 21km", organizador: "Conceito Solucoes e Eventos", linkInscricao: "https://centraldacorrida.com.br/evento/conceicao2026" },
  { nome: "Corrida da Virada", data: new Date("2026-12-20"), cidade: "Neopolis", estado: "SE", distancias: "5km, 10km", organizador: "Equipe Supere-se", linkInscricao: "https://www.sympla.com.br" },
];
async function main() {
  let ok=0,skip=0,err=0;
  for(const c of corridas){
    try{
      const existe=await prisma.corridaAberta.findFirst({where:{nome:c.nome,cidade:c.cidade}});
      if(existe){console.log('skip: '+c.nome);skip++;continue;}
      await prisma.corridaAberta.create({data:{nome:c.nome,data:c.data,cidade:c.cidade,estado:c.estado,distancias:c.distancias,linkInscricao:c.linkInscricao,organizador:c.organizador,fonte:'FSAt 2026',ativa:true}});
      console.log('ok: '+c.nome);ok++;
    }catch(e){console.log('err: '+c.nome+' '+e.message);err++;}
  }
  console.log('\nTotal: '+ok+' inseridas, '+skip+' skip, '+err+' erros.');
}
main().catch(console.error).finally(()=>prisma.$disconnect());