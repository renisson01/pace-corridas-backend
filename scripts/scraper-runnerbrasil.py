#!/usr/bin/env python3
"""
REGENI — RunnerBrasil Scraper
Lists events from runnerbrasil.com.br (2014-2026), downloads result PDFs, extracts tables, imports to PostgreSQL.

Usage:
  python3 scraper-runnerbrasil.py --list 2026
  python3 scraper-runnerbrasil.py --year 2026 --dry
  python3 scraper-runnerbrasil.py --all
"""

import re, sys, os, json, time, urllib.request, ssl
from html.parser import HTMLParser

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway')
BASE = 'https://www.runnerbrasil.com.br'
DRY = '--dry' in sys.argv

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'REGENI/1.0'})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        return r.read().decode('utf-8', errors='replace')

def download(url, path):
    req = urllib.request.Request(url, headers={'User-Agent': 'REGENI/1.0'})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        with open(path, 'wb') as f:
            f.write(r.read())

def list_events(year):
    html = fetch(f'{BASE}/Views/Runner/Runner_Resultados.aspx?idAno={year}')
    events = []
    for m in re.finditer(r'Runner_ResultadosDetalhe\.aspx\?idEvento=(\d+)(?:&amp;|&)idAno=(\d+)', html):
        eid, eyr = m.group(1), m.group(2)
        events.append({'id': eid, 'year': eyr})
    
    # Extract names, dates, locations from the HTML
    blocks = re.findall(r'idEvento=(\d+).*?(\d{2}/\d{2}/\d{4})\s*</td>.*?font-weight:bold; text-align:left">(.*?)</td>.*?font-weight:bold; text-align:left">(.*?)</td>', html, re.DOTALL)
    event_map = {}
    for eid, date, name, location in blocks:
        name = re.sub(r'<[^>]+>', '', name).strip()
        location = re.sub(r'<[^>]+>', '', location).strip()
        event_map[eid] = {'date': date, 'name': name, 'location': location}
    
    for ev in events:
        info = event_map.get(ev['id'], {})
        ev['name'] = info.get('name', '')
        ev['date'] = info.get('date', '')
        ev['location'] = info.get('location', '')
    
    return events

def get_pdf_links(event_id, year):
    html = fetch(f'{BASE}/Views/Runner/Runner_ResultadosDetalhe.aspx?idEvento={event_id}&idAno={year}')
    pdfs = []
    # Match .pdf AND .txt result files
    for m in re.finditer(r'href="(/[Cc]alendario/[^"]+\.(pdf|txt))"', html, re.I):
        url = BASE + m.group(1)
        label_m = re.search(r'text-align:center[^>]*>([^<]+)', html[m.end():m.end()+200])
        label = label_m.group(1).strip() if label_m else m.group(1).split('/')[-1]
        pdfs.append({'url': url, 'label': label, 'type': m.group(2).lower()})
    
    # Also get event name and location
    name_m = re.search(r'label_Nome">([^<]+)', html)
    date_m = re.search(r'label_Dt_Evento">Data:\s*([^<]+)', html)
    local_m = re.search(r'label_Local">Local:\s*([^<]+)', html)
    dist_m = re.search(r'label_Percurso">Percurso:\s*([^<]+)', html)
    
    return {
        'name': name_m.group(1).strip() if name_m else '',
        'date': date_m.group(1).strip() if date_m else '',
        'location': local_m.group(1).strip() if local_m else '',
        'distances': dist_m.group(1).strip() if dist_m else '',
        'pdfs': pdfs
    }

def parse_txt(content):
    """Parse RunnerBrasil TXT result file.
    Format: Class. Num  Nome                    ClassCateg  Tempo_Liq  Tempo_Bruto  Equipe
    Example:  1   99  ELIAS RODRIGUES BASTOS   0  GM4044   00:23:23   00:23:23  SERGEL SPORTS
    """
    results = []
    for line in content.splitlines():
        # Match lines starting with a rank number
        m = re.match(r'^\s{0,5}(\d{1,4})\s+\d+\s+([A-ZÁÉÍÓÚÀÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÀÂÊÎÔÛÃÕÇ\s\.\-]+?)\s{2,}\d*\s+([A-Z]{1,3}\d{2,4})\s+(\d{2}:\d{2}:\d{2})\s+(\d{2}:\d{2}:\d{2})', line)
        if m:
            pos = int(m.group(1))
            nome = m.group(2).strip()
            faixa = m.group(3).strip()
            tempo = m.group(4)  # liquid time
            if len(nome) < 3:
                continue
            gender = 'F' if faixa.startswith('GF') or faixa.startswith('CF') or 'F' == faixa[1:2] else 'M'
            results.append({'pos': pos, 'nome': nome, 'gender': gender, 'faixa': faixa, 'equipe': '', 'tempo': tempo})
    return results

