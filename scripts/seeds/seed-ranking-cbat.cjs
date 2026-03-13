// seed-ranking-cbat.js
// Ranking CBAT - Meia Maratona Masculino 2025 - Top 100
// Fonte oficial: cbat.org.br/ranking
// Apaga ranking anterior e insere dados oficiais

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Converter tempo "H:MM:SS" para segundos
function tempoParaSegundos(tempo) {
  const partes = tempo.split(':');
  return parseInt(partes[0]) * 3600 + parseInt(partes[1]) * 60 + parseInt(partes[2]);
}

// Calcular pontos baseado no tempo (mais rápido = mais pontos)
function calcularPontos(tempo) {
  const segs = tempoParaSegundos(tempo);
  return Math.max(0, 100000 - segs);
}

// Calcular nível baseado no tempo de meia maratona
function calcularNivel(tempo) {
  const segs = tempoParaSegundos(tempo);
  if (segs <= 3900) return { nivel: "⭐ Elite Mundial", cor: "yellow" };      // sub 1:05
  if (segs <= 4200) return { nivel: "🔴 Elite Nacional", cor: "red" };        // sub 1:10
  if (segs <= 4500) return { nivel: "🟠 Sub-Elite", cor: "orange" };          // sub 1:15
  if (segs <= 4800) return { nivel: "🟡 Avançado", cor: "gold" };             // sub 1:20
  return { nivel: "🟢 Competitivo", cor: "green" };
}

// Converter data DD/MM/YYYY para Date
function parseData(dataStr) {
  const [dia, mes, ano] = dataStr.split('/');
  return new Date(`${ano}-${mes}-${dia}T08:00:00Z`);
}

