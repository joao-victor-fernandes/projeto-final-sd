Segue um resumo organizado para você mandar para outra IA analisar o projeto.

---

# Resumo do Projeto — Acompanhamento de Manutenção de Veículos

## 1. Contexto da disciplina

O projeto é da disciplina **XRSC09 — Sistemas Distribuídos**. A entrega final é em **02/07 até 23h59**, contendo:

* relatório técnico-científico em PDF, no template LaTeX, máximo 12 páginas;
* slides autoexplicativos;
* código-fonte do protótipo;
* tudo reunido no GitHub;
* link do GitHub incluído no relatório;
* upload do relatório no SIGAA.

O trabalho exige **projeto + protótipo funcional**, com frontend, backend e uso de mecanismos de comunicação ou coordenação característicos de sistemas distribuídos. A apresentação deve incluir modelagem, estrutura do código, bibliotecas usadas e demonstração do protótipo. 

O cenário sorteado do grupo é:

> **Acompanhamento de Manutenção de Veículos**

A ideia do cenário é uma oficina que deseja permitir que o cliente acompanhe o andamento do serviço em tempo real, com etapas como relato do problema, diagnóstico, identificação da causa, execução do reparo e possível rastreamento de peças. 

---

# 2. Ideia principal do projeto

A solução será apresentada como uma **plataforma distribuída para acompanhamento inteligente de manutenção veicular**.

A oficina teria:

* recepção;
* galpões ou baias de manutenção;
* câmeras por galpão/baia;
* terminais ou tablets para mecânicos;
* servidor local/gateway da oficina;
* backend central;
* banco de dados;
* storage de vídeos;
* RabbitMQ como barramento de eventos;
* workers especializados.

O cliente acompanharia pelo portal web/app:

* etapa atual da manutenção;
* histórico da ordem de serviço;
* fotos e vídeos;
* notificações;
* orçamento;
* peças utilizadas;
* relatório final.

---

# 3. Ideia de arquitetura-alvo

A arquitetura pensada é uma **arquitetura distribuída híbrida, em camadas e orientada a eventos**.

Ela combina:

1. **Cliente-servidor**
   Frontend conversa com backend via HTTP/REST.

2. **Arquitetura em camadas**
   Apresentação, aplicação e dados separados.

3. **Mensageria assíncrona com RabbitMQ**
   Backend publica eventos e workers consomem.

4. **Modelo híbrido oficina + nuvem**
   A oficina pode ter um servidor local para persistência temporária e sincronização com a nuvem.

---

# 4. Arquitetura geral proposta

```txt
┌──────────────────────────────────────────────┐
│                  OFICINA                     │
│                                              │
│  Recepção     Galpão 1      Galpão 2         │
│  Atendimento  Diagnóstico   Reparo           │
│      │           │            │              │
│      ▼           ▼            ▼              │
│  Terminal    Câmera IP    Câmera IP          │
│      │           │            │              │
│      └───────────┴─────┬──────┘              │
│                        ▼                     │
│        Servidor Local / Gateway da Oficina   │
│        - cache de vídeos                     │
│        - persistência temporária             │
│        - fila local em caso de queda         │
│        - sincronização com nuvem             │
└────────────────────────┬─────────────────────┘
                         │ Internet
                         ▼
┌──────────────────────────────────────────────┐
│              NUVEM / DATACENTER             │
│                                              │
│  ┌───────────────┐      ┌─────────────────┐  │
│  │ Backend API   │─────►│ PostgreSQL      │  │
│  │ Node/Express  │      │ dados/metadados │  │
│  └───────┬───────┘      └─────────────────┘  │
│          │                                   │
│          ├─────────────► Storage de vídeos   │
│          │                                   │
│          ▼                                   │
│  ┌───────────────────────────────────────┐   │
│  │               RabbitMQ                │   │
│  │        barramento de eventos          │   │
│  └───────┬────────┬────────┬─────────────┘   │
│          │        │        │                 │
│          ▼        ▼        ▼                 │
│   Media Worker  Notification  Inventory      │
│                 Worker        Worker         │
│          │        │        │                 │
│          └────────┴────────┘                 │
│                   ▼                          │
│            Atualiza Backend/Banco            │
└────────────────────────┬─────────────────────┘
                         │
                         ▼
              Portal Web/App do Cliente
```

