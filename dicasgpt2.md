# Prompt Enviado

Para demonstração, gostariamos de ter o sistema funcionando. Gostariamos de testar com 3 vídeos, por exemplo. Como podemos testar isto?

----


## O que vocês realmente precisam demonstrar

Para o professor, basta mostrar que o sistema consegue:

1. cadastrar uma ordem de serviço
2. vincular um veículo e um cliente
3. enviar 3 vídeos para essa ordem
4. armazenar os arquivos fora da aplicação
5. registrar metadados no banco
6. exibir os vídeos no painel do cliente
7. usar RabbitMQ em pelo menos uma etapa assíncrona real

Isso já sustenta muito bem a proposta.

---

# Melhor forma de testar com 3 vídeos

## Estratégia recomendada

Use este fluxo:

1. o mecânico acessa a OS
2. seleciona um vídeo
3. o frontend envia o arquivo para a API
4. a API salva o arquivo no R2
5. a API grava no banco o registro da mídia
6. a API publica uma mensagem no RabbitMQ
7. um worker consome essa mensagem e muda o status da mídia para `PROCESSADO`
8. o cliente entra no portal e vê os 3 vídeos disponíveis

## Por que isso é bom

Porque vocês demonstram:

* backend
* banco
* object storage
* fila
* processamento assíncrono
* consulta pelo cliente

Sem precisar fazer nada extravagante.

---

# Como implementar do jeito mais simples

## Modelo de banco

Uma tabela `media_assets` já resolve.

Exemplo:

```sql
CREATE TABLE media_assets (
  id SERIAL PRIMARY KEY,
  work_order_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  content_type VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Status possíveis

* `PENDING`
* `UPLOADED`
* `PROCESSING`
* `PROCESSED`
* `FAILED`

---

# Fluxo de teste mais prático

## Cenário

Criem uma OS fictícia:

* Cliente: João Silva
* Veículo: Gol 1.6 2018
* OS: troca de freios e revisão
* 3 vídeos:

  * `video1.mp4` -> inspeção inicial
  * `video2.mp4` -> desmontagem
  * `video3.mp4` -> montagem final

## Passo a passo

### 1. Cadastrar cliente, veículo e OS

Pode ser manual no banco ou por tela.

### 2. Enviar 3 vídeos pequenos

Não usem vídeos grandes.
Para demo, usem arquivos curtos:

* 10 a 30 segundos
* resolução 720p ou menor
* tamanho de 5 MB a 20 MB cada

Assim evita travar upload e simplifica tudo.

### 3. Salvar no R2 com chave organizada

Por exemplo:

```text
work-orders/123/video1.mp4
work-orders/123/video2.mp4
work-orders/123/video3.mp4
```

### 4. Gravar no banco

Após upload:

```json
{
  "work_order_id": 123,
  "file_name": "video1.mp4",
  "object_key": "work-orders/123/video1.mp4",
  "status": "UPLOADED"
}
```

### 5. Publicar no RabbitMQ

Exemplo de mensagem:

```json
{
  "event": "media.uploaded",
  "mediaId": 10,
  "workOrderId": 123,
  "objectKey": "work-orders/123/video1.mp4",
  "uploadedAt": "2026-04-08T15:30:00Z"
}
```

### 6. Worker consome a fila

O worker faz algo simples, por exemplo:

* busca a mídia no banco
* muda status para `PROCESSING`
* espera 2 segundos
* muda para `PROCESSED`

Só isso já comprova o uso da fila.

Se quiserem, podem adicionar uma lógica simples:

* validar se o arquivo existe no R2
* salvar tamanho do arquivo
* registrar log

### 7. Painel do cliente lista as mídias

A API retorna:

```json
[
  {
    "id": 10,
    "fileName": "video1.mp4",
    "status": "PROCESSED",
    "url": "https://..."
  }
]
```

No frontend, exibir com `<video controls>` já basta.

---

# Como mostrar isso ao professor

## Roteiro ideal da demo

### Parte 1 — Upload do mecânico

* abrir OS
* anexar 3 vídeos
* mostrar que os vídeos entram como `UPLOADED`

### Parte 2 — RabbitMQ

* abrir painel do RabbitMQ ou logs do worker
* mostrar que foram publicadas 3 mensagens
* mostrar o worker consumindo
* mostrar mudança de status para `PROCESSED`

### Parte 3 — Visão do cliente

* logar como cliente
* abrir a OS
* ver os 3 vídeos disponíveis
* reproduzir cada um

Isso já fecha perfeitamente a narrativa.

---

# Teste técnico mínimo que eu faria

## Teste 1 — Upload simples

Objetivo: garantir que o arquivo chega no R2 e o banco registra.

Validar:

* arquivo existe no bucket
* registro existe no banco
* status inicial correto

## Teste 2 — Fila funcionando

Objetivo: garantir que o RabbitMQ realmente está sendo usado.

Validar:

* backend publica mensagem
* worker consome mensagem
* status da mídia muda no banco

## Teste 3 — Consulta do cliente

Objetivo: provar que o cliente consegue assistir.

Validar:

* API lista mídias da OS
* frontend renderiza os vídeos
* vídeo abre normalmente no navegador

## Teste 4 — Falha controlada

Objetivo: mostrar resiliência.

Exemplo:

* desligar o worker
* fazer upload de vídeo
* mostrar que o backend continua funcionando
* mostrar que a mídia fica pendente
* religar o worker
* mostrar o reprocessamento

Esse teste impressiona mais do que parece.

---

# Não compliquem com isso agora

Para demo com 3 vídeos, eu **não** implementaria agora:

* streaming HLS/DASH
* transcodificação FFmpeg
* thumbnails obrigatórios
* upload multipart
* CDN avançada de vídeo
* processamento com IA
* websocket em tempo real

Tudo isso é bonito, mas dispersa.

---

# Melhor arquitetura de teste para vocês

## Opção simples

Uma EC2 com:

* Nginx
* backend
* PostgreSQL
* RabbitMQ
* worker

E fora dela:

* Cloudflare Pages
* Cloudflare R2

## Fluxo de teste

```text
Frontend -> Backend -> R2
                 |
                 v
              PostgreSQL
                 |
                 v
              RabbitMQ
                 |
                 v
               Worker