// ============== TOP 100 CBAT - MEIA MARATONA MASCULINO 2025 ==============
const atletas = [
  { pos: 1, marca: "1:02:09", cbat: 81239, nome: "Fabio Jesus Correia", nasc: 1999, uf: "SP", clube: "Kiatleta", local: "Rio de Janeiro - RJ", data: "17/08/2025" },
  { pos: 2, marca: "1:03:04", cbat: 75734, nome: "Johnatas de Oliveira Cruz", nasc: 1990, uf: "MG", clube: "Praia Clube - CEMIG - Exercito - Futel", local: "Rio de Janeiro - RJ", data: "17/08/2025" },
  { pos: 3, marca: "1:04:36", cbat: 51700, nome: "Wendell Jeronimo Souza", nasc: 1991, uf: "MT", clube: "ACORR", local: "Rio de Janeiro - RJ", data: "17/08/2025" },
  { pos: 4, marca: "1:04:47", cbat: 45153, nome: "Giovani Dos Santos", nasc: 1981, uf: "MG", clube: "Reveza", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 5, marca: "1:04:52", cbat: 28160, nome: "Ederson Vilela Pereira", nasc: 1990, uf: "SP", clube: "E.C. Pinheiros", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 6, marca: "1:05:26", cbat: 74076, nome: "Savio de Paula Rodrigues Silva", nasc: 1998, uf: "SP", clube: "Kiatleta", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 7, marca: "1:05:27", cbat: 10515, nome: "Paulo Roberto de Almeida Paula", nasc: 1979, uf: "MS", clube: "ACORP/CG", local: "Sevilha - ESP", data: "23/02/2025" },
  { pos: 8, marca: "1:05:30", cbat: 45626, nome: "Wellington Bezerra da Silva", nasc: 1988, uf: "PE", clube: "Projeto Atletismo Campeão", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 9, marca: "1:05:41", cbat: 90750, nome: "Antonio Marco Pereira de Araujo", nasc: 1986, uf: "SP", clube: "IPEFE", local: "Sevilha - ESP", data: "23/02/2025" },
  { pos: 10, marca: "1:05:42", cbat: 46282, nome: "Melquisedeque Messias Ribeiro", nasc: 1995, uf: "SP", clube: "Itapira", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 11, marca: "1:05:48", cbat: 92947, nome: "Fernando Augusto Rodrigues da Silva", nasc: 1999, uf: "SP", clube: "IPEFE", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 12, marca: "1:05:49", cbat: 44684, nome: "Leonardo Santana de Olinda", nasc: 1992, uf: "MG", clube: "AMEU", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 13, marca: "1:05:52", cbat: 64045, nome: "Vagner da Silva Noronha", nasc: 1984, uf: "SP", clube: "FAE - Osasco", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 14, marca: "1:05:54", cbat: 54560, nome: "Gustavo Barros de Souza", nasc: 1996, uf: "GO", clube: "ACOP/Porangatu", local: "Sevilha - ESP", data: "23/02/2025" },
  { pos: 15, marca: "1:06:15", cbat: 78125, nome: "Lucas Paulo Ferreira Barboza", nasc: 1990, uf: "MG", clube: "Praia Clube - CEMIG - Exercito - Futel", local: "São Paulo - SP", data: "18/05/2025" },
  { pos: 16, marca: "1:06:16", cbat: 54287, nome: "Michael Gabriel da Silva Trindade", nasc: 1996, uf: "PE", clube: "APA-Petrolina", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 17, marca: "1:06:21", cbat: 37506, nome: "Jose Marcio Leão da Silva", nasc: 1990, uf: "PE", clube: "APA-Petrolina", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 18, marca: "1:06:28", cbat: 54108, nome: "Joao Marcos Santos Ferreira", nasc: 1995, uf: "SE", clube: "Clube Trota Mundo", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 19, marca: "1:06:36", cbat: 87326, nome: "Jose Geraldo Ferreira Junior", nasc: 1990, uf: "MG", clube: "Clã Delfos", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 20, marca: "1:06:40", cbat: 35882, nome: "Justino Pedro da Silva", nasc: 1985, uf: "PE", clube: "APA-Petrolina", local: "Rio de Janeiro - RJ", data: "22/06/2025" },
  { pos: 20, marca: "1:06:40", cbat: 46868, nome: "Maicon Douglas da Silva Mancuso", nasc: 1993, uf: "SC", clube: "CAC", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 22, marca: "1:06:43", cbat: 66081, nome: "Givaldo Araujo Sena", nasc: 1992, uf: "BA", clube: "AFAC", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 23, marca: "1:06:54", cbat: 82518, nome: "Emerson Rosa Oliveira", nasc: 1996, uf: "SC", clube: "MUN Caçador", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 24, marca: "1:07:09", cbat: 46709, nome: "Luanderson de Jesus Santos", nasc: 1989, uf: "BA", clube: "AALFA", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 25, marca: "1:07:14", cbat: 67833, nome: "Vitor de Oliveira da Silva", nasc: 2001, uf: "PR", clube: "IPEC Londrina FEL", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 26, marca: "1:07:35", cbat: 62066, nome: "Vitor dos Santos Silva", nasc: 1996, uf: "RS", clube: "ANR-Ijui/Atletismo", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 27, marca: "1:07:40", cbat: 92618, nome: "Kayo Atila Boaventura Goncalves", nasc: 2001, uf: "RS", clube: "ANR-Ijui/Atletismo", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 28, marca: "1:08:03", cbat: 23612, nome: "Joilson Bernardo da Silva", nasc: 1987, uf: "PE", clube: "APA-Petrolina", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 29, marca: "1:08:04", cbat: 76622, nome: "Gabriel Alves Pozzo", nasc: 1997, uf: "RS", clube: "ANR-Ijui/Atletismo", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 30, marca: "1:08:09", cbat: 33161, nome: "Flavio Carvalho Stumpf", nasc: 1987, uf: "MG", clube: "UFJF", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 31, marca: "1:08:15", cbat: 84786, nome: "Lucas Simoes de Oliveira", nasc: 1989, uf: "SC", clube: "APA/SECEL Jaraguá do Sul", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 32, marca: "1:08:22", cbat: 82451, nome: "Wilson Alves de Araujo Junior", nasc: 1996, uf: "SP", clube: "ASPMP", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 33, marca: "1:08:26", cbat: 86401, nome: "Willdeberg Claudino dos Santos", nasc: 1991, uf: "RN", clube: "CARN", local: "Lisboa - POR", data: "09/03/2025" },
  { pos: 34, marca: "1:08:50", cbat: 61205, nome: "Andre da Conceicao Santos", nasc: 1990, uf: "BA", clube: "Olimpico", local: "Salvador - BA", data: "27/04/2025" },
  { pos: 35, marca: "1:08:52", cbat: 71296, nome: "Juliano de Araujo", nasc: 1999, uf: "RN", clube: "CARN", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 36, marca: "1:09:07", cbat: 132430, nome: "Luis Fernando Fontana Antunes de Oliveira", nasc: 1990, uf: "SP", clube: "SC-FED-SP", local: "New York - USA", data: "02/11/2025" },
  { pos: 37, marca: "1:09:12", cbat: 52901, nome: "Alexandre Ribeiro Pastorello", nasc: 1998, uf: "SP", clube: "A.F.E", local: "Rio de Janeiro - RJ", data: "22/06/2025" },
  { pos: 38, marca: "1:09:13", cbat: 82351, nome: "Jose Eduardo Papini de Oliveira", nasc: 1996, uf: "MG", clube: "Praia Clube - CEMIG - Exercito - Futel", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 39, marca: "1:09:18", cbat: 67240, nome: "Fabricio Gomes Santos", nasc: 1989, uf: "BA", clube: "AFAC", local: "Rio de Janeiro - RJ", data: "22/06/2025" },
  { pos: 40, marca: "1:09:25", cbat: 45081, nome: "Glenison Gilbert de Carvalho", nasc: 1986, uf: "MS", clube: "ACORP/CG", local: "Campo Grande - MS", data: "12/10/2025" },
  { pos: 41, marca: "1:09:37", cbat: 82825, nome: "Maurinaldo dos Santos", nasc: 1996, uf: "MS", clube: "A.D.A.C.", local: "Campo Grande - MS", data: "12/10/2025" },
  { pos: 42, marca: "1:10:00", cbat: 28157, nome: "Robson Pereira de Lima", nasc: 1988, uf: "SP", clube: "ASPMP", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 43, marca: "1:10:03", cbat: 132981, nome: "Thiago Emmanuel Barbosa", nasc: 1986, uf: "MG", clube: "HF", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 44, marca: "1:10:05", cbat: 50024, nome: "Jurandyr Couto Junior", nasc: 1989, uf: "SC", clube: "ACA", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 45, marca: "1:10:18", cbat: 71081, nome: "Naisson Nidgie da Silva Pinheiro", nasc: 1990, uf: "RS", clube: "ANR-Ijui/Atletismo", local: "Rio de Janeiro - RJ", data: "22/06/2025" },
  { pos: 46, marca: "1:10:27", cbat: 45975, nome: "Frederico Santos Abraao", nasc: 1995, uf: "SP", clube: "Luasa Sports", local: "Rio de Janeiro - RJ", data: "03/08/2025" },
  { pos: 47, marca: "1:10:31", cbat: 83565, nome: "Pablo da Silva Oliveira", nasc: 1987, uf: "RS", clube: "ANR-Ijui/Atletismo", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 48, marca: "1:10:32", cbat: 83763, nome: "Renilson Vitorino da Silva", nasc: 1985, uf: "SP", clube: "SC-FED-SP", local: "Rio de Janeiro - RJ", data: "13/07/2025" },
  { pos: 48, marca: "1:10:32", cbat: 98618, nome: "Gilvan da Silva Ferreira", nasc: 1986, uf: "SP", clube: "Clube Esperia", local: "São Paulo - SP", data: "18/05/2025" },
  { pos: 50, marca: "1:10:34", cbat: 68947, nome: "Pedro Paulo Alves Cordeiro", nasc: 1987, uf: "DF", clube: "CORDF", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 51, marca: "1:10:48", cbat: 46675, nome: "Lucas Rocha de Lima", nasc: 1990, uf: "MG", clube: "Clã Delfos", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 52, marca: "1:10:54", cbat: 76167, nome: "Gabriel Picarelli Mafalda", nasc: 1987, uf: "RS", clube: "APA - RS", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 53, marca: "1:10:55", cbat: 58882, nome: "Wanderson Alves da Silva", nasc: 2000, uf: "DF", clube: "Tornado", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 54, marca: "1:11:07", cbat: 92331, nome: "Antonio Jose de Sousa Lopes", nasc: 1989, uf: "CE", clube: "CEUC/UFC", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 55, marca: "1:11:18", cbat: 68142, nome: "Dionathan Freitas Hermes", nasc: 1998, uf: "RS", clube: "AMO", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 56, marca: "1:11:24", cbat: 93915, nome: "Andre Luiz de Lima da Conceicao", nasc: 1985, uf: "RJ", clube: "PMNI", local: "Rio de Janeiro - RJ", data: "03/08/2025" },
  { pos: 57, marca: "1:11:25", cbat: 57971, nome: "Renan Barckfeld Correia", nasc: 1995, uf: "RS", clube: "ANR-Ijui/Atletismo", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 57, marca: "1:11:25", cbat: 81264, nome: "Alan Lasch Vieira", nasc: 2002, uf: "RS", clube: "ASCORT", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 57, marca: "1:11:25", cbat: 86583, nome: "Ailton Casimiro", nasc: 1979, uf: "SP", clube: "ASUFAM", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 60, marca: "1:11:27", cbat: 88947, nome: "Everton Dorneles Nascimento", nasc: 1994, uf: "RS", clube: "ANR-Ijui/Atletismo", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 61, marca: "1:11:28", cbat: 78907, nome: "Elias Neto Fernandes Nazario", nasc: 1995, uf: "RN", clube: "CARN", local: "Rio de Janeiro - RJ", data: "03/08/2025" },
  { pos: 62, marca: "1:11:34", cbat: 95816, nome: "Bruno Braga Almeida Souza", nasc: 1995, uf: "MG", clube: "AMEU", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 63, marca: "1:11:35", cbat: 25950, nome: "Edmilson dos Reis Santana", nasc: 1987, uf: "MG", clube: "Clã Delfos", local: "São Paulo - SP", data: "18/05/2025" },
  { pos: 64, marca: "1:11:36", cbat: 136188, nome: "Gustavo de Almeida Silva", nasc: 2003, uf: "MG", clube: "HF", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 65, marca: "1:11:40", cbat: 135755, nome: "Jeronimo Santanna de Aguiar", nasc: 1996, uf: "ES", clube: "Cariri Runners", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 66, marca: "1:11:44", cbat: 87636, nome: "Manoel Rafael Anselmo Pereira", nasc: 1992, uf: "RJ", clube: "Futuro Olímpico Arnaldo de Oliveira", local: "Rio de Janeiro - RJ", data: "13/07/2025" },
  { pos: 67, marca: "1:11:47", cbat: 86200, nome: "Lucas da Silva Ferraz", nasc: 1991, uf: "SP", clube: "ASA", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 68, marca: "1:11:48", cbat: 134968, nome: "Marcio Antonio Rodrigues de Souza", nasc: 1984, uf: "RJ", clube: "PMNI", local: "Rio de Janeiro - RJ", data: "13/07/2025" },
  { pos: 69, marca: "1:11:51", cbat: 46275, nome: "Rafael Santos de Novais", nasc: 1985, uf: "SP", clube: "Instituto Athlon", local: "São Paulo - SP", data: "18/05/2025" },
  { pos: 70, marca: "1:12:05", cbat: 86368, nome: "Jamal Soufane", nasc: 1990, uf: "CE", clube: "ACJBSA", local: "Rio de Janeiro - RJ", data: "22/06/2025" },
  { pos: 71, marca: "1:12:13", cbat: 96066, nome: "Diego Henrique de Oliveira Silva", nasc: 1995, uf: "SP", clube: "Kiatleta", local: "São Paulo - SP", data: "18/05/2025" },
  { pos: 72, marca: "1:12:21", cbat: 52117, nome: "Eric Adriano Silva Santos", nasc: 1993, uf: "MA", clube: "Pé de Asa", local: "Rio de Janeiro - RJ", data: "22/06/2025" },
  { pos: 73, marca: "1:12:35", cbat: 31258, nome: "Samuel Souza do Nascimento", nasc: 1988, uf: "SP", clube: "IPEFE", local: "Rio de Janeiro - RJ", data: "03/08/2025" },
  { pos: 74, marca: "1:12:39", cbat: 82655, nome: "Diogo Procopio Spadotto", nasc: 2002, uf: "SP", clube: "Instituto Suman", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 75, marca: "1:12:51", cbat: 61415, nome: "Leonardo Willrich Padilha Padovany", nasc: 2000, uf: "SC", clube: "AACN", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 76, marca: "1:12:52", cbat: 49586, nome: "Adelio dos Santos", nasc: 1994, uf: "RS", clube: "AMO", local: "Rio de Janeiro - RJ", data: "22/06/2025" },
  { pos: 77, marca: "1:12:59", cbat: 63628, nome: "Leandro Silva Costa", nasc: 1984, uf: "AM", clube: "Clube de Atletismo Elisa Bessa", local: "Rio de Janeiro - RJ", data: "22/06/2025" },
  { pos: 78, marca: "1:13:14", cbat: 83461, nome: "Fernando Vasque", nasc: 1993, uf: "PR", clube: "P M Colombo", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 78, marca: "1:13:14", cbat: 137199, nome: "Igon Antonio de Campos Bohn", nasc: 1987, uf: "RS", clube: "AAVA", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 80, marca: "1:13:25", cbat: 81330, nome: "Wellington Rodrigues de Oliveira", nasc: 2005, uf: "SP", clube: "Santana de Parnaiba", local: "Rio de Janeiro - RJ", data: "03/08/2025" },
  { pos: 81, marca: "1:13:41", cbat: 58824, nome: "Neemias Alves da Cruz", nasc: 1997, uf: "MG", clube: "UFJF", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 82, marca: "1:13:47", cbat: 96514, nome: "Luis Vagner Lucarelli Veiga", nasc: 1983, uf: "RS", clube: "Decide", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 83, marca: "1:13:50", cbat: 93771, nome: "Leoney Oliveira Gomes", nasc: 1995, uf: "TO", clube: "AACF", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 84, marca: "1:14:10", cbat: 83745, nome: "Maxwel Fernando Romano", nasc: 1998, uf: "MG", clube: "Praia Clube - CEMIG - Exercito - Futel", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 85, marca: "1:14:20", cbat: 43000, nome: "Adriano Pacheco da Cruz", nasc: 1988, uf: "SP", clube: "IEMA", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 86, marca: "1:14:23", cbat: 83238, nome: "Robson Alvarenga", nasc: 1993, uf: "MG", clube: "A.A.C.", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 87, marca: "1:14:24", cbat: 23606, nome: "Valdison das Neves Silva", nasc: 1990, uf: "CE", clube: "ADES", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 88, marca: "1:14:25", cbat: 63577, nome: "Marcos Ricardo Lima Carola", nasc: 1996, uf: "MG", clube: "Clã Delfos", local: "Rio de Janeiro - RJ", data: "21/06/2025" },
  { pos: 89, marca: "1:14:36", cbat: 58833, nome: "Francisco Verissimo Perrout Lima", nasc: 1999, uf: "MG", clube: "UFJF", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 90, marca: "1:14:58", cbat: 31096, nome: "Edmilson Pereira da Silva", nasc: 1979, uf: "PI", clube: "4F AJMT", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 91, marca: "1:15:08", cbat: 134990, nome: "Vinicius Colomby Ruiz", nasc: 1998, uf: "RS", clube: "Decide", local: "Porto Alegre - RS", data: "07/06/2025" },
  { pos: 92, marca: "1:15:12", cbat: 63694, nome: "Andre dos Santos Santana", nasc: 1995, uf: "SE", clube: "Clube Trota Mundo", local: "Rio de Janeiro - RJ", data: "13/07/2025" },
  { pos: 93, marca: "1:15:14", cbat: 51978, nome: "Cristiano Ribeiro", nasc: 1988, uf: "PR", clube: "IPEC Londrina FEL", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 94, marca: "1:15:27", cbat: 51081, nome: "Filipe de Miranda", nasc: 1994, uf: "MS", clube: "ACORP/CG", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 95, marca: "1:15:29", cbat: 92110, nome: "Helinton da Silva Loureiro", nasc: 1991, uf: "RJ", clube: "Mangueira do Futuro", local: "Rio de Janeiro - RJ", data: "22/06/2025" },
  { pos: 96, marca: "1:15:43", cbat: 89013, nome: "Bryan Matthaeus da Silva", nasc: 1990, uf: "RJ", clube: "Futuro Olímpico Arnaldo de Oliveira", local: "Rio de Janeiro - RJ", data: "03/08/2025" },
  { pos: 97, marca: "1:15:44", cbat: 83824, nome: "Fabiano Moura dos Santos", nasc: 1980, uf: "RJ", clube: "Futuro Olímpico Arnaldo de Oliveira", local: "Rio de Janeiro - RJ", data: "03/08/2025" },
  { pos: 98, marca: "1:16:25", cbat: 47730, nome: "Fabio Sant Anna de Souza Alves", nasc: 1994, uf: "MG", clube: "Clã Delfos", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 98, marca: "1:16:25", cbat: 55579, nome: "Renan da Silva Teles Sousa", nasc: 1998, uf: "SP", clube: "ADC São Bernardo", local: "Porto Alegre - RS", data: "27/04/2025" },
  { pos: 100, marca: "1:16:29", cbat: 45030, nome: "Marcio Barreto Silva", nasc: 1978, uf: "BA", clube: "A.A.S.F", local: "Salvador - BA", data: "27/04/2025" },
];