---

# 5. Papel do RabbitMQ

A ideia mais importante levantada foi tratar o **RabbitMQ como barramento de eventos da oficina**.

Ou seja:

> Sempre que uma ação importante ocorre no processo de manutenção, o backend publica um evento no RabbitMQ. Workers especializados consomem esses eventos e executam tarefas assíncronas.

O RabbitMQ **não é acessado diretamente pelo cliente web**.

Fluxo correto:

```txt
Frontend → Backend → RabbitMQ → Workers
```

E não:

```txt
Frontend → RabbitMQ
```

O cliente recebe as informações pelo backend:

```txt
RabbitMQ → Worker → Banco/Backend → Frontend do Cliente
```

---

# 6. Eventos/canais sugeridos no RabbitMQ

| Evento / Canal                  | Quando acontece             | Quem publica              | Quem consome                           | Objetivo                               |
| ------------------------------- | --------------------------- | ------------------------- | -------------------------------------- | -------------------------------------- |
| `media.uploaded`                | Foto/vídeo é enviado        | Backend ou servidor local | Media Worker                           | Processar, validar ou armazenar mídia  |
| `maintenance.step.updated`      | Etapa da manutenção muda    | Backend                   | Notification, Audit, Dashboard Workers | Avisar mudança de etapa                |
| `client.notification.requested` | Cliente precisa ser avisado | Backend ou worker         | Notification Worker                    | Criar aviso no portal/email/WhatsApp   |
| `part.requested`                | Mecânico solicita peça      | Backend                   | Inventory Worker                       | Reservar ou verificar peça             |
| `part.installed`                | Peça é instalada            | Backend                   | Inventory, Audit, Billing Workers      | Baixar estoque e registrar histórico   |
| `budget.created`                | Orçamento é gerado          | Backend                   | Notification Worker                    | Avisar cliente sobre orçamento         |
| `budget.approved`               | Cliente aprova orçamento    | Backend                   | Maintenance/Inventory Workers          | Liberar reparo e separar peças         |
| `workorder.completed`           | Serviço é finalizado        | Backend                   | Notification, Report, Billing Workers  | Avisar cliente e gerar relatório final |

---

# 7. Workers sugeridos

| Worker                  | Função                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| **Media Worker**        | Processar/validar fotos e vídeos, gerar miniatura, compactar, mover para storage |
| **Notification Worker** | Criar notificações para cliente, mecânico ou gestor                              |
| **Inventory Worker**    | Controlar solicitação, reserva e baixa de peças                                  |
| **Audit Worker**        | Registrar histórico de eventos da ordem de serviço                               |
| **Report Worker**       | Gerar relatório final da manutenção                                              |
| **Billing Worker**      | Atualizar orçamento/fatura conforme peças e serviços                             |

A lógica é:

> Cada worker é independente. Se houver muitos vídeos, escala o Media Worker. Se houver muitas notificações, escala o Notification Worker.

---

# 8. Etapas principais da manutenção

Foi sugerido definir etapas fixas para a ordem de serviço:

```txt
1. Recepção
2. Relato do cliente
3. Diagnóstico
4. Orçamento
5. Aprovação do cliente
6. Separação de peças
7. Execução do reparo
8. Teste final
9. Conclusão
10. Entrega do veículo
```

Cada mudança de etapa pode gerar o evento:

```txt
maintenance.step.updated
```

Exemplo de evento:

```json
{
  "event": "maintenance.step.updated",
  "workOrderId": "OS-1001",
  "previousStep": "DIAGNOSTICO",
  "newStep": "ORCAMENTO",
  "updatedBy": "maria@oficina.demo",
  "timestamp": "2026-05-27T21:30:00"
}
```

---

# 9. Fluxo do mecânico

## Fluxo de negócio

