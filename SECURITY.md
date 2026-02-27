# 🔐 PACE - Guia de Segurança

## ✅ Implementado
- Senhas com bcrypt (hash forte)
- JWT tokens com expiração 30 dias
- BIP39 - 12 palavras para recuperação
- Rate limiting (100 req/min, 10 tentativas login)
- Headers de segurança (Helmet)
- .env protegido no .gitignore

## 🔄 Fazer no Railway AGORA
1. Postgres → Variables → trocar POSTGRES_PASSWORD
2. Variables do Web → adicionar JWT_SECRET forte
3. Ativar backups automáticos (Postgres → Backups)

## 📋 Boas práticas
- NUNCA compartilhar DATABASE_URL em chat/email
- Trocar senhas a cada 90 dias
- Manter Railway plan pago para backups

## 🚨 Em caso de vazamento
1. Trocar senha do banco imediatamente no Railway
2. Invalidar todos os tokens JWT (trocar JWT_SECRET)
3. Verificar logs de acesso no Railway → Logs