async function seed() {
  console.log('🏃 PACE - Seed Ranking CBAT Meia Maratona Masculino 2025');
  console.log('📊 Total de atletas: ' + atletas.length);
  console.log('');

  // 1. Apagar dados antigos (na ordem correta por causa das foreign keys)
  console.log('🗑️  Apagando ranking anterior...');
  
  const deletedResults = await prisma.result.deleteMany({});
  console.log(`   ↳ ${deletedResults.count} resultados removidos`);
  
  const deletedAthletes = await prisma.athlete.deleteMany({});
  console.log(`   ↳ ${deletedAthletes.count} atletas removidos`);

  // Manter corridas existentes, mas criar as que faltam para os resultados
  // Agrupar provas por local+data
  const provasUnicas = {};
  for (const a of atletas) {
    const chave = `${a.local}|${a.data}`;
    if (!provasUnicas[chave]) {
      provasUnicas[chave] = {
        local: a.local,
        data: a.data,
        cidade: a.local.split(' - ')[0].trim(),
        estado: a.local.split(' - ')[1]?.trim() || 'BR'
      };
    }
  }

  // 2. Criar/encontrar corridas para os resultados
  console.log('');
  console.log('🏁 Criando provas oficiais...');
  
  const corridaMap = {};
  for (const [chave, prova] of Object.entries(provasUnicas)) {
    const nomeProva = `Meia Maratona - ${prova.cidade} (CBAT 2025)`;
    
    // Tentar encontrar corrida existente ou criar
    let corrida = await prisma.race.findFirst({
      where: { 
        name: nomeProva,
        date: parseData(prova.data)
      }
    });

    if (!corrida) {
      corrida = await prisma.race.create({
        data: {
          name: nomeProva,
          date: parseData(prova.data),
          city: prova.cidade,
          state: prova.estado,
          distances: "21km",
          organizer: "CBAt - Confederação Brasileira de Atletismo",
          status: "completed"
        }
      });
      console.log(`   ✅ ${nomeProva} (${prova.data})`);
    } else {
      console.log(`   ♻️  ${nomeProva} já existe`);
    }
    
    corridaMap[chave] = corrida.id;
  }

  // 3. Inserir os 100 atletas com resultados
  console.log('');
  console.log('👟 Inserindo Top 100 CBAT...');

  let inseridos = 0;
  for (const a of atletas) {
    const anoAtual = 2025;
    const idade = anoAtual - a.nasc;
    const pontos = calcularPontos(a.marca);
    const { nivel, cor } = calcularNivel(a.marca);
    
    const chaveProva = `${a.local}|${a.data}`;
    const corridaId = corridaMap[chaveProva];

    // Calcular pace por km (meia = 21.0975 km)
    const segs = tempoParaSegundos(a.marca);
    const paceSegs = segs / 21.0975;
    const paceMin = Math.floor(paceSegs / 60);
    const paceSec = Math.round(paceSegs % 60);
    const pace = `${paceMin}:${String(paceSec).padStart(2, '0')}/km`;

    // Criar atleta
    const atleta = await prisma.athlete.create({
      data: {
        name: a.nome,
        equipe: `${a.clube}/${a.uf}`,
        state: a.uf,
        gender: "M",
        age: idade,
        totalRaces: 1,
        totalPoints: pontos,
      }
    });

    // Criar resultado vinculado à prova
    await prisma.result.create({
      data: {
        athleteId: atleta.id,
        raceId: corridaId,
        time: a.marca,
        pace: pace,
        overallRank: a.pos,
        distance: "21km",
        points: pontos,
        ageGroup: calcularFaixaEtaria(idade)
      }
    });

    inseridos++;
    if (inseridos % 10 === 0 || inseridos === atletas.length) {
      console.log(`   ${inseridos}/${atletas.length} atletas inseridos...`);
    }
  }

  // 4. Resumo final
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('✅ RANKING CBAT IMPORTADO COM SUCESSO!');
  console.log('═══════════════════════════════════════════');
  console.log(`📊 ${inseridos} atletas inseridos`);
  console.log(`🏁 ${Object.keys(provasUnicas).length} provas registradas`);
  console.log(`🥇 #1: ${atletas[0].nome} — ${atletas[0].marca}`);
  console.log(`🏅 #100: ${atletas[atletas.length-1].nome} — ${atletas[atletas.length-1].marca}`);
  console.log('');
  console.log('📌 Categoria: Meia Maratona Masculino 2025');
  console.log('📌 Fonte: CBAt - Confederação Brasileira de Atletismo');
  console.log('📌 URL: cbat.org.br/ranking');
  console.log('═══════════════════════════════════════════');
}

function calcularFaixaEtaria(idade) {
  if (idade < 20) return "Sub-20";
  if (idade < 25) return "20-24";
  if (idade < 30) return "25-29";
  if (idade < 35) return "30-34";
  if (idade < 40) return "35-39";
  if (idade < 45) return "40-44";
  if (idade < 50) return "45-49";
  if (idade < 55) return "50-54";
  return "55+";
}

seed()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ ERRO:', e);
    prisma.$disconnect();
    process.exit(1);
  });