```txt
Mecânico faz login no terminal da oficina
        ↓
Visualiza ordens atribuídas
        ↓
Seleciona uma ordem de serviço
        ↓
Consulta dados do cliente, veículo e relato inicial
        ↓
Inicia diagnóstico
        ↓
Sistema publica maintenance.step.updated
        ↓
Mecânico realiza testes
        ↓
Mecânico/câmera envia foto ou vídeo
        ↓
Backend publica media.uploaded
        ↓
Media Worker processa/valida mídia
        ↓
Mecânico registra diagnóstico técnico
        ↓
Gestor/atendente gera orçamento
        ↓
Cliente aprova orçamento
        ↓
Mecânico recebe liberação para reparo
        ↓
Mecânico solicita peça, se necessário
        ↓
Sistema publica part.requested
        ↓
Inventory Worker verifica/reserva peça
        ↓
Mecânico executa reparo
        ↓
Mecânico registra peça instalada e evidência
        ↓
Sistema publica part.installed e media.uploaded
        ↓
Mecânico realiza teste final
        ↓
Mecânico conclui serviço
        ↓
Sistema publica workorder.completed
        ↓
Cliente recebe atualização e relatório final
```

---

# 10. Fluxo do cliente

```txt
Cliente faz login no portal
        ↓
Visualiza suas ordens de serviço
        ↓
Seleciona a ordem do veículo
        ↓
Vê dados do veículo e relato inicial
        ↓
Acompanha etapa atual da manutenção
        ↓
Recebe notificação: “Diagnóstico iniciado”
        ↓
Visualiza fotos/vídeos do diagnóstico
        ↓
Recebe notificação: “Orçamento disponível”
        ↓
Consulta orçamento
        ↓
Aprova ou reprova orçamento
        ↓
Sistema publica budget.approved ou budget.rejected
        ↓
Cliente acompanha etapa “Em reparo”
        ↓
Visualiza evidências do reparo
        ↓
Recebe notificação: “Teste final iniciado”
        ↓
Recebe notificação: “Serviço concluído”
        ↓
Visualiza relatório final
        ↓
Agenda retirada ou confirma entrega do veículo
```

O cliente **não consome RabbitMQ diretamente**. Ele acessa tudo via portal:

```txt
Cliente → Portal → Backend → Banco/Storage → Portal exibe status, vídeos e notificações
```

---

# 11. Requisitos funcionais principais — Cliente

## Cliente — requisitos completos

* Fazer login no portal;
* visualizar veículos cadastrados;
* visualizar ordens de serviço;
* acompanhar etapa atual da manutenção;
* visualizar histórico de etapas;
* visualizar fotos e vídeos da manutenção;
* visualizar status das mídias;
* receber notificações de mudança de etapa;
* visualizar orçamento;
* aprovar ou reprovar orçamento;
* consultar peças utilizadas;
* visualizar relatório final;
* consultar histórico de manutenções;
* enviar mensagem/observação para a oficina;
* confirmar retirada do veículo.

## Cliente — MVP

Para o protótipo, o mínimo seria:

```txt
RF-C01 — Login do cliente
RF-C03 — Visualizar ordens de serviço
RF-C04 — Acompanhar etapa atual da manutenção
RF-C06 — Visualizar fotos e vídeos
RF-C07 — Visualizar status das mídias
RF-C08 — Ver notificações de mudança de etapa
```

---

# 12. Requisitos funcionais principais — Mecânico

## Mecânico — requisitos completos

* Fazer login no terminal/portal da oficina;
* visualizar ordens atribuídas;
* visualizar dados do veículo;
* iniciar diagnóstico;
* registrar diagnóstico técnico;
* atualizar etapa da manutenção;
* enviar fotos da manutenção;
* enviar vídeos da manutenção;
* associar mídia a uma etapa;
* visualizar status de processamento da mídia;
* solicitar peça ao estoque;
* registrar peça instalada;
* registrar observações técnicas;
* finalizar etapa de reparo;
* registrar teste final;
* concluir ordem de serviço;
* visualizar notificações internas;
* consultar histórico técnico da OS.

## Mecânico — MVP

Para o protótipo, o mínimo seria:

