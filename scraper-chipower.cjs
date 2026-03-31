#!/usr/bin/env node
/**
 * REGENI — ChipPower/Wiclax Universal Scraper
 * 
 * Parses .clax XML files from chipower.com.br and imports results into REGENI.
 * 
 * Usage:
 *   node scraper-chipower.js                    # List all available events
 *   node scraper-chipower.js --list             # List all available events
 *   node scraper-chipower.js --event URL        # Import a single event
 *   node scraper-chipower.js --all              # Import ALL events
 *   node scraper-chipower.js --event URL --dry  # Preview without importing
 * 
 * Examples:
 *   node scraper-chipower.js --event "eventos/2024/MONTESSORI-RUN/CORRIDA.clax"
 *   node scraper-chipower.js --all --dry
 */

const https = require('https');
const http = require('http');
const { XMLParser } = require('fast-xml-parser');

// ============ CONFIG ============
const CHIPOWER_BASE = 'https://www.chipower.com.br/resultados/';
const CHIPOWER_EVENTS_PAGE = 'https://www.chipower.com.br/resultados-eventos';
const REGENI_API = process.env.REGENI_API || 'https://web-production-990e7.up.railway.app';
const DRY_RUN = process.argv.includes('--dry');
// ================================

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'REGENI-Scraper/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({ raw: body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ============ LIST EVENTS ============
async function listEvents() {
  console.log('📡 Fetching event list from ChipPower...\n');
  const html = await fetch(CHIPOWER_EVENTS_PAGE);
  
  // Extract list_eventos JSON array from page
  const match = html.match(/var\s+list_eventos\s*=\s*(\[[\s\S]*?\]);\s*\n/);
  if (!match) {
    // Fallback: extract clax URLs
    const urls = [...html.matchAll(/g-live\.html\?f=([^"\\]*(?:\\.[^"\\]*)*)/g)]
      .map(m => m[1].replace(/\\\//g, '/').replace(/\\u00c7/g, 'Ç').replace(/\\u00c3/g, 'Ã').replace(/\\u00da/g, 'Ú').replace(/\\u00fa/g, 'ú'));
    return urls.map(url => ({ claxUrl: url, name: url.split('/').slice(-2, -1)[0].replace(/-/g, ' ') }));
  }
  
  try {
    const eventos = JSON.parse(match[1].replace(/'/g, '"'));
    return eventos.map(e => ({
      name: e.nome || 'Unknown',
      city: e.cidade || '',
      date: e.data || '',
      claxUrl: extractClaxUrl(e),
      links: e.link || {}
    }));
  } catch {
    // Fallback
    const urls = [...html.matchAll(/g-live\.html\?f=([^"\\]*(?:\\.[^"\\]*)*)/g)]
      .map(m => m[1].replace(/\\\//g, '/'));
    return urls.map(url => ({ claxUrl: url, name: url.split('/').slice(-2, -1)[0].replace(/-/g, ' ') }));
  }
}

function extractClaxUrl(evento) {
  if (evento.link) {
    for (const key of Object.keys(evento.link)) {
      const url = evento.link[key]?.url || '';
      const match = url.match(/g-live\.html\?f=(.*)/);
      if (match) return match[1].replace(/\\\//g, '/');
    }
  }
  return '';
}

// ============ PARSE CLAX ============
async function parseClax(claxPath) {
  const url = CHIPOWER_BASE + claxPath;
  console.log(`📡 Fetching: ${url}`);
  const xml = await fetch(url);
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false
  });
  
  const doc = parser.parse(xml);
  const epreuve = doc.Epreuve;
  
  if (!epreuve) {
    console.error('❌ Invalid CLAX file - no <Epreuve> root');
    return null;
  }
  
  // Event metadata
  const eventName = (epreuve.nom || '').trim();
  const eventDate = epreuve.dates || '';
  const organizer = epreuve.organisateur || '';
  
  // Extract city from organizer (usually "Organização: ... - CITY STATE")
  const cityMatch = organizer.match(/[-–]\s*([^-–]+?)\s*(?:BA|SE|PE|AL|CE|RN|PB|PI|MA|MG|SP|RJ|PR|RS|SC|GO|MT|MS|ES|DF|TO|RO|AC|AM|PA|AP|RR)\s*$/i);
  const city = cityMatch ? cityMatch[1].trim() : '';
  const stateMatch = organizer.match(/(BA|SE|PE|AL|CE|RN|PB|PI|MA|MG|SP|RJ|PR|RS|SC|GO|MT|MS|ES|DF|TO|RO|AC|AM|PA|AP|RR)\s*$/i);
  const state = stateMatch ? stateMatch[1].toUpperCase() : '';
  
  // Get engages (athletes) and results
  const etapes = epreuve.Etapes?.Etape;
  const etapeArr = Array.isArray(etapes) ? etapes : etapes ? [etapes] : [];
  
  let allEngages = [];
  let allResults = [];
  
  for (const etape of etapeArr) {
    const engages = etape.Engages?.E;
    const engArr = Array.isArray(engages) ? engages : engages ? [engages] : [];
    allEngages.push(...engArr);
    
    const resultats = etape.Resultats?.R;
    const resArr = Array.isArray(resultats) ? resultats : resultats ? [resultats] : [];
    allResults.push(...resArr);
  }
  
  // Build dorsal -> athlete map
  const athleteMap = {};
  for (const e of allEngages) {
    const dorsal = String(e.d);
    athleteMap[dorsal] = {
      name: (e.n || '').trim(),
      gender: (e.x || '').toUpperCase() === 'F' ? 'F' : 'M',
      yearBorn: parseInt(e.a) || null,
      age: e.a ? (new Date().getFullYear() - parseInt(e.a)) : null,
      team: (e.c || '').trim() || null,
      modality: (e.p || '').trim(),
      // ip1 often has the distance info
      distance: (e.ip1 || e.p || '').trim(),
    };
  }
  
  // Build dorsal -> result map
  const resultMap = {};
  for (const r of allResults) {
    const dorsal = String(r.d);
    resultMap[dorsal] = {
      time: parseTime(r.t),        // tempo bruto (chip-to-chip)
      timeReal: parseTime(r.re),   // tempo real (gun time adjusted)
      avgSpeed: parseFloat(r.m) || null,
      gap: r.g || null,
    };
  }
  
  // Merge athletes + results
  const merged = [];
  for (const [dorsal, athlete] of Object.entries(athleteMap)) {
    const result = resultMap[dorsal];
    if (!result) continue; // No finish time = DNF
    if (athlete.modality.toUpperCase().includes("DESCLASS")) continue; // Desclassificado
    
    merged.push({
      dorsal: parseInt(dorsal),
      name: athlete.name,
      gender: athlete.gender,
      age: athlete.age,
      yearBorn: athlete.yearBorn,
      team: athlete.team,
      modality: athlete.modality,
      distance: normalizeDistance(athlete.distance),
      time: result.timeReal || result.time,
      timeChip: result.time,
      avgSpeed: result.avgSpeed,
    });
  }
  
  // Group by distance/modality
  const distances = [...new Set(merged.map(r => r.distance))].filter(d => d && d.toUpperCase() !== 'TROCA');
  
  // Sort each distance group by time
  const grouped = {};
  for (const dist of distances) {
    grouped[dist] = merged
      .filter(r => r.distance === dist)
      .sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time))
      .map((r, i) => ({ ...r, overallRank: i + 1 }));
  }
  
  return {
    event: {
      name: eventName,
      date: eventDate,
      city,
      state,
      organizer,
      source: 'chipower',
      sourceUrl: url,
    },
    distances,
    grouped,
    totalAthletes: allEngages.length,
    totalFinishers: merged.length,
  };
}

// ============ TIME HELPERS ============
function parseTime(raw) {
  if (!raw) return null;
  // Format: "00h12'28,22" → "00:12:28"
  const m = raw.match(/(\d+)h(\d+)'(\d+)/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${m[3].padStart(2, '0')}`;
  // Try HH:MM:SS
  const m2 = raw.match(/(\d+):(\d+):(\d+)/);
  if (m2) return raw;
  return raw;
}

function timeToSeconds(time) {
  if (!time) return 999999;
  const parts = time.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 999999;
}

function normalizeDistance(raw) {
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/\s+/g, '');
  if (lower.includes('42k') || lower.includes('maratona')) return '42km';
  if (lower.includes('21k') || lower.includes('meia')) return '21km';
  if (lower.includes('15k')) return '15km';
  if (lower.includes('10k')) return '10km';
  if (lower.includes('7') || lower.includes('8k')) return raw.match(/[\d.]+/)?.[0] + 'km';
  if (lower.includes('5k')) return '5km';
  if (lower.includes('3k')) return '3km';
  if (lower.includes('1k') || lower.includes('kids')) return '1km';
  // Try to extract number
  const num = raw.match(/([\d.]+)\s*k/i);
  if (num) return num[1] + 'km';
  return raw;
}

function calcPace(time, distKm) {
  if (!time || !distKm) return '';
  const secs = timeToSeconds(time);
  const km = parseFloat(distKm);
  if (!km || km === 0) return '';
  const paceSec = secs / km;
  const min = Math.floor(paceSec / 60);
  const sec = Math.round(paceSec % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

// ============ IMPORT TO REGENI ============
async function importToRegeni(parsed) {
  const { event, grouped, distances } = parsed;
  
  console.log(`\n🏁 ${event.name}`);
  console.log(`   📍 ${event.city} ${event.state}`);
  console.log(`   📅 ${event.date}`);
  console.log(`   👥 ${parsed.totalFinishers}/${parsed.totalAthletes} finishers`);
  console.log(`   🏃 Distances: ${distances.join(', ')}`);
  
  if (DRY_RUN) {
    console.log('\n   [DRY RUN] Preview of first 5 per distance:');
    for (const [dist, results] of Object.entries(grouped)) {
      console.log(`\n   📏 ${dist} (${results.length} finishers):`);
      const distKm = parseFloat(dist) || 0;
      results.slice(0, 5).forEach(r => {
        const pace = calcPace(r.time, distKm);
        console.log(`     ${String(r.overallRank).padStart(3)}. ${r.name.padEnd(35)} ${r.gender} ${r.time || '---'}  ${pace ? pace + '/km' : ''}`);
      });
      if (results.length > 5) console.log(`     ... +${results.length - 5} more`);
    }
    return { success: true, dry: true };
  }
  
  // Find existing race or create new
  const existing = await fetch(`${REGENI_API}/races`).then(r => JSON.parse(r)).catch(() => []);
  const searchName = event.name.trim().substring(0, 15).toUpperCase();
  let found = existing.find(r => r.name && r.name.toUpperCase().includes(searchName));
  
  if (found) {
    console.log(`   Found existing: ${found.id} (${found.name})`);
    return importResults(found.id, grouped);
  }
  
  // Create via organizer/submit
  console.log(`   Creating race: ${event.name}`);
  const raceRes = await postJSON(`${REGENI_API}/organizer/submit`, {
    name: "REGENI Scraper",
    email: "scraper@regeni.com",
    eventName: event.name.trim(),
    eventCity: event.city || "NE",
    eventState: event.state || "BR",
    eventDate: parseEventDate(event.date),
    distances: distances.join(","),
    plan: "free"
  });
  
  if (raceRes?.success) {
    // Find the newly created race
    await new Promise(r => setTimeout(r, 1000));
    const updated = await fetch(`${REGENI_API}/races`).then(r => JSON.parse(r)).catch(() => []);
    found = updated.find(r => r.name && r.name.toUpperCase().includes(searchName));
    if (found) {
      console.log(`   Race created: ${found.id}`);
      return importResults(found.id, grouped);
    }
  }
  
  console.error("   Could not create race:", JSON.stringify(raceRes).substring(0, 200));
  return { success: false, error: "Race creation failed" };
}

async function importResults(raceId, grouped) {
  let totalImported = 0;
  let totalErrors = 0;
  
  for (const [dist, results] of Object.entries(grouped)) {
    const distKm = parseFloat(dist) || 0;
    console.log(`\n   📏 Importing ${dist}: ${results.length} results...`);
    
    const csvResults = results.map(r => ({
      overallRank: r.overallRank,
      name: r.name,
      gender: r.gender,
      age: r.age || 0,
      city: '',
      state: '',
      time: r.time,
      pace: calcPace(r.time, distKm),
      ageGroup: getAgeGroup(r.age),
      genderRank: 0,
      ageGroupRank: 0,
    }));
    
    const res = await postJSON(`${REGENI_API}/scraper/import`, {
      raceId,
      distance: dist,
      results: csvResults,
    });
    
    if (res?.success) {
      console.log(`   ✅ ${dist}: ${res.inseridos} imported, ${res.erros} errors`);
      totalImported += (res.inseridos || 0);
      totalErrors += (res.erros || 0);
    } else {
      console.error(`   ❌ ${dist}: Import failed -`, JSON.stringify(res).substring(0, 200));
      totalErrors += results.length;
    }
  }
  
  return { success: true, imported: totalImported, errors: totalErrors };
}

function getAgeGroup(age) {
  if (!age || age < 0 || age > 120) return 'Geral';
  if (age < 20) return 'Sub-20';
  if (age < 30) return '20-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  if (age < 70) return '60-69';
  return '70+';
}

function parseEventDate(dateStr) {
  // "domingo, 29 de março de 2026" → "2026-03-29"
  const months = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
    'abril': '04', 'maio': '05', 'junho': '06', 'julho': '07',
    'agosto': '08', 'setembro': '09', 'outubro': '10',
    'novembro': '11', 'dezembro': '12'
  };
  const m = dateStr?.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (m) {
    const month = months[m[2].toLowerCase()] || '01';
    return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
  }
  return new Date().toISOString().split('T')[0];
}

// ============ MAIN ============
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--list') || args.length === 0) {
    const events = await listEvents();
    console.log(`\n🏆 ${events.length} events found on ChipPower:\n`);
    events.forEach((e, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${(e.name || '').padEnd(45)} ${e.claxUrl}`);
    });
    console.log(`\nTo import: node scraper-chipower.js --event "CLAX_PATH" --dry`);
    console.log(`To import all: node scraper-chipower.js --all --dry`);
    return;
  }
  
  if (args.includes('--event')) {
    const idx = args.indexOf('--event');
    const claxPath = args[idx + 1];
    if (!claxPath) { console.error('❌ Provide clax path after --event'); return; }
    
    const parsed = await parseClax(claxPath);
    if (parsed) await importToRegeni(parsed);
    return;
  }
  
  if (args.includes('--all')) {
    const events = await listEvents();
    console.log(`\n🚀 Importing ${events.length} events...\n`);
    
    let totalImported = 0;
    let totalErrors = 0;
    let success = 0;
    
    for (const event of events) {
      if (!event.claxUrl) {
        console.log(`⏭️  Skipping ${event.name} (no clax URL)`);
        continue;
      }
      
      try {
        const parsed = await parseClax(event.claxUrl);
        if (parsed) {
          const res = await importToRegeni(parsed);
          if (res?.success) {
            success++;
            totalImported += (res.imported || 0);
            totalErrors += (res.errors || 0);
          }
        }
      } catch (e) {
        console.error(`❌ Error processing ${event.name}: ${e.message}`);
        totalErrors++;
      }
      
      // Rate limit: wait 1s between events
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎉 IMPORT COMPLETE`);
    console.log(`   ✅ ${success} events processed`);
    console.log(`   👥 ${totalImported} athletes imported`);
    console.log(`   ❌ ${totalErrors} errors`);
    return;
  }
  
  console.log('Usage:');
  console.log('  node scraper-chipower.js --list');
  console.log('  node scraper-chipower.js --event "eventos/2024/MONTESSORI-RUN/CORRIDA.clax" --dry');
  console.log('  node scraper-chipower.js --all --dry');
}

main().catch(e => { console.error('💥 Fatal:', e.message); process.exit(1); });
