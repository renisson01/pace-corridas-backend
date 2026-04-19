#!/bin/bash
# REGENI — Coleta contínua de resultados
# Instalar: (crontab -l 2>/dev/null; echo "0 3 * * * bash ~/pace-corridas-backend/scripts/cron-scrapers.sh") | crontab -
# Roda todo dia às 3h da manhã

LOG=/tmp/regeni-cron-scrapers.log
DIR=~/pace-corridas-backend

cd "$DIR" || { echo "$(date) FATAL: diretório não encontrado" >> "$LOG"; exit 1; }
source .env 2>/dev/null
export DATABASE_URL

echo "" >> "$LOG"
echo "$(date) ========================================" >> "$LOG"
echo "$(date) === INÍCIO COLETA CONTÍNUA REGENI ===" >> "$LOG"
echo "$(date) ========================================" >> "$LOG"

run_scraper() {
  local name="$1"
  local script="$2"
  local timeout_s="$3"
  if [ ! -f "scripts/$script" ]; then
    echo "$(date) [SKIP] $name — scripts/$script não encontrado" >> "$LOG"
    return
  fi
  echo "$(date) [START] $name" >> "$LOG"
  timeout "$timeout_s" node scripts/"$script" >> "$LOG" 2>&1
  local code=$?
  if [ $code -eq 124 ]; then
    echo "$(date) [TIMEOUT] $name — excedeu ${timeout_s}s" >> "$LOG"
  else
    echo "$(date) [DONE] $name — exit=$code" >> "$LOG"
  fi
}

# ─── Scrapers em ordem de prioridade ─────────────────────────────────────────

# ChipTiming (maior fonte — 2.4M resultados, API REST)
run_scraper "ChipTiming-Resultado"  scraper-chiptiming-resultado.cjs  1800

# SportsChrono (CLAX — SP/Sudeste)
run_scraper "SportsChrono"          scraper-sportschrono.cjs          1800

# CronusTec (CLAX — Nordeste)
run_scraper "CronusTec"             scraper-cronustec.cjs             1200

# TimeCrono (CLAX — PE/Nordeste)
run_scraper "TimeCrono"             scraper-timecrono.cjs             1200

# ACrono (CLAX)
run_scraper "ACrono"                scraper-acrono.cjs                1200

# TriChip (CLAX — rodando manualmente agora, mantido no cron)
run_scraper "TriChip"               scraper-trichip.cjs               1800

# SMCrono (CLAX — SC/Sul)
run_scraper "SMCrono"               scraper-smcrono.cjs               1200

# RaceZone Universal (MyCrono + SportsChrono + RaceMS — JSON puro)
run_scraper "RaceZone"              scraper-racezone.cjs              1800

# CronosChip (CLAX)
run_scraper "CronosChip"            scraper-cronoschip.cjs            1200

# ChipBrasil (Puppeteer + CLAX — mais lento)
run_scraper "ChipBrasil"            scraper-chipbrasil.cjs            2400

# GlobalCronometragem (Cheerio)
run_scraper "GlobalCrono"           scraper-globalcronometragem.cjs   1200

# Central de Resultados (v3)
run_scraper "Central"               scraper-central-v3.cjs            1200

# ─── Recalcular cache de ranking após coleta ─────────────────────────────────
echo "$(date) [START] CacheRanking" >> "$LOG"
node scripts/cache-ranking.cjs >> "$LOG" 2>&1
echo "$(date) [DONE] CacheRanking" >> "$LOG"

echo "$(date) === FIM COLETA ===" >> "$LOG"

# Manter log com no máximo 5000 linhas (evitar disco cheio)
tail -n 5000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
