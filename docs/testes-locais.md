# Testes locais passo a passo

Este roteiro foi pensado para a demonstracao da aplicacao em ambiente local com `Next.js`, `Express`, `PostgreSQL`, `RabbitMQ` e armazenamento local de arquivos.

## 1. Pre-requisitos

- Ubuntu 24.04
- Docker
- Docker Compose

## 2. Subir a stack

Na raiz do projeto:

```bash
docker compose up --build
```

Quando os containers estiverem prontos, a aplicacao fica disponivel em:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000/health`
- PostgreSQL: `localhost:5432`
- RabbitMQ: `http://localhost:15672`

Credenciais do painel RabbitMQ:

- usuario: `guest`
- senha: `guest`

Credenciais do PostgreSQL da demo:

- database: `oficina_demo`
- user: `oficina`
- password: `oficina123`

## 3. Contas de demonstracao

### Cliente

- email: `joao@oficina.demo`
- senha: `cliente123`

### Mecânico

- email: `maria@oficina.demo`
- senha: `mecanico123`

### Gestor

- email: `carlos@oficina.demo`
- senha: `gestor123`

### Administrador

- email: `ana@oficina.demo`
- senha: `admin123`

### Atendente

- email: `beatriz@oficina.demo`
- senha: `atendente123`

## 4. Fluxo sugerido para demonstracao

### Etapa A - entrar como cliente

1. Abrir `http://localhost:3000`
2. Entrar com a conta `joao@oficina.demo`
3. Confirmar que o portal mostra apenas a ordem `os-1001`
4. Validar que o cliente consegue:
   - ver status da ordem
   - ver orçamento
   - ver mensagens
   - acompanhar mídias da própria manutenção

Resultado esperado:

- o cliente nao deve ver a ordem `os-1002`
- o cliente nao deve ter permissao para upload de mídia

### Etapa B - entrar como mecânico

1. Sair da sessao atual
2. Entrar com `maria@oficina.demo`
3. Confirmar que o portal mostra apenas a ordem atribuída ao mecânico
4. Enviar 1 a 3 vídeos curtos ou imagens
5. Clicar em `Atualizar painel`

Resultado esperado:

- a mídia entra como `UPLOADED`
- o worker consome a fila `media.uploaded`
- a mídia passa por `PROCESSING`
- a mídia fica `PROCESSED`

### Etapa C - acompanhar fila e processamento

1. Abrir `http://localhost:15672`
2. Entrar com `guest / guest`
3. Acessar a fila `media.uploaded`
4. Confirmar que as mensagens aparecem e sao consumidas

Resultado esperado:

- a API publica os eventos de upload
- o worker consome os eventos em background

### Etapa C2 - validar persistencia relacional

1. Confirmar que o PostgreSQL subiu junto com a stack
2. Se quiser inspecionar o banco, rode:

```bash
docker compose exec postgres psql -U oficina -d oficina_demo
```

3. Dentro do `psql`, por exemplo:

```sql
select id, role, email from users order by role, email;
select id, title, status from work_orders order by id;
select id, file_name, status from media_assets order by created_at desc;
```

Resultado esperado:

- usuarios, ordens, mensagens e metadados de mídia ficam persistidos no PostgreSQL
- apenas os arquivos físicos continuam em `backend/uploads`

### Etapa D - entrar como gestor

1. Sair da sessao atual
2. Entrar com `carlos@oficina.demo`
3. Confirmar que o gestor visualiza `os-1001` e `os-1002`

Resultado esperado:

- o gestor enxerga todas as ordens
- o gestor consegue navegar entre ordens, mensagens e mídias

### Etapa E - entrar como administrador

1. Sair da sessao atual
2. Entrar com `ana@oficina.demo`
3. Confirmar que o administrador tambem visualiza todas as ordens

Resultado esperado:

- o administrador representa o perfil tecnico com acesso ampliado

### Etapa F - entrar como atendente

1. Sair da sessao atual
2. Entrar com `beatriz@oficina.demo`
3. Confirmar que a unica aba disponivel e "Cadastros"
4. Cadastrar um cliente, cadastrar um veiculo vinculado a ele e abrir uma OS para esse veiculo

Resultado esperado:

- a atendente nao ve as abas de Ordens, Linha do Tempo, Notificacoes, Estoque ou Auditoria
- apos abrir a OS, a atendente nao tem como acompanhar seu andamento (nao aparece em nenhuma lista de ordens para ela)

## 5. Testes simples por requisito funcional

### RF001 - autenticacao por login e senha

- entrar com email e senha validos
- tentar senha incorreta para validar erro

### RF002 e RF003 - perfis distintos e restricao por perfil

- cliente ve apenas sua ordem
- mecânico ve apenas ordem atribuida
- gestor e administrador veem todas as ordens

### RF004 - cliente ve apenas os próprios dados

- com `joao@oficina.demo`, a ordem visivel deve ser apenas `os-1001`

### RF005 - mecânico atualiza apenas ordens atribuídas

- com `maria@oficina.demo`, o upload deve funcionar na `os-1001`
- a `os-1002` nao deve aparecer para ela

### RF006 - gestor e administrador consultam todas as ordens

- com `carlos@oficina.demo` e `ana@oficina.demo`, as duas ordens devem estar visiveis

### RF019 a RF028 - envio e processamento de mídia

- enviar mídia pelo portal
- conferir arquivo no card da ordem
- conferir processamento assíncrono via worker/RabbitMQ
- conferir metadados persistidos na tabela `media_assets`

## 6. Reiniciar os dados da demo

Se quiser limpar a demonstracao:

1. pare os containers com `Ctrl + C` ou `docker compose down`
2. remova arquivos antigos em `backend/uploads`
3. remova o volume do banco:

```bash
docker compose down -v
```

4. suba novamente com `docker compose up --build`

## 7. Encerrar a stack

```bash
docker compose down
```
