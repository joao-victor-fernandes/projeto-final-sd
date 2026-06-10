// Notification Worker
//
// Consome eventos do Topic Exchange "oficina.events" e cria notificações
// no banco (via endpoint interno do backend).
//
// Routing keys assinadas:
//   maintenance.step.updated  — mudança de etapa (notifica cliente e/ou mecânicos)
//   budget.created            — primeiro orçamento enviado (notifica cliente)
//   budget.updated            — revisão adicionada (notifica cliente)
//   budget.approved           — orçamento aprovado (notifica cliente — confirmação)
//   media.processed           — mídia pronta (notifica cliente)
//   parts.reserved            — peça reservada (notifica mecânicos)
//   parts.outofstock          — peça em falta (notifica mecânicos)
//   workorder.completed       — serviço finalizado (notifica cliente)

import amqp from "amqplib";

const RABBIT_URL   = process.env.RABBITMQ_URL           || "amqp://rabbitmq:5672";
const BACKEND_URL  = process.env.BACKEND_INTERNAL_URL   || "http://backend:4000";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY       || "demo-internal-key";

const EXCHANGE = "oficina.events";
const QUEUE    = "q.notifications";

const PATTERNS = [
  "maintenance.step.updated",
  "media.processed",
  "parts.reserved",
  "parts.outofstock",
  "budget.created",
  "budget.approved",
  "budget.updated",
  "workorder.completed"
];