```

---

# Duas formas de upload

## Forma 1 — mais simples de implementar

Frontend envia o vídeo para o backend, e o backend envia para o R2.

### Vantagem

* mais fácil para demo

### Desvantagem

* backend vira intermediário do arquivo

Para 3 vídeos, isso é aceitável.

## Forma 2 — mais correta arquiteturalmente

Backend gera URL assinada, e o frontend envia direto ao R2.

### Vantagem

* mais escalável
* arquitetura mais elegante

### Desvantagem

* mais trabalho

### Minha recomendação

Para a apresentação acadêmica, se o tempo estiver curto:
**usem a Forma 1.**

---

# Exemplo de fluxo de processamento com RabbitMQ

## Backend

Após upload:

* salva metadado
* publica mensagem

## Worker

Ao consumir:

* altera status para `PROCESSING`
* valida arquivo no R2
* altera status para `PROCESSED`

## O que isso prova

Que o RabbitMQ foi usado para desacoplar o upload do processamento.

---

# Como simular “processamento” sem complicar

Se vocês não quiserem implementar thumbnail/transcodificação, façam o worker executar alguma tarefa simples, como:

* ler metadados do vídeo
* salvar tamanho do arquivo
* salvar timestamp do processamento
* atualizar status
* registrar log de auditoria

Exemplo de resultado na tabela:

```sql
ALTER TABLE media_assets
ADD COLUMN processed_at TIMESTAMP NULL,
ADD COLUMN file_size_bytes BIGINT NULL;
```

Aí o worker:

* consulta o objeto no R2
* pega o tamanho
* salva no banco
* marca como processado

Pronto. Já existe trabalho assíncrono real.

---

# O que responder se o professor perguntar “cadê a escalabilidade?”

Vocês podem dizer:

> “Na demonstração usamos apenas 3 vídeos e uma única instância por restrição de custo. Mas a arquitetura já desacopla armazenamento, processamento assíncrono e aplicação. Em um cenário real, poderíamos escalar horizontalmente os workers e as instâncias da API sem alterar a lógica central.”

Isso é uma resposta técnica boa.

---

# Meu plano recomendado para vocês

## Escopo mínimo da demo

Implementem apenas isto:

### Entidades

* usuário
* veículo
* ordem de serviço
* mídia
* mensagem/chat

### Funcionalidades

* login simples
* criar ordem de serviço
* upload de 3 vídeos
* salvar no R2
* registrar no PostgreSQL
* enviar evento para RabbitMQ
* worker processar
* cliente visualizar vídeos

---

# Cenário de apresentação pronto

## Mecânico

* entra na OS 123
* sobe 3 vídeos
* sistema mostra “enviado com sucesso”

## Sistema

* worker processa mensagens
* status muda para processado

## Cliente

* entra na plataforma
* abre OS 123
* vê vídeos
* assiste evidência da manutenção

Isso comunica perfeitamente o valor do sistema.

---

# Resumo objetivo

Para testar com 3 vídeos:

1. usem vídeos curtos e pequenos
2. armazenem no R2
3. salvem metadados no PostgreSQL
4. publiquem evento `media.uploaded` no RabbitMQ
5. criem um worker que marque a mídia como `PROCESSED`
6. listem os vídeos no painel do cliente com player HTML simples

Esse é o melhor equilíbrio entre:

* baixo custo
* baixa complexidade
* prova de conceito funcional
* uso real de sistema distribuído

Se quiser, eu monto agora um **fluxo de endpoints + filas + tabelas** para vocês implementarem exatamente essa demo.