```txt
RF-M01 — Login do mecânico
RF-M02 — Visualizar ordens atribuídas
RF-M04 — Iniciar diagnóstico
RF-M06 — Atualizar etapa da manutenção
RF-M07 — Enviar fotos
RF-M08 — Enviar vídeos
RF-M10 — Visualizar status da mídia
RF-M16 — Concluir ordem de serviço
```

---

# 13. Protótipo atual

O grupo já tem um protótipo em ZIP/Git com a seguinte estrutura geral:

```txt
backend/
frontend/
worker/
docker-compose.yml
README.md
requisitos_funcionais.md
```

Ele usa:

* **Frontend:** Next.js;
* **Backend:** Node.js/Express;
* **Banco:** PostgreSQL;
* **Mensageria:** RabbitMQ;
* **Worker:** Node.js;
* **Execução:** Docker Compose.

O protótipo sobe com:

```bash
docker compose up --build
```

Serviços esperados:

```txt
frontend
backend
postgres
rabbitmq
worker
```

URLs:

```txt
Frontend: http://localhost:3000
Backend: http://localhost:4000/health
RabbitMQ UI: http://localhost:15672
```

RabbitMQ:

```txt
guest / guest
```

---

# 14. O que o protótipo faz hoje

O protótipo atual representa uma **fatia mínima da arquitetura completa**.

Fluxo atual:

```txt
Mecânico/Gestor/Admin faz login
        ↓
Visualiza ordem de serviço
        ↓
Envia foto ou vídeo da manutenção
        ↓
Backend salva arquivo localmente
        ↓
Backend registra metadados no PostgreSQL
        ↓
Backend publica evento media.uploaded no RabbitMQ
        ↓
Worker consome a mensagem
        ↓
Worker simula processamento da mídia
        ↓
Status muda para PROCESSING e depois PROCESSED
        ↓
Cliente consegue visualizar mídia/status no portal
```

Ponto importante:

> O worker atual **não processa o vídeo de verdade**. Ele simula o processamento alterando o status da mídia.

Forma correta de explicar:

> “No protótipo, o worker representa um serviço assíncrono de processamento. Ele consome eventos `media.uploaded` no RabbitMQ e simula o processamento da mídia, alterando seu status. Em uma versão futura, poderia compactar vídeo, gerar thumbnail, validar formato, mover para storage ou enviar notificação.”

---

# 15. O que o RabbitMQ faz hoje no protótipo

Hoje ele já faz algo real:

* recebe evento de upload de mídia;
* guarda a mensagem na fila `media.uploaded`;
* entrega essa mensagem para o worker;
* desacopla backend e processamento assíncrono.

Fluxo atual:

```txt
Backend → RabbitMQ → Worker
```

Ele ainda **não** faz:

* notificação ao cliente;
* atualização de etapa da manutenção;
* controle de peças;
* orçamento;
* auditoria;
* relatório.

Essas são extensões planejadas para a arquitetura completa.

---

# 16. O que implementar como próximo passo

Sugestão de evolução mais forte:

## 1. Implementar etapas da manutenção

Adicionar etapas como:

```txt
DIAGNOSTICO
ORCAMENTO
AGUARDANDO_APROVACAO
EM_REPARO
TESTE_FINAL
CONCLUIDO
```

## 2. Criar evento `maintenance.step.updated`

Quando mecânico alterar etapa:

```txt
Backend publica maintenance.step.updated
```

## 3. Criar `notification-worker`

Ele consome `maintenance.step.updated` e cria uma notificação para o cliente no banco.

Fluxo:

```txt
Mecânico muda etapa
        ↓
Backend salva no banco
        ↓
Backend publica maintenance.step.updated
        ↓
RabbitMQ entrega para notification-worker
        ↓
Worker cria notificação
        ↓
Cliente vê no portal
```

Esse seria o melhor próximo passo porque conecta diretamente o RabbitMQ com o problema central: **cliente acompanhando a manutenção**.

---

# 17. Modelo C4 sugerido

## C4 Nível 1 — Contexto

