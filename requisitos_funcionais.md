# Documento Inicial de Requisitos

## 1. Objetivo do documento

Este documento tem como objetivo registrar os requisitos funcionais e não funcionais iniciais do sistema de gestão para oficina mecânica, com foco em transparência do serviço prestado, acompanhamento da manutenção do veículo e comunicação entre cliente, mecânico e gestor da oficina.

Este documento é inicial e evolutivo. Os requisitos aqui descritos deverão ser refinados, alterados, removidos ou complementados conforme o entendimento da regra de negócio avançar.

---

## 2. Visão geral do sistema

O sistema proposto é uma plataforma web para gestão de ordens de serviço de uma oficina mecânica. Seu principal diferencial é permitir que o cliente acompanhe evidências visuais do serviço realizado em seu veículo, por meio de vídeos e fotos, reduzindo a desconfiança sobre a execução da manutenção e melhorando a compreensão sobre inspeções, diagnóstico e orçamento.

A solução deverá atender, inicialmente, três perfis principais:

* **Cliente**: acompanha ordens de serviço, visualiza vídeos/fotos, consulta orçamento e interage com a oficina.
* **Mecânico**: registra evidências do serviço executado, atualiza o andamento do trabalho e se comunica com o cliente por meio da plataforma.
* **Gestor / Dono da oficina**: acompanha ordens, desempenho da equipe, histórico de atendimentos, avaliações e informações operacionais da oficina.

---

## 3. Escopo inicial do produto

O escopo inicial considera um MVP funcional e demonstrável, com foco nos seguintes pontos:

* cadastro e consulta de ordens de serviço;
* vínculo entre cliente, veículo e ordem de serviço;
* upload e armazenamento de vídeos/fotos da manutenção;
* visualização de evidências pelo cliente;
* registro e consulta de orçamento;
* comunicação básica entre cliente e oficina dentro da ordem de serviço;
* processamento assíncrono de eventos de mídia por meio de RabbitMQ;
* controle administrativo mínimo para acompanhamento das operações.

Itens como emissão fiscal real, integrações governamentais, automações avançadas, analytics sofisticado e comunicação em tempo real podem existir futuramente, mas não fazem parte do escopo mínimo obrigatório da primeira entrega.

---

## 4. Perfis de usuário

### 4.1 Cliente

Usuário responsável por acompanhar a manutenção do próprio veículo, consultar orçamento, visualizar mídias do serviço e interagir com a oficina.

### 4.2 Mecânico

Usuário responsável por executar a manutenção, registrar evidências do serviço e atualizar o andamento da ordem de serviço.

### 4.3 Gestor / Dono da oficina

Usuário com visão operacional e gerencial do sistema, responsável por acompanhar a oficina, administrar ordens, visualizar histórico, monitorar desempenho e consultar dados consolidados.

### 4.4 Administrador do sistema

Perfil técnico ou administrativo com permissões ampliadas para gestão de usuários, permissões e parâmetros do sistema.

### 4.5 Atendente

Usuário de recepção/balcão responsável apenas pelo cadastro inicial: registrar novos clientes (e seus veículos) e abrir ordens de serviço. Após a abertura da OS, a atendente **não** acompanha seu andamento, não visualiza etapas, orçamento, mídias, estoque ou auditoria — o acompanhamento passa a ser responsabilidade do mecânico, do cliente e do gestor/administrador.

---

## 5. Requisitos funcionais

## 5.1 Autenticação e acesso

**RF001.** O sistema deve permitir autenticação de usuários por login e senha.

**RF002.** O sistema deve permitir perfis de acesso distintos, no mínimo: cliente, mecânico, gestor, administrador e atendente.

**RF003.** O sistema deve restringir funcionalidades conforme o perfil do usuário autenticado.

**RF004.** O sistema deve permitir que o cliente visualize apenas as ordens de serviço e informações relacionadas aos seus próprios veículos.

**RF005.** O sistema deve permitir que o mecânico visualize e atualize apenas ordens de serviço atribuídas a ele, salvo permissões superiores.

