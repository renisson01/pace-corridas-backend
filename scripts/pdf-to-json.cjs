#!/usr/bin/env node
/**
 * REGENI — Converte PDF de resultado de corrida para JSON
 * Usa pdfjs-dist para extrair texto
 * 
 * USO:
 *   node scripts/pdf-to-json.cjs <pdf_file> [output.json]
 * 
 * Depois importa com:
 *   DATABASE_URL=... node scripts/import-pdf-result.cjs output.json "NOME" "Cidade" "UF" "2026-01-01" "10K"
 */
const fs = require('fs');
const path = require('path');

async function extractText(pdfPath) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  
  let allText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines = [];
    let lastY = null;
    let currentLine = '';
    
    for (const item of content.items) {
      if (item.str === undefined) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      currentLine += item.str + ' ';
      lastY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    allText += lines.join('\n') + '\n';
  }
  return allText;
}

function parseResults(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  
  for (const line of lines) {
    // Skip headers/footers
    if (/^Coloc|^Página|^Relatório|CORRIDA.*Relatório|CORRIDA.*Masculino|CORRIDA.*Feminino/i.test(line)) continue;
    
    // TBH format: pos num name gender age ageGroup clFx [equipe] tempo [liquido]
    // Example: "1 25752 ALEQUESSANDRO PAULA DA SILVA M 38 M3539 - 00:34:03 00:33:59"
    const m = line.match(/^(\d+)\s+(\d+)\s+(.+?)\s+(M|F)\s+(\d+)\s+([FM]\d{4})\s+(.+?)\s+(\d{2}:\d{2}:\d{2})\s*(\d{2}:\d{2}:\d{2})?$/);
    if (!m) continue;
    
    const pos = parseInt(m[1]);
    const nome = m[3].replace(/["\u201C\u201D]/g, '').trim().toUpperCase();
    const genero = m[4];
    const idade = parseInt(m[5]);
    const faixa = m[6];
    const middle = m[7].trim(); // Could be clFx + equipe or just clFx
    const tempo1 = m[8];
    const tempo2 = m[9];
    const tempo = tempo2 || tempo1; // Prefer "Liquido" time
    
    if (!nome || nome.length < 2) continue;
    if (tempo === '00:00:00' || tempo < '00:01:00') continue;
    
    // Extract equipe from middle part
    let equipe = '';
    const middleParts = middle.split(/\s+/);
    // First part is usually Cl.Fx (number or dash), rest is equipe
    if (middleParts.length > 1) {
      const clFx = middleParts[0];
      if (/^[\d-]+$/.test(clFx)) {
        equipe = middleParts.slice(1).join(' ').trim();
      }
    } else if (!/^[\d-]+$/.test(middle)) {
      equipe = middle;
    }
    
    // Clean equipe
    const skipEquipes = ['INDIVIDUAL', 'SEPARADO', 'SEPARADA', 'RETIRADA'];
    for (const skip of skipEquipes) {
      equipe = equipe.replace(new RegExp(`\\s*${skip}.*`, 'i'), '').trim();
    }
    if (equipe === '-' || equipe.length < 2) equipe = '';
    
    results.push({ pos, nome, idade, faixa, genero, equipe, tempo });
  }
  
  return results;
}

async function main() {
  const pdfFile = process.argv[2];
  const outFile = process.argv[3] || pdfFile.replace(/\.pdf$/i, '.json');
  
  if (!pdfFile) {
    console.log('USO: node pdf-to-json.cjs <arquivo.pdf> [saida.json]');
    process.exit(1);
  }
  
  console.log(`📄 Extraindo texto de: ${pdfFile}`);
  const text = await extractText(pdfFile);
  console.log(`   ${text.split('\n').length} linhas de texto`);
  
  const results = parseResults(text);
  console.log(`\n✅ ${results.length} atletas extraídos`);
  
  if (results.length > 0) {
    console.log(`   Primeiro: ${results[0].nome} — ${results[0].tempo}`);
    console.log(`   Último: ${results.at(-1).nome} — ${results.at(-1).tempo}`);
    
    const genders = {};
    for (const r of results) genders[r.genero] = (genders[r.genero] || 0) + 1;
    console.log(`   Gênero:`, genders);
  }
  
  fs.writeFileSync(outFile, JSON.stringify(results));
  console.log(`\n💾 Salvo em: ${outFile}`);
  console.log(`\n📌 Para importar:`);
  console.log(`   DATABASE_URL="..." node scripts/import-pdf-result.cjs ${outFile} "NOME DA CORRIDA" "Cidade" "UF" "2026-01-01" "10K"`);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
