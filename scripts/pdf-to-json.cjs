#!/usr/bin/env node
/**
 * REGENI — Converte PDF de resultado de corrida para JSON
 * Usa apenas módulos nativos (sem DOMMatrix)
 * 
 * REQUER: npm install -g pdf-parse  OU  pip3 install pdfplumber
 * 
 * USO:
 *   # Opção 1: com Python (mais confiável)
 *   python3 scripts/pdf-extract.py MASCULINO-10KM.pdf > /tmp/masc10k.txt
 *   node scripts/pdf-to-json.cjs --text /tmp/masc10k.txt /tmp/masc10k.json
 * 
 *   # Opção 2: direto (se tiver pdftotext instalado)
 *   pdftotext -layout MASCULINO-10KM.pdf /tmp/masc10k.txt
 *   node scripts/pdf-to-json.cjs --text /tmp/masc10k.txt /tmp/masc10k.json
 */
const fs = require('fs');

function parseResults(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  
  for (const line of lines) {
    if (/^Coloc|^Página|^Relatório|CORRIDA.*Relatório|CORRIDA.*Masculino|CORRIDA.*Feminino/i.test(line)) continue;
    if (/^Num\.|^Nome|^Sx\.|^Idd\./i.test(line)) continue;
    
    // TBH format: pos num name gender age ageGroup ...rest... tempo [liquido]
    const m = line.match(/^(\d+)\s+(\d+)\s+(.+?)\s+(M|F)\s+(\d+)\s+([FM]\d{4})\s+(.+?)\s+(\d{2}:\d{2}:\d{2})\s*(\d{2}:\d{2}:\d{2})?$/);
    if (!m) {
      // Try alternative: some PDFs have different spacing
      const m2 = line.match(/^(\d+)\s+(\d+)\s+(.+?)\s+(M|F)\s+(\d+)\s+([FM]\d{4})\s+/);
      if (!m2) continue;
      // Find times at end
      const times = line.match(/(\d{2}:\d{2}:\d{2})\s*(\d{2}:\d{2}:\d{2})?\s*$/);
      if (!times) continue;
      
      const pos = parseInt(m2[1]);
      const nome = m2[3].replace(/["\u201C\u201D]/g, '').trim().toUpperCase();
      const genero = m2[4];
      const idade = parseInt(m2[5]);
      const faixa = m2[6];
      const tempo = times[2] || times[1];
      
      if (!nome || nome.length < 2 || tempo === '00:00:00' || tempo < '00:01:00') continue;
      
      // Extract equipe
      const afterFaixa = line.substring(line.indexOf(faixa) + faixa.length, line.lastIndexOf(times[0])).trim();
      let equipe = '';
      const parts = afterFaixa.split(/\s+/);
      if (parts.length > 1 && /^[\d-]+$/.test(parts[0])) {
        equipe = parts.slice(1).join(' ').trim();
      } else if (parts.length > 0 && !/^[\d-]+$/.test(parts[0])) {
        equipe = afterFaixa.replace(/^[\d-]+\s*/, '').trim();
      }
      equipe = cleanEquipe(equipe);
      
      results.push({ pos, nome, idade, faixa, genero, equipe, tempo });
      continue;
    }
    
    const pos = parseInt(m[1]);
    const nome = m[3].replace(/["\u201C\u201D]/g, '').trim().toUpperCase();
    const genero = m[4];
    const idade = parseInt(m[5]);
    const faixa = m[6];
    const tempo = m[9] || m[8];
    
    if (!nome || nome.length < 2 || tempo === '00:00:00' || tempo < '00:01:00') continue;
    
    let equipe = '';
    const middle = m[7].trim();
    const middleParts = middle.split(/\s+/);
    if (middleParts.length > 1 && /^[\d-]+$/.test(middleParts[0])) {
      equipe = middleParts.slice(1).join(' ').trim();
    } else if (!/^[\d-]+$/.test(middle)) {
      equipe = middle.replace(/^[\d-]+\s*/, '').trim();
    }
    equipe = cleanEquipe(equipe);
    
    results.push({ pos, nome, idade, faixa, genero, equipe, tempo });
  }
  
  return results;
}

function cleanEquipe(e) {
  if (!e || e === '-') return '';
  e = e.replace(/\s*(INDIVIDUAL|SEPARAD[OA]|RETIRADA.*|\/\s*INDIVIDUAL)$/i, '').trim();
  if (e.length < 2 || e === '-') return '';
  return e;
}

async function main() {
  let textFile, outFile;
  
  if (process.argv[2] === '--text') {
    textFile = process.argv[3];
    outFile = process.argv[4] || textFile.replace(/\.txt$/i, '.json');
  } else {
    // Try to use pdftotext
    const pdfFile = process.argv[2];
    outFile = process.argv[3] || pdfFile.replace(/\.pdf$/i, '.json');
    
    if (!pdfFile) {
      console.log('USO:');
      console.log('  # Primeiro extraia o texto do PDF:');
      console.log('  pdftotext -layout arquivo.pdf /tmp/resultado.txt');
      console.log('  # Ou: python3 -c "import pdfplumber; ...');
      console.log('');
      console.log('  # Depois converta para JSON:');
      console.log('  node scripts/pdf-to-json.cjs --text /tmp/resultado.txt /tmp/resultado.json');
      console.log('');
      console.log('  # Ou direto (se pdftotext estiver instalado):');
      console.log('  node scripts/pdf-to-json.cjs arquivo.pdf /tmp/resultado.json');
      process.exit(1);
    }
    
    // Try pdftotext
    const { execSync } = require('child_process');
    textFile = '/tmp/_pdf_extract_temp.txt';
    try {
      execSync(`pdftotext -layout "${pdfFile}" "${textFile}"`, { stdio: 'pipe' });
      console.log(`📄 Extraído com pdftotext: ${pdfFile}`);
    } catch (e) {
      console.error('❌ pdftotext não encontrado. Instale com:');
      console.error('   sudo apt install poppler-utils');
      console.error('');
      console.error('   Ou extraia manualmente:');
      console.error(`   pdftotext -layout "${pdfFile}" /tmp/resultado.txt`);
      console.error(`   node scripts/pdf-to-json.cjs --text /tmp/resultado.txt ${outFile}`);
      process.exit(1);
    }
  }
  
  const text = fs.readFileSync(textFile, 'utf8');
  console.log(`   ${text.split('\n').length} linhas de texto`);
  
  const results = parseResults(text);
  console.log(`\n✅ ${results.length} atletas extraídos`);
  
  if (results.length > 0) {
    console.log(`   Primeiro: ${results[0].nome} — ${results[0].tempo}`);
    console.log(`   Último: ${results.at(-1).nome} — ${results.at(-1).tempo}`);
  }
  
  fs.writeFileSync(outFile, JSON.stringify(results));
  console.log(`\n💾 Salvo em: ${outFile}`);
  console.log(`\n📌 Para importar:`);
  console.log(`   DATABASE_URL="..." node scripts/import-pdf-result.cjs ${outFile} "NOME" "Cidade" "UF" "2026-01-01" "10K"`);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