**RF006.** O sistema deve permitir que gestor e administrador consultem todas as ordens de serviço da oficina.

**RF006-A.** O sistema deve permitir que a atendente autentique-se e acesse exclusivamente as funcionalidades de cadastro de clientes/veículos e abertura de ordens de serviço.

**RF006-B.** O sistema não deve permitir que a atendente visualize ou acompanhe ordens de serviço já criadas, nem acesse estoque, orçamento, mídias ou auditoria.

---

## 5.2 Cadastro de usuários e veículos

**RF007.** O sistema deve permitir o cadastro de clientes, inclusive por atendentes de recepção.

**RF008.** O sistema deve permitir o cadastro de mecânicos.

**RF009.** O sistema deve permitir o cadastro de veículos, contendo no mínimo dados de identificação, proprietário e informações básicas do automóvel.

**RF010.** O sistema deve permitir vincular um ou mais veículos a um cliente.

**RF011.** O sistema deve permitir consultar o histórico de atendimentos de um veículo.

---

## 5.3 Ordens de serviço

**RF012.** O sistema deve permitir criar uma ordem de serviço vinculada a um cliente e a um veículo, inclusive por atendentes de recepção.

**RF013.** O sistema deve permitir registrar dados básicos da ordem de serviço, como descrição do problema, data de abertura, status e responsável técnico.

**RF014.** O sistema deve permitir atualizar o status da ordem de serviço.

**RF015.** O sistema deve permitir consultar o histórico de alterações da ordem de serviço.

**RF016.** O sistema deve permitir vincular um ou mais mecânicos a uma ordem de serviço.

**RF017.** O sistema deve permitir encerrar uma ordem de serviço.

**RF018.** O sistema deve permitir consultar ordens de serviço por filtros como cliente, veículo, status, período e responsável.

---

## 5.4 Registro de evidências em foto e vídeo

**RF019.** O sistema deve permitir que o mecânico envie fotos e vídeos relacionados a uma ordem de serviço.

**RF020.** O sistema deve permitir associar cada mídia a uma ordem de serviço específica.

**RF021.** O sistema deve registrar metadados da mídia, incluindo nome do arquivo, tipo, data de envio, usuário responsável e referência da ordem de serviço.

**RF022.** O sistema deve armazenar as mídias de forma persistente fora do banco relacional principal.

**RF023.** O sistema deve permitir que o cliente visualize as mídias relacionadas à sua ordem de serviço.

**RF024.** O sistema deve permitir que gestor e administrador consultem todas as mídias vinculadas às ordens da oficina.

**RF025.** O sistema deve indicar o status de processamento da mídia, como pendente, processando, processada ou falha.

**RF026.** O sistema deve utilizar processamento assíncrono para tratar eventos de mídia após o upload.

**RF027.** O sistema deve publicar eventos de upload/processamento em uma fila baseada em RabbitMQ.

**RF028.** O sistema deve possuir ao menos um componente consumidor para processar mensagens relacionadas às mídias enviadas.

---

## 5.5 Orçamento e inspeção

**RF029.** O sistema deve permitir registrar um orçamento vinculado a uma ordem de serviço.

**RF030.** O sistema deve permitir incluir itens de orçamento, como peças, serviços, observações e valores.

**RF031.** O sistema deve permitir que o cliente consulte o orçamento associado à sua ordem de serviço.

**RF032.** O sistema deve permitir atualizar o orçamento ao longo do processo de manutenção.

**RF033.** O sistema deve manter histórico das alterações realizadas no orçamento.

**RF034.** O sistema deve permitir registrar observações técnicas ou laudos simples de inspeção do veículo.

---

## 5.6 Comunicação entre cliente e oficina

**RF035.** O sistema deve permitir o envio de mensagens associadas a uma ordem de serviço.

**RF036.** O sistema deve permitir que cliente e oficina troquem mensagens dentro do contexto da ordem de serviço.

