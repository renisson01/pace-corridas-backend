---
type: daily
date: <% tp.date.now("YYYY-MM-DD") %>
---

# Daily — <% tp.date.now("YYYY-MM-DD (dddd)", 0, tp.date.now(), "pt-BR") %>

## ✅ Feito Hoje
- 

## 🔴 Problemas
- 

## ⏳ Pendente Amanhã
- 

## 📊 Estado do Banco
```bash
# Rodar no terminal e colar aqui
node -e "const {Client}=require('pg');const c=new Client({connectionString:'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway'});c.connect().then(async()=>{const r=await c.query('SELECT COUNT(*) FROM \"Result\"');const a=await c.query('SELECT COUNT(*) FROM \"Athlete\"');const rc=await c.query('SELECT COUNT(*) FROM \"Race\"');console.log('Corridas:',rc.rows[0].count,'| Resultados:',r.rows[0].count,'| Atletas:',a.rows[0].count);c.end()})"
```

| Métrica | Valor |
|---------|-------|
| Corridas | |
| Resultados | |
| Atletas | |

## 🕷️ Scrapers Ativos
| Scraper | Progresso | Status |
|---------|-----------|--------|
| | | |

## 🔗 Refs
- [[REGENI-BRAIN]]
- [[KANBAN]]
