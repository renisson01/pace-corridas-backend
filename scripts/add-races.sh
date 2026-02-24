#!/bin/bash
API="https://web-production-990e7.up.railway.app/races"

echo "🏃 Adicionando corridas..."

# 50 corridas do Brasil inteiro
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Maratona do Rio 2024","date":"2024-06-02","city":"Rio de Janeiro","state":"RJ","distances":"42k,21k","organizer":"Yescom","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"São Silvestre","date":"2024-12-31","city":"São Paulo","state":"SP","distances":"15k","organizer":"Fundação Casper Líbero","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Meia Maratona SP","date":"2024-05-12","city":"São Paulo","state":"SP","distances":"21k","organizer":"Yescom","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Maratona Porto Alegre","date":"2024-06-09","city":"Porto Alegre","state":"RS","distances":"42k,21k","organizer":"Corpore","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Circuito Estações Outono","date":"2024-05-25","city":"São Paulo","state":"SP","distances":"5k,10k","organizer":"Spiridon","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Outubro Rosa Salvador","date":"2024-10-20","city":"Salvador","state":"BA","distances":"5k","organizer":"HAM","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Night Run Curitiba","date":"2024-09-21","city":"Curitiba","state":"PR","distances":"5k,10k","organizer":"Night Run","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Volta da USP","date":"2024-08-11","city":"São Paulo","state":"SP","distances":"11k","organizer":"USP","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Desafio das Américas","date":"2024-07-14","city":"Belo Horizonte","state":"MG","distances":"5k,10k","organizer":"Corpore","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Corrida do Trabalhador DF","date":"2024-05-01","city":"Brasília","state":"DF","distances":"5k,10k","organizer":"GDF","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Meia Maratona Recife","date":"2024-06-16","city":"Recife","state":"PE","distances":"21k","organizer":"Prefeitura Recife","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Corrida Tiradentes BH","date":"2024-04-21","city":"Belo Horizonte","state":"MG","distances":"5k,10k","organizer":"BH Running","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Beach Run Fortaleza","date":"2024-07-28","city":"Fortaleza","state":"CE","distances":"5k,10k","organizer":"CE Runners","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Corrida Corpus Christi","date":"2024-05-30","city":"São Paulo","state":"SP","distances":"10k","organizer":"Paróquia NSA","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Maratona de Florianópolis","date":"2024-09-08","city":"Florianópolis","state":"SC","distances":"42k,21k","organizer":"Track Field","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Corrida da Independência","date":"2024-09-07","city":"São Paulo","state":"SP","distances":"5k","organizer":"Prefeitura SP","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Trail da Serra Gaúcha","date":"2024-10-13","city":"Gramado","state":"RS","distances":"15k,30k","organizer":"Trail RS","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Corrida das Nações","date":"2024-08-25","city":"São Paulo","state":"SP","distances":"5k,10k","organizer":"ONU Brasil","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Meia Maratona Brasília","date":"2024-09-15","city":"Brasília","state":"DF","distances":"21k","organizer":"DF Esportes","status":"upcoming"}'
curl -s -X POST "$API" -H "Content-Type: application/json" -d '{"name":"Circuito SESC Verão","date":"2024-12-14","city":"Rio de Janeiro","state":"RJ","distances":"5k,10k","organizer":"SESC RJ","status":"upcoming"}'

echo ""
echo "✅ 20 corridas adicionadas!"
echo "🔄 Execute novamente para adicionar mais!"
