# Publicacao fora do localhost

Este documento descreve um caminho simples para sair do ambiente local e publicar a demo usando:

- Cloudflare Pages para o frontend
- Cloudflare DNS para o dominio
- Cloudflare R2 para arquivos
- AWS EC2 para backend e worker
- PostgreSQL na AWS EC2 para a primeira versao demonstravel

## 1. Arquitetura recomendada

### Ambiente de apresentacao

```text
Usuario
  |
  +--> app.seudominio.com -> Cloudflare Pages
  |
  +--> api.seudominio.com -> Cloudflare DNS proxied -> EC2
                                   |
                                   +--> Nginx
                                   +--> Backend Express
                                   +--> Worker
                                   +--> RabbitMQ
                                   +--> PostgreSQL
                                   +--> disco local para uploads
                                   +--> R2 (evolucao futura das midias)
```

### Responsabilidade de cada componente

- `Cloudflare Pages`: publica o frontend estatico
- `Cloudflare DNS`: aponta `app` e `api`
- `EC2`: hospeda backend, worker, RabbitMQ e PostgreSQL da demo
- `PostgreSQL`: persiste usuarios, ordens, mensagens e metadados de mídia
- `uploads` locais: guardam os arquivos físicos nesta versao
- `R2`: proxima evolucao para arquivos fora da instancia

## 2. Ajustes no frontend para Cloudflare Pages

O frontend desta demo foi ajustado para conversar direto com a API. Isso ajuda porque o Pages pode publicar o portal como site estático.

### Variavel importante

No Cloudflare Pages, defina:

```text
NEXT_PUBLIC_API_BASE_URL=https://api.seudominio.com
```

## 3. Publicar o frontend no Cloudflare Pages

### Passo a passo

1. Suba o repositório para GitHub ou GitLab
2. No painel da Cloudflare, vá em `Workers & Pages`
3. Crie um projeto Pages importando o repositório
4. Escolha o preset de build de `Next.js (Static HTML Export)`
5. Configure:
   - Build command: `npx next build`
   - Build output directory: `out`
6. Adicione a variável `NEXT_PUBLIC_API_BASE_URL`
7. Faça o deploy

Documentação oficial:

- Cloudflare Pages para Next.js estático: https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/
- Build configuration: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Variáveis e bindings no Pages: https://developers.cloudflare.com/pages/functions/bindings/

## 4. Configurar dominio no Cloudflare

### Frontend

- `app.seudominio.com` -> domínio do projeto Pages

### API

- `api.seudominio.com` -> registro `A` apontando para o IP publico da EC2
- deixe `Proxy status` como `Proxied` para usar a borda da Cloudflare

Documentação oficial:

- Custom domains no Pages: https://developers.cloudflare.com/pages/configuration/custom-domains/
- Criar registros DNS: https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/
- Criar subdominios: https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-subdomain/

## 5. Subir backend e worker na AWS EC2

### Abordagem mais simples para a demo

Use uma instancia EC2 Ubuntu 24.04 com Docker e Docker Compose.

### Passo a passo sugerido

1. Criar a EC2
2. Associar um Security Group
3. Liberar pelo menos:
   - `22/tcp` para seu IP
   - `80/tcp` para HTTP
   - `443/tcp` para HTTPS
4. Instalar Docker e Docker Compose na EC2
5. Clonar o projeto
6. Configurar variáveis de ambiente do backend
7. Subir backend, worker, RabbitMQ e PostgreSQL com Docker Compose
8. Colocar Nginx na frente da API

Documentação oficial:

- EC2 security groups: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html
- Criar security group: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html

## 6. PostgreSQL na EC2 para a primeira versao

Para a primeira entrega, vocês podem manter PostgreSQL na mesma EC2 para reduzir custo e complexidade. A demo local ja usa PostgreSQL como persistencia principal, entao o caminho para a EC2 fica mais fiel ao ambiente de apresentacao.

### Cuidados mínimos

- nao exponha a porta `5432` publicamente
- permita acesso ao banco apenas localmente ou pela rede Docker interna
- use usuario e senha em variáveis de ambiente
- mantenha volume persistente
- aplique backup simples do volume ou dump periodico

Documentação oficial:

- Ubuntu 24.04 e PostgreSQL: https://ubuntu.com/server/docs/how-to/databases/install-postgresql/
- Download oficial PostgreSQL para Ubuntu: https://www.postgresql.org/download/linux/ubuntu

## 7. Mantendo uploads locais nesta fase

Nesta etapa, os arquivos físicos podem continuar locais na EC2 para simplificar a implantacao.

### Cuidados mínimos

- monte um volume persistente para `backend/uploads`
- nao salve uploads apenas no filesystem efemero do container
- mantenha o caminho de uploads fora da imagem
- registre apenas os metadados no PostgreSQL

## 8. Evolução futura para Cloudflare R2

Quando quiser tirar os uploads da EC2:

1. Criar bucket no R2
2. Criar token de API do R2
3. Configurar no backend:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
   - `R2_ENDPOINT`
4. Substituir a gravação local por upload usando SDK S3 compatível
5. Manter o RabbitMQ após o upload para processar o evento de mídia

### Observacao importante

Para demonstracao acadêmica, dá para manter o fluxo:

1. backend recebe a mídia
2. backend grava o arquivo localmente ou envia ao R2
3. backend grava metadados no PostgreSQL
4. backend publica evento `media.uploaded`
5. worker processa em segundo plano

Documentação oficial:

- R2 com API S3 compatível: https://developers.cloudflare.com/r2/get-started/s3/
- Tokens do R2: https://developers.cloudflare.com/r2/api/tokens/
- Presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

## 9. Ajustes de CORS e origem

Quando o frontend sair do localhost e for para `app.seudominio.com`, o backend deve permitir essa origem.

### Exemplo de ambiente

```text
CORS_ORIGIN=https://app.seudominio.com
```

No backend, o ideal é trocar o `cors()` aberto por uma lista controlada de origens.

## 10. O que manter igual entre localhost e nuvem

Mesmo quando vocês mudarem de ambiente, o fluxo central deve continuar:

1. login no portal
2. consulta das ordens conforme o perfil
3. upload da mídia
4. registro da mídia no PostgreSQL
5. publicação no RabbitMQ
6. processamento assíncrono pelo worker
7. visualização pelo cliente

## 11. Ordem prática de implantação

Se eu estivesse levando esta demo para fora do localhost agora, eu faria assim:

1. publicar frontend no Cloudflare Pages
2. criar `api.seudominio.com` no Cloudflare DNS
3. subir EC2 com Docker
4. publicar backend + worker + RabbitMQ + PostgreSQL na EC2
5. montar volume persistente para `uploads`
6. apontar `NEXT_PUBLIC_API_BASE_URL` do Pages para a API publica
7. validar login e listagem de ordens
8. validar upload local e processamento da fila
9. migrar os uploads para R2 quando o fluxo estiver estavel

## 12. Limite honesto desta primeira publicacao

Para a demo acadêmica, uma unica EC2 resolve. Mas vale registrar na documentacao e na apresentacao:

- esta implantacao nao é redundante
- RabbitMQ, backend e PostgreSQL ainda estao concentrados na mesma instancia
- os uploads ainda dependem do disco local da EC2
- a arquitetura foi separada para facilitar evolucao futura

Essa explicação é tecnicamente correta e combina bem com o escopo do projeto.