def parse_pdf(filepath):
    try:
        import pdfplumber
    except ImportError:
        print('  ERROR: pip3 install pdfplumber')
        return []
    
    results = []
    try:
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text:
                    continue
                lines = text.split('\n')
                for line in lines:
                    # Match: number name [category] [team] time time
                    # Pattern: starts with number, has HH:MM:SS times
                    m = re.match(r'^\s*(\d{1,4})\s+\d+\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.]+?)\s+\d+\s+(\w+)\s+(.*?)\s+(\d{2}:\d{2}:\d{2})\s+(\d{2}:\d{2}:\d{2})\s*$', line)
                    if m:
                        pos = int(m.group(1))
                        nome = m.group(2).strip()
                        faixa = m.group(3).strip()
                        equipe = m.group(4).strip()
                        tempo_bruto = m.group(5)
                        tempo_liquido = m.group(6)
                        
                        if len(nome) < 3:
                            continue
                        
                        # Detect gender from category
                        gender = 'F' if 'F' in faixa[:3] or 'FEM' in faixa.upper() else 'M'
                        
                        results.append({
                            'pos': pos,
                            'nome': nome,
                            'gender': gender,
                            'faixa': faixa,
                            'equipe': equipe,
                            'tempo': tempo_liquido or tempo_bruto,
                        })
                    else:
                        # Try simpler pattern
                        m2 = re.match(r'^\s*(\d{1,4})\s+\d+\s+(.+?)\s+(\d{2}:\d{2}:\d{2})\s+(\d{2}:\d{2}:\d{2})\s*$', line)
                        if m2:
                            pos = int(m2.group(1))
                            nome_raw = m2.group(2).strip()
                            tempo = m2.group(4) or m2.group(3)
                            
                            # Split name from other fields
                            parts = nome_raw.split()
                            nome_parts = []
                            for p in parts:
                                if re.match(r'^[A-ZÀ-Ú]', p) and not re.match(r'^\d', p):
                                    nome_parts.append(p)
                                else:
                                    break
                            nome = ' '.join(nome_parts) if nome_parts else nome_raw
                            
                            if len(nome) >= 3:
                                results.append({
                                    'pos': pos,
                                    'nome': nome.upper(),
                                    'gender': 'M',
                                    'faixa': '',
                                    'equipe': '',
                                    'tempo': tempo,
                                })
    except Exception as e:
        print(f'  PDF parse error: {e}')
    
    return results

def import_to_db(event_info, all_results, year):
    if not all_results or DRY:
        return 0
    
    try:
        import psycopg2
    except ImportError:
        os.system('pip3 install psycopg2-binary --break-system-packages 2>/dev/null')
        import psycopg2
    
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # Create race
    ename = event_info['name'].replace("'", "''")[:200]
    loc = event_info['location']
    parts = loc.split(' - ')
    city = parts[0].strip().replace("'", "''")[:100] if parts else ''
    state = parts[-1].strip()[:2].upper() if len(parts) > 1 else 'SP'
    date_str = event_info['date']
    # Parse DD/MM/YYYY
    dm = re.match(r'(\d{2})/(\d{2})/(\d{4})', date_str)
    iso_date = f'{dm.group(3)}-{dm.group(2)}-{dm.group(1)}' if dm else f'{year}-01-01'
    
    race_id = f'rb_{event_info.get("event_id", "0")}_{year}'
    
    try:
        cur.execute(f"""INSERT INTO "Race"(id,name,date,city,state,distances,organizer,status,"createdAt","updatedAt") 
                       VALUES(%s,%s,%s,%s,%s,%s,'RunnerBrasil','completed',NOW(),NOW()) ON CONFLICT(id) DO NOTHING""",
                    (race_id, event_info['name'][:200], iso_date, city, state, event_info.get('distances', '')[:50]))
        conn.commit()
    except:
        conn.rollback()
    
    ok = 0
    for r in all_results:
        try:
            nome_norm = re.sub(r'[^a-zA-ZÀ-ú0-9]', '', r['nome']).lower()[:40]
            aid = f'rb_{nome_norm}'
            cur.execute("""INSERT INTO "Athlete"(id,name,gender,age,state,"totalRaces","totalPoints","createdAt","updatedAt") 
                          VALUES(%s,%s,%s,0,%s,1,0,NOW(),NOW()) ON CONFLICT(id) DO NOTHING""",
                       (aid, r['nome'][:200], r['gender'], state))
            
            rid = f'rb_{race_id}_{aid}'[:80]
            dist = r.get('distance', '')[:20]
            cur.execute("""INSERT INTO "Result"(id,"raceId","athleteId",time,pace,"overallRank","genderRank","ageGroup",distance,points,"createdAt") 
                          VALUES(%s,%s,%s,%s,'',%s,0,%s,%s,0,NOW()) ON CONFLICT DO NOTHING""",
                       (rid, race_id, aid, r['tempo'][:8], r['pos'], r.get('faixa', '')[:50], dist))
            ok += 1
        except:
            conn.rollback()
            continue
    
    conn.commit()
    cur.close()
    conn.close()
    return ok