**RF037.** O sistema deve permitir que gestor e administrador consultem o histórico completo de mensagens de uma ordem de serviço.

**RF038.** O sistema deve registrar data, hora e autor de cada mensagem enviada.

---

## 5.7 Gestão e acompanhamento administrativo

**RF039.** O sistema deve permitir ao gestor visualizar todas as ordens em andamento.

**RF040.** O sistema deve permitir ao gestor consultar histórico de serviços por cliente, veículo e mecânico.

**RF041.** O sistema deve permitir ao gestor visualizar avaliações registradas pelos clientes, caso essa funcionalidade esteja habilitada.

**RF042.** O sistema deve permitir ao gestor acompanhar indicadores básicos de operação, como quantidade de ordens abertas, concluídas e em andamento.

**RF043.** O sistema deve permitir ao gestor visualizar o histórico de interações e evidências de cada ordem de serviço.

**RF044.** O sistema deve permitir, futuramente, expansão para funcionalidades como emissão de nota fiscal e relatórios gerenciais mais completos.

---

## 5.8 Auditoria e rastreabilidade

**RF045.** O sistema deve registrar eventos relevantes de operação, como criação de ordem, alteração de status, envio de mídia e envio de mensagens.

**RF046.** O sistema deve permitir rastrear quem realizou cada ação relevante dentro do sistema.

**RF047.** O sistema deve permitir consultar histórico de ações por ordem de serviço.

---

## 6. Requisitos não funcionais

## 6.1 Arquitetura e escalabilidade

**RNF001.** O sistema deve ser projetado com separação entre frontend, backend, banco de dados, mensageria e armazenamento de arquivos.

**RNF002.** O sistema deve suportar crescimento gradual sem necessidade de reestruturação completa da arquitetura.

**RNF003.** O sistema deve permitir escalabilidade horizontal do backend e dos workers de processamento assíncrono.

**RNF004.** O sistema deve evitar que o processamento de arquivos pesados bloqueie o fluxo síncrono principal da aplicação.

**RNF005.** O sistema deve utilizar RabbitMQ como mecanismo de mensageria obrigatória para desacoplamento de tarefas assíncronas.

---

## 6.2 Desempenho

**RNF006.** O sistema deve responder rapidamente às operações principais de consulta e navegação, mesmo que o processamento de mídia ocorra em segundo plano.

**RNF007.** O upload de arquivos deve ser tratado de forma segura e previsível, sem comprometer a responsividade geral da aplicação.

**RNF008.** O sistema deve utilizar estratégias básicas para reduzir gargalos em consultas frequentes, como indexação adequada e possibilidade de cache.

---

## 6.3 Disponibilidade e resiliência

**RNF009.** O sistema deve continuar operando nas funcionalidades principais mesmo que haja atraso temporário no processamento assíncrono das mídias.

**RNF010.** Em caso de falha no consumidor de filas, as mensagens devem permanecer disponíveis para reprocessamento posterior.

**RNF011.** O sistema deve ser desenhado para reduzir pontos únicos de falha, mesmo que a primeira implantação utilize infraestrutura simplificada.

---

## 6.4 Segurança

**RNF012.** O sistema deve exigir autenticação para acesso às funcionalidades protegidas.

**RNF013.** O sistema deve aplicar autorização por perfil e contexto de negócio.

**RNF014.** O sistema deve proteger o acesso às mídias para impedir visualização por usuários não autorizados.

**RNF015.** O sistema não deve expor credenciais, segredos ou chaves sensíveis no código-fonte.

**RNF016.** O sistema deve utilizar variáveis de ambiente para dados sensíveis de infraestrutura e integração.

**RNF017.** O sistema deve prever uso de HTTPS no acesso às interfaces e APIs em ambiente publicado.

---

## 6.5 Manutenibilidade

**RNF018.** O sistema deve possuir organização modular para facilitar manutenção e evolução.

**RNF019.** O código deve seguir padrões mínimos de legibilidade e separação de responsabilidades.

