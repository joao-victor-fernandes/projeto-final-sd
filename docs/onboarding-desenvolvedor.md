# Onboarding do desenvolvedor

Este guia foi escrito para ajudar o proximo desenvolvedor a entender rapidamente o MVP, subir o ambiente, rodar testes e continuar a evolucao do projeto.

## 1. Objetivo do repositorio

Este repositorio contem um MVP demonstravel de uma plataforma de oficina mecanica com:

- portal web em `Next.js`
- API em `Express`
- autenticação minima por perfil
- processamento assincrono com `RabbitMQ`
- persistencia relacional em `PostgreSQL`
- uploads locais para simplificar a primeira entrega

O foco atual e provar o fluxo principal:

1. autenticar usuarios
2. filtrar ordens conforme o perfil
3. anexar mídia na ordem
4. registrar metadados no banco
5. publicar evento na fila
6. processar o evento em background
7. exibir o resultado no portal

## 2. Visao da estrutura

### Frontend

- app principal: [frontend/app/page.js](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/frontend/app/page.js)
- componente central: [frontend/components/demo-client.jsx](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/frontend/components/demo-client.jsx)

Responsabilidade:

- login
- exibicao do painel por perfil
- upload de mídia
- consumo direto da API

### Backend

- bootstrap do servidor: [backend/src/server.js](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/backend/src/server.js)
- app testavel: [backend/src/create-app.js](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/backend/src/create-app.js)
- acesso a dados e seed: [backend/src/store.js](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/backend/src/store.js)
- fila: [backend/src/rabbit.js](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/backend/src/rabbit.js)

Responsabilidade:

- autenticação
- autorização por perfil
- leitura de ordens
- upload local de arquivos
- persistencia de metadados no PostgreSQL
- publicacao de eventos no RabbitMQ

### Worker

- consumidor: [worker/src/worker.js](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/worker/src/worker.js)

Responsabilidade:

- consumir a fila `media.uploaded`
- atualizar status de mídia para `PROCESSING`
- simular processamento
- atualizar status para `PROCESSED`

### Documentacao

- resumo da demo: [README-demo.md](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/README-demo.md)
- testes locais: [docs/testes-locais.md](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/docs/testes-locais.md)
- guia de testes: [docs/testes-manuais-e-automatizados.md](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/docs/testes-manuais-e-automatizados.md)
- deploy: [docs/deploy-cloudflare-aws.md](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/docs/deploy-cloudflare-aws.md)

## 3. Stack local

O ambiente sobe via Docker Compose:

- `frontend`
- `backend`
- `worker`
- `postgres`
- `rabbitmq`

Arquivo:

- [docker-compose.yml](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/docker-compose.yml)

## 4. Como subir no PC

### Pre-requisitos

- Docker
- Docker Compose

### Comandos

```bash
docker compose up --build
```

URLs:

- frontend: `http://localhost:3000`
- backend: `http://localhost:4000/health`
- postgres: `localhost:5432`
- rabbitmq: `http://localhost:15672`

## 5. Como testar rapidamente

### Smoke test

```bash
bash scripts/smoke-test.sh
```

### Testes automatizados

```bash
docker compose exec backend npm test
```

### Teste manual

1. abrir `http://localhost:3000`
2. entrar com um perfil demo
3. navegar nas ordens
4. entrar como mecânico
5. enviar uma mídia
6. conferir o status e o painel do RabbitMQ

## 6. Como buildar

### Frontend

```bash
docker compose exec frontend npm run build
```

### Backend

O backend nao tem etapa de bundle; o build efetivo e a imagem Docker:

```bash
docker compose build backend
```

### Stack completa

```bash
docker compose build
```

## 7. Como os dados estao persistidos

### PostgreSQL

Persistidos no banco:

- usuarios
- veiculos
- ordens de servico
- relacao ordem x mecanicos
- mensagens
- metadados de mídia

### Uploads locais

Persistidos em disco:

- arquivos fisicos enviados

Diretorio:

- `backend/uploads`

## 8. Seed da aplicacao

O seed e feito automaticamente na inicializacao do backend se o banco estiver vazio.

As contas demo principais sao:

- `joao@oficina.demo` / `cliente123` (CLIENTE)
- `maria@oficina.demo` / `mecanico123` (MECANICO)
- `carlos@oficina.demo` / `gestor123` (GESTOR)
- `ana@oficina.demo` / `admin123` (ADMINISTRADOR)
- `beatriz@oficina.demo` / `atendente123` (ATENDENTE — so cadastra clientes/veiculos e abre OS)

## 9. Como inspecionar o banco

```bash
docker compose exec postgres psql -U oficina -d oficina_demo
```

Consultas uteis:

```sql
select id, role, email from users order by email;
select id, title, status from work_orders order by id;
select id, file_name, status from media_assets order by created_at desc;
```

## 10. Fluxos fundamentais que merecem cuidado ao refatorar

Se o proximo desenvolvedor for refatorar, eu recomendaria preservar primeiro estes contratos:

1. login e filtro por perfil
2. upload de mídia e gravacao de metadados
3. publicacao do evento `media.uploaded`
4. consumo pelo worker
5. atualizacao do status da mídia

Esses cinco passos sustentam a demonstracao inteira.

## 11. Melhor ponto de extensao imediata

As evolucoes mais naturais daqui sao:

1. trocar sessoes em memoria por JWT ou sessao persistida
2. separar migrations SQL do seed
3. mover uploads locais para R2
4. adicionar mais endpoints de manutencao e comunicacao
5. melhorar a organizacao de dominios no backend

## 12. Comandos uteis do dia a dia

Subir ambiente:

```bash
docker compose up --build
```

Parar ambiente:

```bash
docker compose down
```

Resetar banco e volumes:

```bash
docker compose down -v
```

Rodar testes:

```bash
docker compose exec backend npm test
```

Build do frontend:

```bash
docker compose exec frontend npm run build
```