```txt
Cliente ───────┐
               │
Mecânico ──────┤
               ▼
Gestor ───► Sistema de Acompanhamento de Manutenção
               ▲
Atendente ─────┘
               │
               ▼
        Serviços externos
        - Storage de vídeos
        - Email/WhatsApp/SMS
        - Servidor local da oficina
        - Câmeras IP
```

## C4 Nível 2 — Containers

```txt
Portal Web Cliente
Portal Oficina
Backend API
PostgreSQL
RabbitMQ
Workers Assíncronos
Storage de vídeos
Servidor Local/Gateway
```

## C4 Nível 3 — Componentes do backend

```txt
Backend API
├── AuthController
├── WorkOrderController
├── VehicleController
├── MaintenanceStepController
├── MediaController
├── BudgetController
├── InventoryController
├── NotificationController
└── EventPublisher
```

O componente mais importante para a mensageria é:

```txt
EventPublisher
```

Ele publica eventos no RabbitMQ.

---

# 18. Modelo de implantação sugerido

A melhor opção para defender é **arquitetura híbrida**:

```txt
Oficina local + Nuvem
```

Fluxo:

```txt
Câmeras/Terminais
        ↓
Servidor local da oficina
        ↓
Internet
        ↓
Backend central em nuvem
        ↓
RabbitMQ / PostgreSQL / Storage / Workers
        ↓
Portal do cliente
```

Justificativa:

> A arquitetura híbrida permite que a oficina continue registrando vídeos e eventos mesmo se houver instabilidade na internet. O servidor local mantém persistência temporária e sincroniza com a nuvem quando a conexão estiver disponível.

---

# 19. Persistência de vídeos

A ideia sugerida:

```txt
Vídeo bruto:
- fica temporariamente no servidor local da oficina

Vídeo definitivo:
- vai para storage em nuvem ou storage dedicado

Banco PostgreSQL:
- guarda apenas metadados
```

Metadados da mídia:

```txt
id da mídia
id da ordem de serviço
id da etapa
nome do arquivo
tipo do arquivo
URL/caminho
status
data de envio
usuário responsável
data de processamento
checksum
```

Frase importante:

> “Os vídeos não são armazenados diretamente no banco relacional. O banco guarda apenas os metadados, enquanto o conteúdo da mídia fica em storage local ou em nuvem.”

---

# 20. Narrativa para a apresentação

A melhor forma de apresentar:

> “A solução completa foi pensada como uma arquitetura distribuída híbrida e orientada a eventos. A oficina possui câmeras e terminais que enviam informações para um servidor local. Esse servidor sincroniza com o backend central em nuvem. O backend mantém os dados das ordens, clientes, veículos, etapas e mídias. O RabbitMQ atua como barramento de eventos, desacoplando serviços como processamento de mídia, notificações, estoque, auditoria e relatórios. O protótipo implementa uma fatia dessa arquitetura: frontend, backend, PostgreSQL, RabbitMQ e worker de mídia.”

Frase sobre o protótipo:

> “O protótipo não implementa toda a oficina inteligente, mas demonstra o núcleo técnico da arquitetura distribuída: separação entre frontend, backend, banco, broker de mensagens e worker assíncrono.”

Frase sobre RabbitMQ:

> “O RabbitMQ é usado como barramento de eventos. Cada ação relevante da manutenção gera um evento, e workers especializados reagem a esses eventos de forma assíncrona.”

---

# 21. Pontos principais para outra IA analisar

Peça para a outra IA avaliar:

1. Se a arquitetura híbrida oficina + nuvem faz sentido;
2. Se o uso do RabbitMQ como barramento de eventos está bem justificado;
3. Se os eventos propostos são coerentes;
4. Se o modelo C4 está bem dividido;
5. Se os fluxos de mecânico e cliente estão claros;
6. Se os requisitos funcionais de cliente e mecânico estão completos;
7. Se o protótipo atual é suficiente como MVP;
8. Se vale implementar `maintenance.step.updated` e `notification-worker` como próximo passo;
9. Como melhorar o modelo de negócio;
10. Como transformar isso em relatório e slides de forma convincente.
