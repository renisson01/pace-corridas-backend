# Obsidian — Plugins e Configuração Profissional

← [[00-INDEX]]

> Contexto: trabalhamos com dados sensíveis (CPF, data de nascimento, 810k atletas).  
> O Obsidian é nosso "segundo cérebro" técnico. Precisa ser rápido, seguro e poderoso.

---

## Plugins Essenciais (instalar agora)

### 1. Dataview ⭐⭐⭐⭐⭐
```
Propósito: Consultar suas notas como um banco de dados SQL
Exemplo de uso:
```dataview
TABLE decisao, impacto FROM "cerebro"
WHERE type = "decisao" SORT date DESC
```
**Por que é indispensável:** Você poderá listar todos os bugs, todas as decisões, todos os scrapers ativos — como dashboards dinâmicos dentro do Obsidian.

### 2. Templater ⭐⭐⭐⭐⭐
```
Propósito: Templates avançados com JavaScript, datas automáticas, inputs
Exemplo: template para nova decisão técnica (DEC-NNN), bug, nota diária
Por que: garante estrutura consistente em todas as notas — Claude sempre sabe onde procurar
```

### 3. Obsidian Git ⭐⭐⭐⭐⭐
```
Propósito: Sync automático do vault com repositório Git privado
Configurar: auto-commit a cada 30 minutos, push ao sair
CRÍTICO para dados sensíveis: vault local + Git privado >>> Obsidian Sync (que é nuvem)
```

### 4. Excalidraw ⭐⭐⭐⭐
```
Propósito: Diagramas de arquitetura dentro do Obsidian
Uso: desenhar o fluxo dos scrapers, a arquitetura de identidade, o modelo de dados
```

### 5. Local REST API ⭐⭐⭐⭐⭐ (GAME CHANGER)
```
Propósito: Expõe uma API REST local para o vault Obsidian
Uso: Claude Code pode ESCREVER notas diretamente no Obsidian via curl/fetch!
Exemplo: quando descobrimos um bug, o script salva automaticamente em cerebro/03-BUGS-RESOLVIDOS.md

Instalação: Community Plugins → "Local REST API"
Porta padrão: 27123
Token: configurar nas settings
```

**Com este plugin, os scripts podem fazer:**
```javascript
// De dentro de um script Node.js:
await fetch('http://localhost:27123/vault/cerebro/03-BUGS-RESOLVIDOS.md', {
  method: 'PATCH',
  headers: { 'Authorization': 'Bearer <token>' },
  body: JSON.stringify({ content: '## Bug YYYY-MM-DD\n...' })
});
```

### 6. Kanban ⭐⭐⭐⭐
```
Propósito: Board estilo Trello dentro do Obsidian
Uso: sprints, backlog, WIP — linked ao ROADMAP.md
```

### 7. Tasks ⭐⭐⭐⭐
```
Propósito: Task management com due dates, priorities, recorrência
Uso: acompanhar o que Claude sugeriu implementar
Integra com Dataview
```

### 8. DB Folder ⭐⭐⭐
```
Propósito: View de tabela/banco para pastas de notas
Uso: ver todos os scrapers como uma tabela com status/última atualização
```

### 9. Metadata Menu ⭐⭐⭐
```
Propósito: Interface visual para frontmatter YAML
Uso: campos estruturados em cada nota (type, date, status, priority)
```

### 10. Mind Map ⭐⭐⭐
```
Propósito: Visualizar hierarquia de uma nota como mind map
Uso: ver a arquitetura do REGENI como mapa mental
```

---

## Plugins de Segurança (IMPORTANTE — dados sensíveis)

### Obsidian Encrypt ⭐⭐⭐⭐⭐
```
Propósito: Criptografar notas específicas dentro do vault
Uso: qualquer nota com CPF real, dados de teste com dados pessoais
REGRA: CPF e dados pessoais NUNCA em texto claro no Obsidian
```

### File Recovery ⭐⭐⭐
```
Propósito: Snapshots automáticos de notas (history)
Uso: recuperar notas deletadas acidentalmente
```

---

## Configuração Recomendada do Vault

```
pace-corridas-backend/
└── cerebro/           ← vault Obsidian aqui (já é o diretório)
    ├── .obsidian/     ← config dos plugins
    ├── 00-INDEX.md
    ├── 01-ARQUITETURA.md
    ├── 02-BANCO-DE-DADOS.md
    ├── 03-BUGS-RESOLVIDOS.md
    ├── 04-ROADMAP.md
    ├── 05-DECISOES.md
    ├── 06-IDENTIDADE-ATLETA.md  ← novo
    ├── 07-OBSIDIAN-PLUGINS.md   ← este arquivo
    ├── daily/         ← daily notes (template automático)
    │   └── 2026-04-13.md
    └── copilot/       ← contexto para AI
```

### .gitignore no vault
```
# NÃO commitar dados sensíveis no cerebro
cerebro/.obsidian/workspace.json  # estado UI (muito ruído no git)
cerebro/daily/private-*.md        # notas privadas
```

---

## Fluxo de trabalho com Claude

### Como o Claude deve alimentar o Obsidian
1. **Bugs descobertos** → `03-BUGS-RESOLVIDOS.md` — data, causa, solução
2. **Decisões arquiteturais** → `05-DECISOES.md` — DEC-NNN formato
3. **Scrapers novos** → `01-ARQUITETURA.md` seção scrapers
4. **Dados do banco** → `02-BANCO-DE-DADOS.md` atualizar contagens
5. **Daily notes** → `daily/YYYY-MM-DD.md` — o que foi feito, o que ficou pendente

### Template de nota diária (Templater)
```markdown
# Daily — {{date:YYYY-MM-DD}}

## ✅ Feito hoje
- 

## 🔴 Problemas encontrados
- 

## ⏳ Pendente para amanhã
- 

## 📊 Estado do banco
- Atletas: 
- Resultados: 
- Corridas: 

## 🔗 Referências
- 
```

---

## Por que isso nos torna referência no Brasil

| Recurso | Concorrente | REGENI |
|---------|------------|--------|
| Histórico unificado por identidade | ❌ | ✅ (em construção) |
| CPF como chave de deduplicação | ❌ | ✅ (planejado) |
| Entrada manual pelo atleta | Parcial | ✅ (planejado) |
| 619k+ resultados indexados | ❌ | ✅ |
| Fuzzy match por similarity | ❌ | ✅ (pg_trgm ativo) |
| Open source da base de dados | ❌ | — |

**A vantagem competitiva é o dado + a confiabilidade da identidade.**  
Quando um atleta sabe que pode encontrar TODOS os seus resultados em um só lugar, ele volta. E traz outros atletas.