const STEP_LABEL = {
  EM_DIAGNOSTICO:      "Em diagnóstico",
  CAUSA_IDENTIFICADA:  "Causa identificada",
  ORCAMENTO_ENVIADO:   "Orçamento disponível",
  ORCAMENTO_APROVADO:  "Orçamento aprovado",
  ORCAMENTO_REPROVADO: "Orçamento reprovado",
  REVISAO_ORCAMENTO:   "Revisão de orçamento",
  PECAS_SOLICITADAS:   "Peças solicitadas",
  EM_REPARO:           "Reparo em andamento",
  TESTE_FINAL:         "Teste final",
  CONCLUIDO:           "Serviço concluído",
  ENTREGUE:            "Veículo entregue",
  CANCELADO:           "Ordem cancelada",
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function stakeholders(workOrderId) {
  if (!workOrderId) return { customer: null, mechanics: [] };
  const r = await fetch(`${BACKEND_URL}/internal/work-orders/${workOrderId}/stakeholders`, {
    headers: { "x-internal-api-key": INTERNAL_KEY }
  });
  if (!r.ok) return { customer: null, mechanics: [] };
  return r.json();
}

async function notify(userId, workOrderId, title, body) {
  if (!userId) return;
  await fetch(`${BACKEND_URL}/internal/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-api-key": INTERNAL_KEY },
    body: JSON.stringify({ userId, workOrderId, title, body })
  }).catch((e) => console.error("[notify] erro:", e.message));
}

async function notifyAll(userIds, workOrderId, title, body) {
  await Promise.all(userIds.map((id) => notify(id, workOrderId, title, body)));
}

async function handle(routingKey, payload) {
  const { workOrderId } = payload;
  const { customer, mechanics } = await stakeholders(workOrderId);

  // ── Mudança de etapa ──────────────────────────────────────────────────────────
  if (routingKey === "maintenance.step.updated") {
    const { toStep, fromStep } = payload;

    // Cliente: quase todas as mudanças de etapa interessam a ele
    if (toStep === "REVISAO_ORCAMENTO") {
      await notify(customer, workOrderId,
        "Revisão de orçamento aguardando aprovação",
        `O mecânico adicionou itens ao orçamento da ordem ${workOrderId}. Acesse o portal para revisar e aprovar.`
      );
    } else if (toStep !== "ORCAMENTO_APROVADO" && toStep !== "ORCAMENTO_REPROVADO") {
      // Essas duas são ações do próprio cliente — não precisa notificá-lo delas
      const label = STEP_LABEL[toStep] || toStep;
      await notify(customer, workOrderId, label,
        `Sua ordem ${workOrderId} avançou para a etapa "${label}".`
      );
    }

    // Mecânicos: notificados quando o cliente toma decisões
    if (toStep === "ORCAMENTO_APROVADO") {
      await notifyAll(mechanics, workOrderId,
        "Orçamento aprovado pelo cliente",
        `O cliente aprovou o orçamento da ordem ${workOrderId}. Você pode prosseguir com o reparo.`
      );
    }
    if (toStep === "ORCAMENTO_REPROVADO") {
      await notifyAll(mechanics, workOrderId,
        "Orçamento recusado pelo cliente",
        `O cliente recusou o orçamento da ordem ${workOrderId}. Revise os valores e reenvie ou cancele.`
      );
    }
    // Cliente aprovou a revisão de orçamento (REVISAO → EM_REPARO)
    if (fromStep === "REVISAO_ORCAMENTO" && toStep === "EM_REPARO") {
      await notifyAll(mechanics, workOrderId,
        "Revisão de orçamento aprovada",
        `O cliente aprovou a revisão de orçamento da ordem ${workOrderId}. Continue o reparo.`
      );
    }
    // Cliente recusou a revisão (REVISAO → CANCELADO)
    if (fromStep === "REVISAO_ORCAMENTO" && toStep === "CANCELADO") {
      await notifyAll(mechanics, workOrderId,
        "Ordem cancelada pelo cliente",
        `O cliente recusou a revisão de orçamento e cancelou a ordem ${workOrderId}.`
      );
    }
    return;
  }

  // ── Revisão de orçamento: novo item adicionado (quando já em REVISAO_ORCAMENTO) ──
  // Quando o primeiro item é adicionado, o step muda → já há notificação via step.updated.
  // Quando itens extras são adicionados (step não muda), este evento cobre o cliente.
  if (routingKey === "budget.updated") {
    await notify(customer, workOrderId,
      "Orçamento atualizado",
      `Novos itens foram adicionados ao orçamento da ordem ${workOrderId}. Acesse o portal para revisar.`
    );
    return;
  }

  // ── Orçamento inicial criado (mecânico envia pela primeira vez) ───────────────
  if (routingKey === "budget.created") {
    await notify(customer, workOrderId,
      "Orçamento disponível",
      `A oficina enviou o orçamento da ordem ${workOrderId}. Acesse o portal para aprovar ou recusar.`
    );
    return;
  }

  // ── budget.approved: confirmação redundante, omitir para não duplicar ─────────
  if (routingKey === "budget.approved") {
    return; // step.updated já cobre ORCAMENTO_APROVADO e revisão aprovada
  }

  // ── Mídia processada ──────────────────────────────────────────────────────────
  if (routingKey === "media.processed") {
    await notify(customer, workOrderId,
      "Nova evidência disponível",
      `A oficina adicionou uma nova mídia à ordem ${workOrderId}: ${payload.fileName}.`
    );
    return;
  }

  // ── Estoque ───────────────────────────────────────────────────────────────────
  if (routingKey === "parts.reserved") {
    await notifyAll(mechanics, workOrderId,
      "Peça reservada",
      `Solicitação ${payload.requestId} foi atendida pelo estoque.`
    );
    return;
  }
  if (routingKey === "parts.outofstock") {
    await notifyAll(mechanics, workOrderId,
      "Peça em falta",
      `Solicitação ${payload.requestId} não pôde ser atendida — estoque insuficiente.`
    );
    return;
  }

  // ── Serviço concluído ─────────────────────────────────────────────────────────
  if (routingKey === "workorder.completed") {
    await notify(customer, workOrderId,
      "Serviço concluído",
      `O serviço da ordem ${workOrderId} foi finalizado. Entre em contato para agendar a retirada.`
    );
    return;
  }
}

async function start() {
  while (true) {
    try {
      const conn = await amqp.connect(RABBIT_URL);
      const ch   = await conn.createChannel();
      await ch.assertExchange(EXCHANGE, "topic", { durable: true });
      await ch.assertQueue(QUEUE, { durable: true });

      for (const p of PATTERNS) await ch.bindQueue(QUEUE, EXCHANGE, p);
      ch.prefetch(5);

      console.log(`[notification-worker] subscrito em ${PATTERNS.length} padrões`);

      ch.consume(QUEUE, async (msg) => {
        if (!msg) return;
        try {
          const payload = JSON.parse(msg.content.toString());
          const rk      = msg.fields.routingKey;
          console.log(`[notify] <- ${rk}`);
          await handle(rk, payload);
          ch.ack(msg);
        } catch (e) {
          console.error("[notify] erro:", e.message);
          ch.nack(msg, false, false);
        }
      });

      conn.on("close", () => {
        console.error("[notify] conexao fechada, reconectando...");
        setTimeout(() => start().catch(() => {}), 2000);
      });
      return;
    } catch (e) {
      console.error("[notify] RabbitMQ indisponivel:", e.message);
      await wait(2000);
    }
  }
}

start().catch((e) => { console.error("Worker failed:", e); process.exit(1); });
