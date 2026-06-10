# Guia de testes do MVP

Este documento separa os testes em duas trilhas:

- testes automatizados para validar as rotinas fundamentais
- testes manuais para demonstracao funcional e validacao visual

## 1. Testes automatizados

Os testes automatizados atuais focam no backend e cobrem o nucleo do MVP:

- health check
- login com credenciais validas
- login com credenciais invalidas
- protecao de rota autenticada
- filtro de ordens por perfil
- restricao de upload para cliente
- upload autenticado de mídia
- persistencia de metadados no PostgreSQL
- atualizacao de status interno de processamento

### Onde estão

- testes: [backend/tests/app.test.js](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/backend/tests/app.test.js)
- app testavel: [backend/src/create-app.js](/home/jrodrigues/Clone/Clone_Estagio/SistemasDistribuidos/sistemas-distribuidos/backend/src/create-app.js)

### Como executar

Com a stack no ar:

```bash
docker compose exec backend npm test
```

### Resultado esperado

- todos os testes devem ficar verdes
- os testes reinicializam os dados do banco para o seed padrao
- os testes usam um diretorio temporario para uploads de teste

### Observacao importante

Como os testes resetam o banco para o seed da demo, o ideal e rodar a suíte antes de gravar evidencias manuais para apresentacao ou, depois dos testes, reenviar as mídias de demonstração que você quiser mostrar.

## 2. Testes manuais

Os testes manuais servem para validar o fluxo de uso do portal e a historia da demonstracao.

### 2.1 Subir o ambiente

```bash
docker compose up --build
```

### 2.2 Login por perfil

#### Cliente

- email: `joao@oficina.demo`
- senha: `cliente123`

Validar:

- ve apenas `os-1001`
- nao pode enviar mídia

#### Mecânico

- email: `maria@oficina.demo`
- senha: `mecanico123`

Validar:

- ve apenas a ordem atribuida
- consegue anexar vídeo ou imagem

#### Gestor

- email: `carlos@oficina.demo`
- senha: `gestor123`

Validar:

- ve `os-1001` e `os-1002`
- consegue navegar entre ordens

#### Administrador

- email: `ana@oficina.demo`
- senha: `admin123`

Validar:

- ve todas as ordens
- representa o perfil de acesso ampliado

### 2.3 Upload e processamento

1. entrar como mecânico
2. enviar uma mídia para `os-1001`
3. atualizar o painel
4. abrir o RabbitMQ em `http://localhost:15672`
5. confirmar consumo da fila `media.uploaded`

Validar:

- arquivo aparece no portal
- status evolui para `PROCESSED`
- metadado aparece no PostgreSQL

### 2.4 Conferencia no PostgreSQL

```bash
docker compose exec postgres psql -U oficina -d oficina_demo
```

Exemplos:

```sql
select id, role, email from users order by email;
select id, title, status from work_orders order by id;
select id, file_name, status, uploaded_by from media_assets order by created_at desc;
```

### 2.5 Build do frontend

Para validar que o frontend continua pronto para publicacao estatica:

```bash
docker compose exec frontend npm run build
```

Resultado esperado:

- build finaliza com sucesso
- a pagina principal continua estatica

## 3. Ordem recomendada de validacao

Se o proximo desenvolvedor acabou de clonar o projeto, a melhor ordem e:

1. subir a stack
2. rodar testes automatizados
3. testar login e navegacao no browser
4. testar upload manual
5. validar RabbitMQ e PostgreSQL
6. validar build do frontend
