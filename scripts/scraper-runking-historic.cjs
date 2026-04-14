#!/usr/bin/env node
/**
 * REGENI — Scraper Runking/Chronomax HISTÓRICO
 * Usa lista de 444 eventos descobertos via Wayback Machine CDX API.
 *
 * Uso:
 *   node scripts/scraper-runking-historic.cjs               # todos os eventos
 *   node scripts/scraper-runking-historic.cjs --start 50    # a partir do 50
 *   node scripts/scraper-runking-historic.cjs --limit 20    # máximo 20 eventos
 *   node scripts/scraper-runking-historic.cjs --dry-run     # só lista, não importa
 *   node scripts/scraper-runking-historic.cjs --company o2-correbrasil  # só uma empresa
 */
const { Client } = require('pg');
const CryptoJS = require('crypto-js');
const https = require('https');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const DELAY = ms => new Promise(r => setTimeout(r, ms));
const PER_PAGE = 20;

const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY_RUN = args.includes('--dry-run');
const START = parseInt(getArg('--start') || '0');
const LIMIT = parseInt(getArg('--limit') || '9999');
const COMPANY_FILTER = getArg('--company') || null;

// ─── Lista completa de eventos (Wayback Machine CDX, 2025-04-13) ─────────────
const ALL_EVENTS = [
  ['/3a-eventos','maratona-de-niteroi-2024'],
  ['/5-oceans','corrida-granado-pink-sao-paulo-2025'],
  ['/5-oceans','corridinha-granado-bebe-sp-2025'],
  ['/Desafio%20Braves','mud-race-10-anos-2024'],
  ['/GRAAC','corrida-e-caminhada-graacc-barueri'],
  ['/GRAAC','corrida-graac-barueri-2024'],
  ['/JJS-Eventos','20-corrida-das-pontes-do-recife-drogasil'],
  ['/Speed','energisa-electric-run'],
  ['/a-tribuna','13-meia-maratona-tribuna-praia-grande-2025'],
  ['/a-tribuna','38-10k-tribuna-fm-2024'],
  ['/a-tribuna','5k-tribuna-2023'],
  ['/a-tribuna','5k-tribuna-2024'],
  ['/a-tribuna','5k-tribuna-2025'],
  ['/balax','20-run-2025'],
  ['/balax','corrida-da-virada-guaratuba'],
  ['/balax','iv-bike-and-run-series'],
  ['/bee-sports','corrida-ecologica'],
  ['/beta-sports','bimbo-global-race'],
  ['/beta-sports','bimbo-global-race-2023-rio-de-janeiro'],
  ['/beta-sports','bimbo-global-race-rj-2024'],
  ['/beta-sports','bimbo-global-race-rj-2025'],
  ['/beta-sports','bimbo-global-race-so-paulo-2023-'],
  ['/beta-sports','bimbo-global-race-sp-2024'],
  ['/beta-sports','bimbo-global-race-sp-2025'],
  ['/beta-sports','corrida-iluminada-de-natal-2023'],
  ['/beta-sports','corrida-iluminada-de-natal-2023-campos-do-jordo'],
  ['/beta-sports','hoka-speed-run-2023'],
  ['/beta-sports','hoka-speed-run-2024'],
  ['/beta-sports','hoka-speed-run-2025-rio-de-janeiro'],
  ['/beta-sports','hoka-speed-run-2025-salvador'],
  ['/beta-sports','hoka-speed-run-so-paulo-2023'],
  ['/beta-sports','maratona-fila'],
  ['/beta-sports','maratona-fila-2024'],
  ['/beta-sports','maratona-fila-2025'],
  ['/beta-sports','maratona-fila-so-paulo-2023'],
  ['/beta-sports','rebook-extra-mile-2023'],
  ['/beta-sports','rebook-extra-mile-2024'],
  ['/beta-sports','speed-run-sp'],
  ['/bex-eventos','-corrida-do-procon-vitria'],
  ['/bex-eventos','4-corrida-e-caminhada-procon-vitria'],
  ['/bex-eventos','corrida-zumbi-dos-palmares'],
  ['/bex-eventos','xv-corrida-zumbi-dos-palmares-2023'],
  ['/braves','desafio-braves-10-anos'],
  ['/braves','desafio-braves-mud-race-2025'],
  ['/bronkos-race','bronkos-race-2024-etapa-thor'],
  ['/chronomax','2-missionria-night-run-2024'],
  ['/chronomax','23-meia-maratona-de-toledo-sicredi-2024'],
  ['/chronomax','3-corrida-solidaria-rede-feminina-de-combate-ao-cancer-2024'],
  ['/chronomax','4-corrida-trimais-kids-2024'],
  ['/chronomax','40-corrida-cidade-de-aracaju'],
  ['/chronomax','a-caminho-da-longevidade'],
  ['/chronomax','circuito-de-corridas-fecam-etapa-4'],
  ['/chronomax','circuito-fecam-etapa-1'],
  ['/chronomax','corrida-chronomax-2025'],
  ['/chronomax','corrida-e-caminhada-contra-a-fome-rj'],
  ['/chronomax','corrida-granado-pink-sao-paulo-2025'],
  ['/chronomax','desafio-mortal-round-6k'],
  ['/chronomax','farmacias-sao-paulo-run-2024'],
  ['/chronomax','jmc-move-corrida-e-caminhada-jacobina-2025'],
  ['/chronomax','maratona-chronomax'],
  ['/chronomax','maratona-de-campo-grande-2024'],
  ['/chronomax','night-run-delas-2025'],
  ['/chronomax','noite-run-2025'],
  ['/chronomax','on-squadrace-2024-sao-paulo'],
  ['/chronomax','run-mda'],
  ['/chronomax','summit-2025'],
  ['/clube-dos-corredores-de-porto-alegre','30-corrida-pela-vida'],
  ['/clube-dos-corredores-de-porto-alegre','38-maratona-internacional-de-porto-alegre'],
  ['/clube-dos-corredores-de-porto-alegre','39-maratona-int-de-porto-alegre'],
  ['/clube-dos-corredores-de-porto-alegre','meia-maratoma-do-mercado-publico-2025-poa'],
  ['/clube-dos-corredores-de-porto-alegre','ttt-travessia-torres-tramandai'],
  ['/digitime','meia-maratona-de-flores'],
  ['/ea-run','assai_fortaleza-2024'],
  ['/ea-run','circuito-assai-50-anos-belem'],
  ['/ea-run','circuito-assai-50-anos-belo-horizonte'],
  ['/ea-run','circuito-assai-50-anos-fortaleza-2024'],
  ['/ea-run','circuito-assai-50-anos-rio-de-janeiro-2024'],
  ['/ea-run','circuito-assai-50-anos-sao-paulo-2024'],
  ['/ea-run','harry-potter-fun-run'],
  ['/ea-run','smart-fit-run-sao-paulo-2024'],
  ['/fidalgo-eventos','35-corrida-jose-de-oliveira-melo'],
  ['/fidalgo-eventos','festeja-run'],
  ['/forchip','21k-terra-da-luz'],
  ['/grupo-stc-eventos-ltda','desafios-21k-42k-maratona-int-de-floripa'],
  ['/grupo-stc-eventos-ltda','maratona-internacional-de-floripa'],
  ['/grupo-stc-eventos-ltda','maratona-internacional-de-floripa-2023'],
  ['/hp-cronometragem','corrida-compre-do-pequeno-braslia'],
  ['/hp-cronometragem','fluing-run-brasilia-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-aracaju-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-campo-grande-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-etapa-belo-horizonte-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-etapa-braslia-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-etapa-maceio-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-goiania-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-palmas-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-porto-alegre-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-salvador-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-sao-paulo-2024'],
  ['/ht-sports','circuito-de-corridas-caixa-vitoria-2024'],
  ['/ht-sports','corporate-run-2024-so-paulo'],
  ['/ht-sports','corporate-run-2025-sp'],
  ['/iguana-sports','athenas-run-faster-2023'],
  ['/iguana-sports','athenas-run-faster-2024'],
  ['/iguana-sports','athenas-run-faster-2025'],
  ['/iguana-sports','athenas-run-longer'],
  ['/iguana-sports','athenas-run-longer-2023'],
  ['/iguana-sports','athenas-run-longer-2024'],
  ['/iguana-sports','athenas-run-longer-2025'],
  ['/iguana-sports','athenas-run-stronger-2023'],
  ['/iguana-sports','athenas-run-stronger-2024'],
  ['/iguana-sports','bsb-city-half-marathon-2023'],
  ['/iguana-sports','greenv-run-the-bridge-2023'],
  ['/iguana-sports','greenv-run-the-bridge-2024'],
  ['/iguana-sports','on-rio-city-half-marathon-2024'],
  ['/iguana-sports','on-sp-city-marathon-2024'],
  ['/iguana-sports','on-sp-city-marathon-2025'],
  ['/iguana-sports','rio-city-half-marathon-2023'],
  ['/iguana-sports','score-sp-city'],
  ['/iguana-sports','seven-run-2023'],
  ['/iguana-sports','seven-run-2024'],
  ['/iguana-sports','seven-run-2025'],
  ['/iguana-sports','sp-city-marathon-2023'],
  ['/iguana-sports','venus-run-so-paulo-2023'],
  ['/iguana-sports','venus-run-sp-2023'],
  ['/iguana-sports','venus-womens-half-marathon-2024'],
  ['/iguana-sports','venus-womens-half-marathon-2025'],
  ['/iguana-sports','w21k-2023'],
  ['/iguana-sports','wrun-2023'],
  ['/kenya','6-corrida-da-guarda-municipal-de-pinhais'],
  ['/kenya','aciap-night-run-2025'],
  ['/kenya','aquatlhon-guaratuba'],
  ['/kenya','bike-and-run-series-etapa-guaratuba'],
  ['/kenya','corrida-de-aniversario-de-guaratuba-202504231645'],
  ['/kenya','corrida-pinfer-25-anos'],
  ['/kenya','infantaria-night-run-2025'],
  ['/kenya','iv-bike-and-run-series'],
  ['/kenya','operario-run-2025'],
  ['/kenya','xv-corrida-do-material-belico'],
  ['/kenya','xxi-corrida-do-artilheiro-2025'],
  ['/krono','1-run-nilton-lins'],
  ['/krono','treinao-do-pit'],
  ['/krono','treino-de-luxo-do-pit-duathlon'],
  ['/letape-brasil','la-vuelta-desafio-brasil'],
  ['/letape-brasil','letape-campos-do-jordo-2021'],
  ['/letape-brasil','letape-campos-do-jordo-2022'],
  ['/letape-brasil','letape-campos-do-jordo-2023'],
  ['/letape-brasil','letape-campos-do-jordo-2024'],
  ['/letape-brasil','letape-cunha'],
  ['/letape-brasil','letape-cunha-2023'],
  ['/letape-brasil','letape-cunha-2024'],
  ['/letape-brasil','letape-rio-de-janeiro-2021'],
  ['/letape-brasil','letape-rio-de-janeiro-2022'],
  ['/letape-brasil','letape-rio-de-janeiro-2023'],
  ['/letape-brasil','letape-rio-de-janeiro-2024'],
  ['/letape-brasil','ltape-rio-de-janeiro-santander-by-tour-de-france-2022'],
  ['/maria-de-lourdes-de-barros-servi%C3%A7os','corrida-do-vinho'],
  ['/neorace','circuito-all-running-1-etapa-2025'],
  ['/neorace','circuito-light-rio-antigo-lapa-2025'],
  ['/neorace','circuito-rio-antigo-porto-maravilha-2025'],
  ['/neorace','circuito-sesc-de-corridas-etapa-grussa-2025'],
  ['/neorace','corrida-de-natal-2025-musal'],
  ['/neorace','corrida-dos-professores-2025'],
  ['/neorace','corrida-e-caminhada-academia-h2o'],
  ['/neorace','corrida-granado-pink-2024'],
  ['/neorace','corrida-pennsula-2025'],
  ['/neorace','corrida-santos-dumont-2025'],
  ['/neorace','corrida-sest-senat-sg'],
  ['/neorace','corrida-time-brasil-2025'],
  ['/neorace','delas-mulheres-que-se-movem'],
  ['/neorace','granado-pink-rio-2025'],
  ['/neorace','meia-maratona-do-cristo-2025'],
  ['/neorace','rei-e-rainha-do-mar'],
  ['/neorace','rei-e-rainha-do-mar-joo-pessoa'],
  ['/neorace','star-run-2025'],
  ['/neorace','sun-race-2025'],
  ['/neorace','trackfield-exp-running-niteri-desafio-sade'],
  ['/neorace','vou-suar'],
  ['/neorace','xc-run-bzios-2025'],
  ['/neorace','xii-night-run-petrpolis-2025'],
  ['/noblu-sport','1-corrida-panobianco-em-prol-da-apae'],
  ['/noblu-sport','10-meia-maratona-pague-menos-campinas'],
  ['/noblu-sport','12-meia-maratona-de-campinas'],
  ['/noblu-sport','39-corrida-integracao-campinas-2024'],
  ['/noblu-sport','40-corrida-integracao-campinas'],
  ['/noblu-sport','5k-da-pam'],
  ['/noblu-sport','campinas-sunset-run-7k'],
  ['/noblu-sport','campinas-sunset-run-7k-2023'],
  ['/noblu-sport','corrida-vera-cruz-sp'],
  ['/noblu-sport','ville-sainte-anne-family-run'],
  ['/o2-correbrasil','24-meia-maratona-internacional-de-so-paulo-2024'],
  ['/o2-correbrasil','33-triathlon-internacional-de-santos'],
  ['/o2-correbrasil','42k-de-floripa'],
  ['/o2-correbrasil','7-corrida-e-caminhada-cidade-de-deus-bradesco'],
  ['/o2-correbrasil','blue-run-florianopolis-2024'],
  ['/o2-correbrasil','blue-run-joao-pessoa-2025'],
  ['/o2-correbrasil','blue-run-natal-2025'],
  ['/o2-correbrasil','blue-run-porto-alegre'],
  ['/o2-correbrasil','bota-pra-correr-salvador-2025'],
  ['/o2-correbrasil','bravus-fire-so-paulo-2024'],
  ['/o2-correbrasil','bravus-speed-2-so-paulo-2025'],
  ['/o2-correbrasil','bravus-speed-belo-horionte'],
  ['/o2-correbrasil','bravus-speed-rio-de-janeiro-2024'],
  ['/o2-correbrasil','bull-run-sp-2024'],
  ['/o2-correbrasil','circuito-banco-do-brasil-brasilia-2025'],
  ['/o2-correbrasil','circuito-banco-do-brasil-macapa-2025'],
  ['/o2-correbrasil','circuito-banco-do-brasil-natal-2024'],
  ['/o2-correbrasil','circuito-banco-do-brasil-porto-alegre-2025'],
  ['/o2-correbrasil','circuito-banco-do-brasil-rio-de-janeiro-2024'],
  ['/o2-correbrasil','circuito-banco-do-brasil-salvador-2024'],
  ['/o2-correbrasil','circuito-banco-do-brasil-sao-luis'],
  ['/o2-correbrasil','circuito-banco-do-brasil-sp'],
  ['/o2-correbrasil','circuito-biomas-teresina-2025'],
  ['/o2-correbrasil','circuito-caixa-biomas-manaus-2024'],
  ['/o2-correbrasil','circuito-das-estacoes-belo-horizonte'],
  ['/o2-correbrasil','circuito-das-estacoes-brasilia-2025'],
  ['/o2-correbrasil','circuito-das-estacoes-inverno-sp-2024'],
  ['/o2-correbrasil','circuito-das-estacoes-outono-fortaleza'],
  ['/o2-correbrasil','circuito-das-estacoes-outono-rj'],
  ['/o2-correbrasil','circuito-das-estacoes-outono-sp'],
  ['/o2-correbrasil','circuito-das-estacoes-porto-alegre-2025'],
  ['/o2-correbrasil','circuito-das-estacoes-primavera-fortaleza-2024'],
  ['/o2-correbrasil','circuito-das-estacoes-primavera-rio-de-janeiro-2024'],
  ['/o2-correbrasil','circuito-das-estacoes-verao-belo-horizonte-2025'],
  ['/o2-correbrasil','circuito-das-estacoes-verao-curitiba-2025'],
  ['/o2-correbrasil','circuito-das-estacoes-verao-fortaleza-2025'],
  ['/o2-correbrasil','circuito-das-estacoes-verao-jacobina-2025'],
  ['/o2-correbrasil','circuito-das-estacoes-verao-recife-2025'],
  ['/o2-correbrasil','circuito-das-estacoes-verao-rio-de-janeiro-2025'],
  ['/o2-correbrasil','circuito-das-estaes-inverno-brasilia-2024'],
  ['/o2-correbrasil','circuito-das-estaes-inverno-fortaleza-2024'],
  ['/o2-correbrasil','circuito-das-estaes-outono-recife-2024'],
  ['/o2-correbrasil','circuito-das-estaes-outono-salvador-2024'],
  ['/o2-correbrasil','circuito-do-sol'],
  ['/o2-correbrasil','circuito-do-sol-sp-2025'],
  ['/o2-correbrasil','circuito-eco-run-lencois-paulista'],
  ['/o2-correbrasil','circuito-eco-run-ribeiro-preto-2024'],
  ['/o2-correbrasil','circuito-estaes-inverno-rio-de-janeiro'],
  ['/o2-correbrasil','circuito-estaes-inverno-salvador'],
  ['/o2-correbrasil','circuito-estaes-primavera-so-paulo-2024'],
  ['/o2-correbrasil','circuito-mov-enel-niteri-2024'],
  ['/o2-correbrasil','corrida-arena-verao-pao-de-acucar'],
  ['/o2-correbrasil','corrida-biomas-cuiab'],
  ['/o2-correbrasil','corrida-do-bem-eco-aailandia'],
  ['/o2-correbrasil','corrida-do-bem-eco-mangaratiba-2024'],
  ['/o2-correbrasil','corrida-do-bem-eco-parauapebas-2024'],
  ['/o2-correbrasil','corrida-do-bem-eco-so-joo-da-barra-2024'],
  ['/o2-correbrasil','corrida-graacc-2024'],
  ['/o2-correbrasil','corrida-vera-cruz-2024'],
  ['/o2-correbrasil','eco-run-belem-2025'],
  ['/o2-correbrasil','eco-run-campinas-2025'],
  ['/o2-correbrasil','eco-run-mossoro-2024'],
  ['/o2-correbrasil','eco-run-piracicaba-2024'],
  ['/o2-correbrasil','eco-run-rio-de-janeiro'],
  ['/o2-correbrasil','eco-run-sao-paulo-etapa-2-2025'],
  ['/o2-correbrasil','fuga-das-ilhas-2025'],
  ['/o2-correbrasil','girl-power-belm'],
  ['/o2-correbrasil','girl-power-belo-horizonte-2024'],
  ['/o2-correbrasil','girl-power-campinas-2024'],
  ['/o2-correbrasil','girl-power-rio-de-janeiro-2025'],
  ['/o2-correbrasil','girl-power-run-brasilia-2024'],
  ['/o2-correbrasil','girl-power-so-luis'],
  ['/o2-correbrasil','girl-power-vitria-2024'],
  ['/o2-correbrasil','hope-resort-run-2025'],
  ['/o2-correbrasil','meia-de-sampa-2025'],
  ['/o2-correbrasil','mov-enel-niteroi-2025'],
  ['/o2-correbrasil','mov-enel-osasco-2025'],
  ['/o2-correbrasil','neoenergia-night-run-leme-2025'],
  ['/o2-correbrasil','new-balance-15k-sao-paulo'],
  ['/o2-correbrasil','new-balance-2025-rio-de-janeiro'],
  ['/o2-correbrasil','night-run-2024-etapa-1-belo-horizonte'],
  ['/o2-correbrasil','night-run-2024-etapa-1-brasilia'],
  ['/o2-correbrasil','night-run-etapa-1-aracaju-2025'],
  ['/o2-correbrasil','night-run-etapa-1-brasilia-2025'],
  ['/o2-correbrasil','night-run-etapa-1-porto-alegre-2025'],
  ['/o2-correbrasil','night-run-etapa-1-rj-2024'],
  ['/o2-correbrasil','night-run-etapa-1-sp-2024'],
  ['/o2-correbrasil','night-run-etapa-2-rio-de-janeiro'],
  ['/o2-correbrasil','night-run-etapa-2-sao-paulo-2025'],
  ['/o2-correbrasil','night-run-fortaleza-2024'],
  ['/o2-correbrasil','night-run-manaus-2025'],
  ['/o2-correbrasil','night-run-recife-2024'],
  ['/o2-correbrasil','night-run-rio-de-janeiro-etapa-2-2024'],
  ['/o2-correbrasil','night-run-salvador-2025'],
  ['/o2-correbrasil','s-run-edio-lobas'],
  ['/o2-correbrasil','s-run-londrina-2025'],
  ['/o2-correbrasil','s-run-novo-hamburgo-2025'],
  ['/o2-correbrasil','s-run-palmas-2025'],
  ['/o2-correbrasil','s-run-sao-luis-2025'],
  ['/o2-correbrasil','s-run-teresina-2025'],
  ['/o2-correbrasil','smart-fit-run-sp-2025'],
  ['/o2-correbrasil','trofu-brasil-de-triathlon-etapa-2'],
  ['/o2-correbrasil','volta-do-parcel-2024'],
  ['/pepper-sports','corrida-pink-do-bem-ossel-assistencia-2024'],
  ['/pepper-sports','planet-run-series-etapa-1'],
  ['/pepper-sports','planeta-run-series-2024-etapa-3'],
  ['/pepper-sports','planeta-run-series-etapa-2'],
  ['/pepper-sports','sorocaba-speed-run-2024'],
  ['/pepper-sports','sorocaba-speed-run-performance-edition-2025'],
  ['/pepper-sports','sorocaba-speed-run-starter'],
  ['/ponto-org','corrida-do-bob-esponja-sao-paulo-2024'],
  ['/ponto-org','minions-run-2025'],
  ['/ponto-org','nfl-run-2024'],
  ['/run-sports','1-poa-night-run-2024'],
  ['/run-sports','2-corrida-e-caminhada-raspinha'],
  ['/run-sports','2-corrida-raspinha-solidria'],
  ['/run-sports','42k-new-balance-porto-alegre-2025'],
  ['/run-sports','corrida-da-raspinha-2025'],
  ['/run-sports','corrida-do-grmio'],
  ['/run-sports','corrida-do-grmio-2023'],
  ['/run-sports','maratona-revezamento-kto-2023'],
  ['/run-sports','nb42k-porto-alegre'],
  ['/run-sports','parkshopping-canoas'],
  ['/run-sports','poa-day-run-2023-etapa-1'],
  ['/run-sports','poa-day-run-2023-etapa-2'],
  ['/run-sports','poa-day-run-2023-etapa-3'],
  ['/run-sports','poa-day-run-2024'],
  ['/run-sports','poa-day-run-2024-etapa-3'],
  ['/run-sports','poa-day-run-2025-etapa-1'],
  ['/run-sports','poa-day-run-etapa-2'],
  ['/run-sports','poa-day-run-etapa-3-2023'],
  ['/run-sports','poa-day-run-etapa-3-2025'],
  ['/run-sports','poa-half-marathon-2023'],
  ['/run-sports','poa-ladies-run-2024'],
  ['/run-sports','poa-ladies-run-2025'],
  ['/run-sports','poa-night-run'],
  ['/run-sports','poa-night-run-2-etapa-2023'],
  ['/run-sports','poa-night-run-2023-etapa-2'],
  ['/run-sports','poa-night-run-etapa-1-2025'],
  ['/run-sports','poa-night-run-etapa-2-2024'],
  ['/run-sports','poa-night-run-etapa-2-2025'],
  ['/run-sports','summer-48k-2023'],
  ['/run-sports','summer-48k-2024'],
  ['/run-sports','summer-48k-2025'],
  ['/run-sports','summer-48km'],
  ['/run-sports','summer-night-run-'],
  ['/run-sports','summer-night-run-2024'],
  ['/run-sports','summer-night-run-2025'],
  ['/sagaz-esportes','10-corrida-shopping-aricanduva-2024'],
  ['/sagaz-esportes','13-volta-uniao-2024'],
  ['/sagaz-esportes','19-aricanduva-run-2024'],
  ['/sagaz-esportes','23-corrida-pela-cidadania-2024'],
  ['/sagaz-esportes','60-corrida-e-caminhada-contra-o-cncer-de-mama'],
  ['/sagaz-esportes','61-corrida-e-caminhada-contra-o-cancer-de-mama'],
  ['/sagaz-esportes','62-corrida-e-caminhada-contra-o-cancer-de-mama'],
  ['/sagaz-esportes','corrida-das-tartarugas-ninja-so-paulo-2023'],
  ['/sagaz-esportes','corrida-e-caminhada-do-bem-estar-2023-sp'],
  ['/sagaz-esportes','corrida-netshoes-2023-franca'],
  ['/sagaz-esportes','corrida-netshoes-run-salvador'],
  ['/sagaz-esportes','corrida-netshoes-so-paulo-2023'],
  ['/sagaz-esportes','corrida-por-uma-causa-zelia-duncan-sp-2024'],
  ['/sagaz-esportes','netshoes-run-sao-paulo-2024'],
  ['/sagaz-esportes','netshoes_floripa'],
  ['/sagaz-esportes','storm-riders-2-etapa'],
  ['/sagaz-esportes','storm-riders-2023'],
  ['/sagaz-esportes','storm-riders-ii-2023'],
  ['/sagaz-esportes','storm-riders-sp-2022'],
  ['/sagaz-esportes','trackfiel-experience-running-baroneza'],
  ['/sagaz-esportes','transformers-run'],
  ['/sana-sports','ultra-trail-caparao-2024'],
  ['/sportsland','corrida-centenria-do-do-avai-2023'],
  ['/sportsland','corrida-do-centenrio-do-ava'],
  ['/sportsland','corrida-solidria-rs'],
  ['/sportsland','jurer-night-run-2024'],
  ['/sportsland','jurere-night-run-hard-rock-cafe-floripa'],
  ['/sportsland','maratona-de-jurer'],
  ['/sportsland','maratona-de-jurer-2023'],
  ['/sportsland','maratona-de-jurere-2025'],
  ['/sportsland','maratona-de-jurere-hospital-sos-cardio-2024'],
  ['/sportsland','meia-maratona-21-bpm-sc'],
  ['/sportsland','meia-maratona-guarda-do-emba'],
  ['/sportsland','meia-maratona-guarda-do-emba-2023'],
  ['/sportsland','meia-maratona-int-de-florianpolis-oakberry-2023'],
  ['/sportsland','meia-maratona-int-oakberry'],
  ['/sportsland','night-run-floripa-airpot-2024'],
  ['/vega-sports','1-corrida-da-sirio-libanes-sao-paulo'],
  ['/vega-sports','1-corrida-sirio-libanes-brasilia'],
  ['/vega-sports','airton-senna-racing-day'],
  ['/vega-sports','asics-golden-run-rio-de-janeiro-2023'],
  ['/vega-sports','asics-golden-run-rj-2024'],
  ['/vega-sports','asics-golden-run-so-paulo'],
  ['/vega-sports','asics-golden-run-sp-2023'],
  ['/vega-sports','asics-run-challenge-recife-2025'],
  ['/vega-sports','ayrton-senna-racing-day-20-edicao'],
  ['/vega-sports','barbie-run-rio-de-janeiro-2024'],
  ['/vega-sports','barbie-run-so-paulo-2025'],
  ['/vega-sports','corrida-do-hc-2023-campinas'],
  ['/vega-sports','corrida-plie-pela-primera-vez-2024'],
  ['/vega-sports','fla-run-2025'],
  ['/vega-sports','fla-run-corrida-oficial-do-flamengo'],
  ['/vega-sports','flarun-etapa-2-2025'],
  ['/vega-sports','travessia-poliana-okimoto-2023'],
  ['/vega-sports','tricolor-night-run-1-etapa-2023'],
  ['/vega-sports','tricolor-run'],
  ['/vega-sports','tricolor-run-2023'],
  ['/vega-sports','tricolor-run-etapa-2-2025'],
  ['/vega-sports','tricolor-run-etapa-diurna-2024'],
  ['/vega-sports','tricolor-run-etapa-noturna-2024'],
  ['/vega-sports','ultra-bm-2024'],
  ['/vega-sports','ultramaratona-bm-2023'],
  ['/vega-sports','ultramaratona-bm-2023-202501132233'],
  ['/wtr','wtr-nova-lima-2025'],
  ['/x3m','centauro-desbrava-etapa-rio-de-janeiro-2024'],
  ['/x3m','centauro-desbrava-etapa-sao-paulo-2024'],
  ['/x3m','centauro-reveza-adidas-bh'],
  ['/x3m','centauro-reveza-adidas-rj'],
  ['/x3m','i-love-corrida-prio'],
  ['/x3m','nike-running-sp-2024'],
  ['/x3m','trofeu-nike-qualify-2'],
  ['/x3m','xterra-bzios-2022'],
  ['/x3m','xterra-caragua-2022'],
  ['/x3m','xterra-ibitipoca'],
  ['/x3m','xterra-ilha-bela'],
  ['/x3m','xterra-ilha-grande'],
  ['/x3m','xterra-ilha-grande-2025'],
  ['/x3m','xterra-itabira'],
  ['/x3m','xterra-mariana'],
  ['/x3m','xterra-ouro-preto'],
  ['/youp','skate-run'],
  ['/youp','skate-run-2022-'],
  ['/youp','skate-run-2024'],
  ['/youp','skate-run-sp-2023'],
  ['/zenite-sports','circuito-music-run-rock'],
  ['/zenite-sports','jampa-run-2024'],
  ['/zenite-sports','meia-maratona-de-joao-pessoa-2024'],
  ['/zenite-sports','redepharma-run-2024'],
];

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept': 'text/html,*/*', ...headers },
      timeout: 30000,
    }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── AES decrypt ─────────────────────────────────────────────────────────────
function decryptBlocks(html, key) {
  const enc = html.match(/U2FsdGVkX1[A-Za-z0-9+/=]{20,}/g) || [];
  const results = [];
  for (const block of enc) {
    try {
      const dec = CryptoJS.AES.decrypt(block, key).toString(CryptoJS.enc.Utf8);
      if (!dec || dec.length < 10) continue;
      results.push(JSON.parse(dec));
    } catch (_) {}
  }
  return results;
}

function findAthleteData(blocks) {
  for (const b of blocks) {
    if (Array.isArray(b) && b.length > 0 && b[0].id && b[0].generalPlacement !== undefined) return b;
  }
  return null;
}

function findStats(blocks) {
  for (const b of blocks) { if (b && b.modality && Array.isArray(b.modality)) return b; }
  return null;
}

// ─── Metadata do evento ───────────────────────────────────────────────────────
async function getEventMeta(companySlug, eventSlug) {
  const url = `https://resultados.runking.com.br${companySlug}/${eventSlug}`;
  const { body } = await httpsGet(url, { 'RSC': '1' });

  const nameMatch = body.match(/"eventName":"([^"]+)"/) ||
                    body.match(/"name":"((?!viewport|description|keywords|robots)[A-Za-z][^"]{3,})"/);
  const dateMatch = body.match(/"mainDate":"([^"]+)"/) ||
                    body.match(/"startTime":"([^"]+)"/) ||
                    body.match(/"eventMainDate":(\d+)/);
  const cityMatch = body.match(/"eventCity":"([^"]+)"/);
  const ufMatch   = body.match(/"eventUF":"([^"]+)"/);

  let date = null;
  if (dateMatch) {
    const v = dateMatch[1];
    date = /^\d+$/.test(v) ? new Date(parseInt(v)) : new Date(v);
    if (isNaN(date.getTime())) date = null;
  }

  // Extrair modalidades
  const modalities = [];
  const modRe = /"code":"([^"]+)","name":"[^"]+","map":"[^"]*","mapParse"/g;
  let mm;
  while ((mm = modRe.exec(body)) !== null) {
    if (!modalities.includes(mm[1])) modalities.push(mm[1]);
  }
  if (!modalities.length) {
    const statsKey = `${eventSlug}CIPHER$#`;
    const blocks = decryptBlocks(body, statsKey);
    const stats = findStats(blocks);
    if (stats) stats.modality.forEach(m => modalities.push(m.modality));
  }

  // Nome do evento
  let nome = decodeURIComponent(eventSlug).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const evObjRe = new RegExp('"slug":"' + eventSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^}]{0,200}"name":"([^"]+)"');
  const evObjMatch = body.match(evObjRe);
  if (evObjMatch) nome = evObjMatch[1];
  else if (nameMatch) nome = nameMatch[1];

  return { name: nome, date, city: cityMatch ? cityMatch[1] : 'Brasil', state: ufMatch ? ufMatch[1] : 'XX', modalities };
}

// ─── Scrape modalidade ────────────────────────────────────────────────────────
async function scrapeModality(companySlug, eventSlug, modality) {
  const key = `${eventSlug}CIPHER$#`;
  const athletes = [];
  const seen = new Set();

  for (const gender of ['M', 'F']) {
    let page = 1;
    let emptyCount = 0;
    while (true) {
      const url = `https://resultados.runking.com.br${companySlug}/${eventSlug}` +
        `?modality=${encodeURIComponent(modality)}&page=${page}&gender=${gender}&category=`;
      process.stdout.write(` ${gender}p${page}`);
      try {
        const { body } = await httpsGet(url);
        const blocks = decryptBlocks(body, key);
        const list = findAthleteData(blocks);
        if (!list || !list.length) {
          if (++emptyCount >= 2) break;
          page++; await DELAY(600); continue;
        }
        emptyCount = 0;
        for (const a of list) { if (!seen.has(a.id)) { seen.add(a.id); athletes.push(a); } }
        if (list.length < PER_PAGE) break;
        page++;
      } catch (e) {
        process.stdout.write(`(ERR:${e.message.slice(0, 20)})`);
        break;
      }
      await DELAY(600);
    }
  }
  return athletes;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function normDist(d) {
  const n = parseFloat(String(d || '5').replace(/[^0-9.]/g, ''));
  if (n >= 40) return '42K'; if (n >= 20) return '21K'; if (n >= 14) return '15K';
  if (n >= 12) return '12K'; if (n >= 9) return '10K'; if (n >= 7.5) return '8K';
  if (n >= 6.5) return '7K'; if (n >= 5.5) return '6K'; if (n >= 4) return '5K'; return '3K';
}
function distKm(d) {
  return { '42K': 42, '21K': 21, '15K': 15, '12K': 12, '10K': 10, '8K': 8, '7K': 7, '6K': 6, '5K': 5, '3K': 3 }[d] || 5;
}
function fmtTime(t) {
  if (!t) return null;
  const p = String(t).split(':');
  if (p.length >= 3) {
    const h = parseInt(p[0]), m = parseInt(p[1]), s = Math.floor(parseFloat(p[2]));
    if (isNaN(h) || isNaN(m) || isNaN(s) || (!h && !m && !s)) return null;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return null;
}
function calcPace(time, km) {
  if (!time || !km) return null;
  const [h, m, s] = time.split(':').map(Number);
  const sec = h * 3600 + m * 60 + s;
  if (!sec) return null;
  const ps = sec / km;
  return Math.floor(ps / 60) + ':' + String(Math.round(ps % 60)).padStart(2, '0');
}
function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─── Importar para o banco ────────────────────────────────────────────────────
async function importEvent(db, companySlug, eventSlug, meta, allAthletes) {
  if (!allAthletes.length) return 0;

  const distLabels = [...new Set(allAthletes.map(a => normDist(a._mod || a.modality || '5K')))];
  const distStr = distLabels.join(',') || '5K';
  const dateStr = meta.date ? meta.date.toISOString().slice(0, 10) : '2024-01-01';
  const companyName = companySlug.replace(/^\//, '').replace(/-/g, ' ');

  // Verificar se já existe
  const ex = await db.query(
    'SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=\'Runking\' LIMIT 1',
    ['%' + meta.name.slice(0, 25).replace(/%/g, '') + '%']
  );
  let raceId;
  if (ex.rows.length) {
    raceId = ex.rows[0].id;
    const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [raceId]);
    if (parseInt(chk.rows[0].c) > 0) { process.stdout.write(' JÁ'); return -1; }
  } else {
    raceId = `rk_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, meta.name.slice(0, 200), meta.city, meta.state, dateStr, distStr, 'Runking', 'completed']
    );
  }

  // Inserir atletas em lote
  for (let i = 0; i < allAthletes.length; i += 100) {
    const chunk = allAthletes.slice(i, i + 100);
    const vals = chunk.map((a, j) => {
      const name = (a.name || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 200);
      if (!name || name.length < 2) return null;
      const id = `rk_${(Date.now() + i + j).toString(36)}${j}`;
      const g = a.gender === 'F' ? "'F'" : a.gender === 'M' ? "'M'" : 'NULL';
      const st = a.state ? `'${esc(String(a.state).slice(0, 2).toUpperCase())}'` : 'NULL';
      return `('${id}','${esc(name)}',${g},${st},NULL,NULL,1,0,NOW(),NOW())`;
    }).filter(Boolean);
    if (!vals.length) continue;
    await db.query(
      'INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' +
      vals.join(',') + ' ON CONFLICT DO NOTHING'
    );
  }

  // Buscar IDs
  const names = [...new Set(allAthletes.map(a => (a.name || '').trim().toUpperCase().replace(/\s+/g, ' ')).filter(Boolean))];
  const athleteMap = {};
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(',');
    const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const r of rows.rows) athleteMap[r.name] = r.id;
  }

  // Inserir resultados
  let imported = 0;
  for (const a of allAthletes) {
    const name = (a.name || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const aid = athleteMap[name];
    if (!aid) continue;
    const time = fmtTime(a.liquidTime || a.rawTime || a.time || a.finishTime || a.chipTime);
    if (!time) continue;
    const dist = normDist(a._mod || a.modality || '5K');
    const km = distKm(dist);
    const id = `rkr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW()) ON CONFLICT DO NOTHING',
        [id, aid, raceId, time, calcPace(time, km), dist, a.categoryName || a.category || null, a.generalPlacement || null, parseInt(a.genderPlacement) || null]
      );
      imported++;
    } catch (_) {}
  }
  return imported;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  // Filtrar lista
  let lista = ALL_EVENTS;
  if (COMPANY_FILTER) {
    lista = lista.filter(([c]) => c.includes(COMPANY_FILTER));
    console.log(`Filtrando por empresa: ${COMPANY_FILTER} → ${lista.length} eventos`);
  }
  lista = lista.slice(START, START + LIMIT);

  console.log(`\n=== REGENI Scraper Runking HISTÓRICO ===`);
  console.log(`${lista.length} eventos para processar (start=${START}, limit=${LIMIT})`);
  if (DRY_RUN) console.log('(DRY RUN)');
  console.log('');

  let totalImported = 0, totalSkip = 0, totalNew = 0;

  for (let i = 0; i < lista.length; i++) {
    const [companySlug, eventSlug] = lista[i];
    process.stdout.write(`\n[${i + 1 + START}/${START + lista.length}] ${eventSlug.slice(0, 40).padEnd(40)}`);

    try {
      // Checar banco por slug no nome
      const ex = await db.query(
        'SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=\'Runking\' LIMIT 1',
        ['%' + decodeURIComponent(eventSlug).slice(0, 20).replace(/-/g, '%').replace(/%/g, '%') + '%']
      );
      if (ex.rows.length) {
        const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [ex.rows[0].id]);
        if (parseInt(chk.rows[0].c) > 0) {
          process.stdout.write(' skip(banco)');
          totalSkip++;
          continue;
        }
      }

      await DELAY(400);
      const meta = await getEventMeta(companySlug, eventSlug);
      const dateStr = meta.date ? meta.date.toISOString().slice(0, 10) : 'sem-data';
      process.stdout.write(` ${dateStr} ${meta.city}/${meta.state} [${meta.modalities.length}mod]`);

      // Pular eventos futuros (sem resultados ainda)
      if (meta.date && meta.date > new Date()) {
        process.stdout.write(' skip(futuro)');
        totalSkip++;
        continue;
      }

      if (DRY_RUN) continue;

      // Scrape modalidades
      let modalities = meta.modalities.length ? meta.modalities : [''];
      const allAthletes = [];
      for (const mod of modalities) {
        process.stdout.write(`\n  [${mod || 'DEFAULT'}]`);
        const aths = await scrapeModality(companySlug, eventSlug, mod);
        for (const a of aths) allAthletes.push({ ...a, _mod: mod });
        process.stdout.write(` =${aths.length}`);
        await DELAY(500);
      }

      if (!allAthletes.length) { process.stdout.write(' sem-dados'); totalSkip++; continue; }

      process.stdout.write(`\n  Total: ${allAthletes.length} atletas`);
      const n = await importEvent(db, companySlug, eventSlug, meta, allAthletes);
      if (n === -1) { totalSkip++; continue; }
      process.stdout.write(` → ${n} importados`);
      totalImported += n;
      totalNew++;

      await DELAY(800);
    } catch (e) {
      process.stdout.write(` ERRO: ${e.message.slice(0, 60)}`);
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log(`RUNKING HISTÓRICO — ${totalImported} resultados importados`);
  console.log(`                    ${totalNew} novos eventos`);
  console.log(`                    ${totalSkip} eventos pulados`);

  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Result") res,(SELECT COUNT(*) FROM "Athlete") a');
  console.log(`Banco: ${r.rows[0].c} corridas | ${r.rows[0].res} resultados | ${r.rows[0].a} atletas`);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