def process_year(year):
    print(f'\n📅 Year {year}...')
    events = list_events(year)
    print(f'  {len(events)} events found')
    
    total_imported = 0
    for i, ev in enumerate(events):
        print(f'\n  [{i+1}/{len(events)}] {ev["name"][:50]} ({ev["location"]})')
        
        try:
            info = get_pdf_links(ev['id'], year)
            info['event_id'] = ev['id']
            
            if not info['pdfs']:
                print('    No results found')
                continue

            ftype = 'TXT' if any(p.get('type') == 'txt' for p in info['pdfs']) else 'PDF'
            print(f'    {len(info["pdfs"])} {ftype}s: {info["distances"]}')

            all_results = []
            for pdf_info in info['pdfs']:
                pdf_url = pdf_info['url']
                label = pdf_info['label']
                ftype_item = pdf_info.get('type', 'pdf')

                try:
                    if ftype_item == 'txt':
                        results = parse_txt(fetch(pdf_url))
                    else:
                        tmp_path = f'/tmp/rb_{ev["id"]}_{len(all_results)}.pdf'
                        download(pdf_url, tmp_path)
                        results = parse_pdf(tmp_path)
                        try: os.remove(tmp_path)
                        except: pass

                    # Detect distance and gender from label/filename
                    dist = ''
                    dm = re.search(r'(\d+)\s*[Kk]', label)
                    if dm:
                        dist = dm.group(1) + 'km'

                    for r in results:
                        r['distance'] = dist
                        if any(x in label.upper() for x in ['_GF', '_CF', 'FEMIN', 'FEM']):
                            r['gender'] = 'F'

                    all_results.extend(results)
                    print(f'    📄 {label}: {len(results)} athletes')

                except Exception as e:
                    print(f'    ❌ Error: {e}')
                
                time.sleep(0.3)
            
            if all_results:
                imported = import_to_db(info, all_results, year)
                total_imported += imported
                print(f'    ✅ Total: {len(all_results)} parsed, {imported} imported')
            
        except Exception as e:
            print(f'    ❌ Error: {e}')
        
        time.sleep(0.5)
    
    return total_imported

def main():
    args = sys.argv[1:]
    
    if '--list' in args:
        year = args[args.index('--list') + 1] if len(args) > args.index('--list') + 1 else '2026'
        events = list_events(year)
        print(f'\n🏆 {len(events)} events in {year}:\n')
        for i, ev in enumerate(events):
            print(f'  {i+1}. {ev["name"][:50].ljust(50)} {ev["date"]:>12} {ev["location"]}')
        return
    
    if '--year' in args:
        year = args[args.index('--year') + 1]
        total = process_year(year)
        print(f'\n🎉 Year {year}: {total} results imported')
        return
    
    if '--all' in args:
        years = list(range(2026, 2013, -1))
        grand_total = 0
        for year in years:
            total = process_year(year)
            grand_total += total
            print(f'\n  Year {year} done: {total} imported (grand total: {grand_total})')
        print(f'\n{"="*50}')
        print(f'🎉 ALL DONE: {grand_total} results imported from {len(years)} years')
        return
    
    print('Usage:')
    print('  python3 scraper-runnerbrasil.py --list 2026')
    print('  python3 scraper-runnerbrasil.py --year 2026 [--dry]')
    print('  python3 scraper-runnerbrasil.py --all [--dry]')

if __name__ == '__main__':
    main()
