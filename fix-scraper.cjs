const fs = require('fs');
let c = fs.readFileSync('scripts/scraper-central-v3.cjs', 'utf8');

// 1. Adicionar birthRaw ao objeto validos
c = c.replace(
  "validos.push({name,gender,time,pace:calcPace(time,km),age,dist,\n          ageGroup:r.ds_categoria||null,rank:r.colocacao?parseInt(r.colocacao):null});",
  "const birthRaw = (r.data_nascimento && !r.data_nascimento.startsWith('1920') && !r.data_nascimento.startsWith('0001')) ? r.data_nascimento : null;\n        validos.push({name,gender,time,pace:calcPace(time,km),age,birthDate:birthRaw,dist,\n          ageGroup:r.ds_categoria||null,rank:r.colocacao?parseInt(r.colocacao):null});"
);

// 2. Adicionar birthDate no INSERT
c = c.replace(
  `'INSERT INTO "Athlete"(id,name,gender,state,age,"totalRaces","totalPoints","createdAt","updatedAt") VALUES '+vals+' ON CONFLICT DO NOTHING'`,
  `'INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES '+vals+' ON CONFLICT DO NOTHING'`
);

// 3. Adicionar birthDate no template do INSERT
c = c.replace(
  `const ag=a.age?a.age:'NULL';\n          return "('"+id+"','"+esc(a.name)+"',"+g+",'"+state+"',"+ag+",1,0,NOW(),NOW())"`,
  `const ag=a.age?a.age:'NULL';\n          const bd=a.birthDate?"'"+a.birthDate+"'":'NULL';\n          return "('"+id+"','"+esc(a.name)+"',"+g+",'"+state+"',"+ag+","+bd+",1,0,NOW(),NOW())"`
);

fs.writeFileSync('scripts/scraper-central-v3.cjs', c);
console.log('Scraper central atualizado com birthDate!');

// Verificar
const lines = c.split('\n');
lines.forEach((l, i) => {
  if (l.includes('birthDate') || l.includes('birthRaw')) {
    console.log(`L${i+1}: ${l.trim()}`);
  }
});
