# Registro da implantacao na Azure

Este documento registra o que foi implantado, validado e confirmado no ambiente publicado na Azure para a demonstracao academica do projeto.

O objetivo deste registro e documentar a arquitetura realmente utilizada, as validacoes executadas e os limites conhecidos do ambiente, sem expor segredos, URLs privadas, tokens, IPs ou credenciais sensiveis.

## 1. Arquitetura publicada

O ambiente publicado ficou dividido em dois blocos principais:

```text
Usuario
  |
  +--> Frontend estatico
  |       Azure Static Web Apps
  |       HTTPS gerenciado pela plataforma
  |
  +--> API publica
          Azure VM Ubuntu 24.04 LTS
          Public IP com hostname cloudapp.azure.com
          Nginx com HTTPS (Let's Encrypt)
          Docker Compose
            - backend Express
            - PostgreSQL
            - RabbitMQ
            - media-worker
            - notification-worker
            - inventory-worker
            - audit-worker
```

## 2. Papel de cada componente

- `Azure Static Web Apps`: publica o frontend Next.js exportado estaticamente e entrega o portal via HTTPS.
- `Azure VM`: concentra a execucao do backend, broker, banco e workers.
- `Nginx`: funciona como reverse proxy da API publica e termina o TLS.
- `PostgreSQL`: persiste usuarios, ordens de servico, mensagens, metadados de midia, historico de etapas, notificacoes e auditoria.
- `RabbitMQ`: atua como barramento de eventos assincromos da aplicacao.
- `Workers`: consomem eventos do broker e executam processamento desacoplado do fluxo principal da API.

## 3. Arquitetura da API na VM

O backend nao fica exposto diretamente. O trafego chega assim:

```text
Cliente HTTPS
  -> Nginx na VM
  -> backend Express publicado localmente pelo Docker
  -> PostgreSQL / RabbitMQ na rede interna dos containers
```

Esse desenho permitiu:

- manter a API publica em `80/443`
- manter Postgres e RabbitMQ fora da exposicao publica
- adicionar certificado HTTPS sem alterar o backend

## 4. Persistencia de dados

### PostgreSQL

Os dados relacionais ficam persistidos em volume Docker nomeado.

Persistem apos reinicio dos containers:

- usuarios
- veiculos
- ordens de servico
- mecanicos vinculados
- mensagens
- midias e seus metadados
- historico de etapas
- solicitacoes de pecas
- notificacoes
- eventos de auditoria

### Midias

As midias fisicas, no estado atual da implantacao, ficam em disco local da VM.

Fluxo atual:

1. o backend recebe o upload
2. o arquivo e salvo em `backend/uploads`
3. os metadados sao gravados no PostgreSQL
4. o backend publica `media.uploaded`
5. o `media-worker` processa a fila e atualiza o status

Isso foi validado na pratica com reinicio completo da stack: os arquivos continuaram no disco e os registros permaneceram no banco.

## 5. RabbitMQ em uso

O RabbitMQ foi mantido como elemento central do projeto, inclusive no ambiente publicado.

### Exchanges declaradas

- `oficina.events` (`topic`)
- `oficina.broadcast` (`fanout`)
- `oficina.commands` (`direct`)
- `oficina.notifications` (`headers`)
- `oficina.dlx` (`topic`, dead letter)

### Filas e consumidores principais

- `media.uploaded` -> `media-worker`
- `q.notifications` -> `notification-worker`
- `q.inventory` -> `inventory-worker`
- `q.audit` -> `audit-worker`

### Eventos confirmados no fluxo principal

- `maintenance.step.updated`
- `media.uploaded`
- `media.processed`
- `parts.requested`
- `parts.reserved`
- `parts.outofstock`
- `parts.installed`
- `budget.created`
- `budget.approved`
- `budget.rejected`
- `budget.updated`
- `workorder.completed`

## 6. Validacoes confirmadas

As seguintes verificacoes foram executadas com sucesso:

- frontend publicado no Azure Static Web Apps
- API acessivel publicamente por HTTPS
- certificado TLS emitido e instalado no Nginx
- frontend consumindo a API publicada, sem dependencia de `localhost`
- resolucao do problema de `mixed content` entre frontend HTTPS e API
- `CORS_ORIGIN` ajustado para a origem publica do frontend
- login funcional no portal publicado
- listagem de ordens funcional
- avancos de etapa funcionando
- upload de midia funcionando
- consumo da fila pelo `media-worker`
- atualizacao de status de midia para `PROCESSED`
- persistencia dos arquivos apos reinicio da stack
- persistencia dos metadados no PostgreSQL apos reinicio da stack

## 7. Regras de rede e seguranca aplicadas

### Portas publicas

As portas publicas necessarias para o funcionamento do ambiente foram:

- `80/tcp`
- `443/tcp`

### Porta administrativa

- `22/tcp` restrita ao IP ou CIDR administrativo

### Portas nao expostas publicamente

- `5432` / `5433` PostgreSQL
- `5672` / `5673` RabbitMQ AMQP
- `15672` / `15673` RabbitMQ Management
- `4001` backend publicado localmente no host
- `3001` frontend containerizado de desenvolvimento

### Justificativa

O ambiente foi configurado para expor publicamente apenas a superficie minima necessaria ao uso do sistema, mantendo banco, broker e portas auxiliares fora da internet.

## 8. Trade-offs aceitos

Esta implantacao foi desenhada para demonstracao e estudo, nao para alta disponibilidade real.

Trade-offs aceitos:

- backend, PostgreSQL, RabbitMQ e workers concentrados em uma unica VM
- uploads ainda dependentes do disco local da instancia
- sem balanceador de carga gerenciado externo
- sem banco gerenciado
- sem armazenamento de midia em Azure Blob Storage ainda

Esses trade-offs foram aceitos para reduzir custo, complexidade operacional e tempo de implantacao, preservando o objetivo academico e o valor do laboratorio para estudo de Azure.

## 9. Evolucoes naturais

As proximas evolucoes tecnicamente coerentes para Azure sao:

- mover midias locais para Azure Blob Storage
- migrar PostgreSQL para servico gerenciado
- separar backend e workers em mais de uma instancia ou servico gerenciado
- adicionar observabilidade com Prometheus e Grafana
- endurecer seguranca de segredos e endpoints internos
