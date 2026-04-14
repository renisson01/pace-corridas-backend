# 🏠 REGENI — Painel de Controle

> Abra este arquivo no Obsidian com Dataview ativo para ver os dashboards dinâmicos.

---

## 📊 Status do Projeto

```dataview
TABLE status, prioridade, updated
FROM "cerebro"
WHERE type = "referencia" OR type = "roadmap"
SORT updated DESC
```

---

## 🕷️ Scrapers — Status

```dataview
TABLE WITHOUT ID
  file.link as "Fonte",
  eventos as "Eventos",
  resultados as "Resultados",
  status as "Status",
  regiao as "Região"
FROM "cerebro/scrapers"
SORT resultados DESC
```

---

## ✅ Tarefas da Semana

```tasks
not done
path includes cerebro
sort by priority
```

---

## 📅 Daily Logs Recentes

```dataview
TABLE WITHOUT ID
  file.link as "Dia",
  length(file.lists) as "Itens"
FROM "cerebro/daily"
SORT file.name DESC
LIMIT 7
```

---

## 🔗 Links Rápidos

- [[REGENI-BRAIN]] — Fonte única de verdade
- [[08-FONTES-RESULTADOS]] — Mapa de 30+ cronometradoras
- [[04-ROADMAP]] — Próximas features
- [[05-DECISOES]] — Decisões técnicas
- [[06-IDENTIDADE-ATLETA]] — Sistema de deduplicação

---

## 🖥️ Comandos do Terminal

### Checar banco
```bash
node -e "const {Client}=require('pg');const c=new Client({connectionString:'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway'});c.connect().then(async()=>{const r=await c.query('SELECT COUNT(*) FROM \"Result\"');const a=await c.query('SELECT COUNT(*) FROM \"Athlete\"');const rc=await c.query('SELECT COUNT(*) FROM \"Race\"');console.log('Corridas:',rc.rows[0].count,'| Resultados:',r.rows[0].count,'| Atletas:',a.rows[0].count);c.end()})"
```

### Checar scrapers
```bash
tail -3 /tmp/chiptiming-bulk2.log
tail -3 /tmp/runking-historic-full.log
ps aux | grep "scraper-\|chiptiming" | grep -v grep
```