**RNF020.** O sistema deve ser preparado para containerização com Docker.

**RNF021.** O sistema deve permitir automação futura de build, testes e deploy via pipeline CI/CD.

---

## 6.6 Observabilidade

**RNF022.** O sistema deve possuir logs mínimos para rastrear erros e eventos principais.

**RNF023.** O sistema deve expor mecanismos básicos de monitoramento e saúde da aplicação, como health check.

**RNF024.** O sistema deve permitir evolução futura para observabilidade com ferramentas como Prometheus, Grafana, Elastic Stack ou equivalentes.

---

## 6.7 Usabilidade

**RNF025.** A interface deve permitir uso simples e intuitivo pelos perfis principais.

**RNF026.** O acesso aos vídeos, orçamento e mensagens deve ocorrer de forma clara dentro da ordem de serviço.

**RNF027.** O sistema deve priorizar simplicidade operacional na primeira versão, evitando excesso de passos para tarefas frequentes.

---

## 6.8 Implantação e custos

**RNF028.** A solução deve priorizar baixo custo de implantação para fins acadêmicos e demonstrativos.

**RNF029.** A arquitetura deve permitir execução inicial em ambiente simplificado, como uma única instância com múltiplos serviços conteinerizados.

**RNF030.** O sistema deve utilizar, sempre que possível, serviços gratuitos ou de baixo custo para viabilizar a demonstração prática.

---

## 7. Regras de negócio iniciais mapeadas

**RN001.** Toda mídia enviada deve estar obrigatoriamente vinculada a uma ordem de serviço.

**RN002.** Toda ordem de serviço deve estar vinculada a um veículo e a um cliente.

**RN003.** O cliente só pode visualizar informações relacionadas às suas próprias ordens de serviço.

**RN004.** O mecânico deve registrar evidências da execução do serviço para aumentar a transparência do atendimento.

**RN005.** Orçamentos e observações devem estar vinculados à ordem de serviço correspondente.

**RN006.** Mensagens trocadas entre cliente e oficina devem ficar associadas à ordem de serviço correspondente.

**RN007.** O envio de mídia deve gerar evento assíncrono para processamento no RabbitMQ.

**RN008.** O processamento de mídia não deve impedir a continuidade do uso normal da plataforma.

---

## 8. Requisitos fora do escopo inicial

Os itens abaixo podem ser considerados para versões futuras, mas não são obrigatórios no MVP inicial:

* emissão real de nota fiscal integrada a serviços externos;
* chatbot ou atendimento automatizado;
* reconhecimento automático de imagem ou vídeo;
* streaming avançado adaptativo;
* aplicativo mobile nativo;
* integração com ERPs, CRMs ou sistemas fiscais;
* notificações push em tempo real;
* dashboards avançados com BI completo;
* autenticação federada e SSO.

---

## 9. Critérios iniciais de aceite do MVP

O MVP será considerado minimamente aceito quando permitir:

1. autenticação de usuário;
2. cadastro ou consulta de cliente, veículo e ordem de serviço;
3. envio de pelo menos 3 vídeos associados a uma ordem de serviço;
4. armazenamento das mídias em repositório apropriado;
5. registro dos metadados das mídias em banco relacional;
6. publicação de eventos no RabbitMQ após upload;
7. consumo das mensagens por worker assíncrono;
8. visualização dos vídeos pelo cliente no portal web;
9. consulta básica de orçamento e histórico da ordem de serviço.

---

## 10. Observações finais

Este documento representa uma base inicial para alinhamento entre arquitetura, desenvolvimento e evolução da solução. O conteúdo deverá ser revisado em conjunto com a equipe sempre que novas regras de negócio surgirem ou quando o escopo do MVP for refinado.

Recomenda-se que, nas próximas etapas, este documento evolua para incluir:

* casos de uso detalhados;
* histórias de usuário;
* regras de negócio refinadas;
* diagrama de entidades;
* contratos de API;
* critérios de aceite por funcionalidade.
