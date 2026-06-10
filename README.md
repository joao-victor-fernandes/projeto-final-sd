# Plataforma Distribuida para Acompanhamento de Manutencao Veicular

**Projeto Final XRSC09 - Sistemas Distribuidos** - Junho de 2026

Plataforma distribuida orientada a eventos sobre RabbitMQ, com arquitetura hibrida edge-cloud, para acompanhamento em tempo real do servico de manutencao veicular. O cliente acompanha as etapas (relato, diagnostico, identificacao da causa, execucao do reparo) por um portal web, e o sistema desacopla o processamento de midia, controle de pecas, notificacoes e auditoria em workers especializados que reagem a eventos do broker.

## Arquitetura em uma frase

Cinco exchanges RabbitMQ (Topic, Fanout, Direct, Headers, DLX) servem como barramento de eventos do dominio; quatro workers especializados consomem padroes diferentes; PostgreSQL armazena metadados; portal Next.js autentica por papel.

## Stack

| Componente | Tecnologia |
|---|---|
| Frontend | Next.js 14 + React 18 |
| Backend | Node.js 20 + Express 4 + amqplib |
| Banco | PostgreSQL 16 |
| Broker | RabbitMQ 3 (management UI) |
| Workers | 4x Node.js (media, notification, inventory, audit) |
| Orquestracao | Docker Compose |

## Subir tudo localmente

Requisitos: Docker Desktop ou Docker Engine + Docker Compose.

```bash
docker compose up --build
```

URLs apos subir:

- Frontend: http://localhost:3000
- Backend: http://localhost:4000/health
- RabbitMQ Management: http://localhost:15672 (usuario `guest`, senha `guest`)
- PostgreSQL: localhost:5432 (db `oficina_demo`, user `oficina`, senha `oficina123`)

Para limpar o estado completo:

```bash
docker compose down -v
```

## Contas de demonstracao

| Perfil | E-mail | Senha |
|---|---|---|
| CLIENTE | joao@oficina.demo | cliente123 |
| MECANICO | maria@oficina.demo | mecanico123 |
| GESTOR | carlos@oficina.demo | gestor123 |
| ADMINISTRADOR | ana@oficina.demo | admin123 |
| CLIENTE (2) | fernanda@oficina.demo | cliente234 |
| MECANICO (2) | paulo@oficina.demo | mecanico234 |

## Fluxos para testar

1. **Login como mecanico** (`maria@oficina.demo`) e selecionar a OS `os-1001`.
2. **Avancar etapa** - clicar nos botoes de transicao. Cada transicao publica `maintenance.step.updated`.
3. **Solicitar peca** - escolher uma peca do almoxarifado. O `inventory-worker` reserva, o `notification-worker` avisa.
4. **Enviar midia** - fazer upload de imagens/videos. O `media-worker` muda status `UPLOADED -> PROCESSING -> PROCESSED`.
5. **Trocar para o cliente** (`joao@oficina.demo`) e ver a linha do tempo, notificacoes e midias.
6. **Abrir RabbitMQ UI** em localhost:15672 e olhar `Queues` para ver as mensagens fluindo.

## Estrutura do projeto

```
projeto_final/
├── backend/                  Express API (REST)
│   └── src/
│       ├── server.js          ponto de entrada
│       ├── create-app.js      rotas e middlewares
│       ├── store.js           acesso ao PostgreSQL
│       ├── rabbit.js          camada de mensageria (5 exchanges)
│       └── steps.js           maquina de estados
├── worker/                   media-worker
├── notification-worker/      assina maintenance.#, parts.*, budget.*, ...
├── inventory-worker/         assina parts.requested
├── audit-worker/             assina # (universal)
├── frontend/                 Next.js portal
├── docker-compose.yml
├── scripts/smoke-test.sh
└── docs/
    ├── diagrams/             SVG + PDF + PNG
    ├── relatorio/            LaTeX + PDF
    └── slides/               PPTX + PDF
```

## RabbitMQ - exchanges

| Exchange | Tipo | Uso |
|---|---|---|
| oficina.events | Topic | Hub principal de eventos do dominio |
| oficina.broadcast | Fanout | Avisos globais |
| oficina.commands | Direct | Comandos diretos a um worker |
| oficina.notifications | Headers | Roteia por canal preferido |
| oficina.dlx | Topic (DLX) | Dead letter para retry/inspecao |

## RabbitMQ - filas

| Fila | Worker | Pattern de bind |
|---|---|---|
| media.uploaded | media-worker | media.uploaded |
| q.notifications | notification-worker | 7 padroes |
| q.inventory | inventory-worker | parts.requested |
| q.audit | audit-worker | # |

Catalogo de eventos publicados pelo backend: ver `backend/src/rabbit.js` (`ROUTING_KEYS`).

## Documentacao

- **Relatorio tecnico** (12 paginas, LaTeX): `docs/relatorio/relatorio.pdf`
- **Slides** (20 slides, PPTX + PDF): `docs/slides/slides.pptx`
- **Diagramas** (SVG + PDF + PNG): `docs/diagrams/`

## Smoke test

Depois da stack no ar:

```bash
bash scripts/smoke-test.sh
```

## Licenca

Projeto academico - XRSC09.
