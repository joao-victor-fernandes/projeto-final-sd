// Camada de mensageria RabbitMQ
//
// Implementa varios padroes de comunicacao distribuida:
// - Topic Exchange (oficina.events): hub principal de eventos do dominio
// - Fanout Exchange (oficina.broadcast): notificacoes para todos os subscribers
// - Direct Exchange (oficina.commands): comandos imperativos para workers especificos
// - Headers Exchange (oficina.notifications): roteamento por canal preferido
// - Dead Letter Exchange (oficina.dlx): mensagens que falharam

import amqp from "amqplib";

const RABBIT_URL = process.env.RABBITMQ_URL || "amqp://rabbitmq:5672";

export const EXCHANGES = {
  EVENTS: "oficina.events",
  BROADCAST: "oficina.broadcast",
  COMMANDS: "oficina.commands",
  NOTIFICATIONS: "oficina.notifications",
  DLX: "oficina.dlx"
};

export const ROUTING_KEYS = {
  MEDIA_UPLOADED: "media.uploaded",
  MEDIA_PROCESSED: "media.processed",
  MEDIA_FAILED: "media.failed",
  STEP_UPDATED: "maintenance.step.updated",
  PART_REQUESTED: "parts.requested",
  PART_RESERVED: "parts.reserved",
  PART_INSTALLED: "parts.installed",
  PART_OUT_OF_STOCK: "parts.outofstock",
  BUDGET_CREATED: "budget.created",
  BUDGET_APPROVED: "budget.approved",
  BUDGET_REJECTED: "budget.rejected",
  BUDGET_UPDATED: "budget.updated",
  CUSTOMER_CREATED: "customer.created",
  VEHICLE_CREATED: "vehicle.created",
  WORKORDER_OPENED: "workorder.opened",
  WORKORDER_COMPLETED: "workorder.completed",
  AUDIT_EVENT: "audit.event"
};

let connection = null;
let channelPromise = null;

async function getChannel() {
  if (channelPromise) return channelPromise;
  channelPromise = (async () => {
    connection = await amqp.connect(RABBIT_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGES.EVENTS, "topic", { durable: true });
    await channel.assertExchange(EXCHANGES.BROADCAST, "fanout", { durable: true });
    await channel.assertExchange(EXCHANGES.COMMANDS, "direct", { durable: true });
    await channel.assertExchange(EXCHANGES.NOTIFICATIONS, "headers", { durable: true });
    await channel.assertExchange(EXCHANGES.DLX, "topic", { durable: true });
    await channel.assertQueue("media.uploaded", {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": EXCHANGES.DLX,
        "x-dead-letter-routing-key": "media.failed"
      }
    });
    await channel.bindQueue("media.uploaded", EXCHANGES.EVENTS, ROUTING_KEYS.MEDIA_UPLOADED);
    connection.on("error", (err) => console.error("[rabbit] connection error:", err.message));
    connection.on("close", () => {
      console.error("[rabbit] connection closed");
      connection = null;
      channelPromise = null;
    });
    return channel;
  })();
  return channelPromise;
}

export async function publishEvent(routingKey, payload, options = {}) {
  const channel = await getChannel();
  const body = Buffer.from(JSON.stringify({
    event: routingKey,
    timestamp: new Date().toISOString(),
    ...payload
  }));
  channel.publish(EXCHANGES.EVENTS, routingKey, body, {
    persistent: true, contentType: "application/json", ...options
  });
}

export async function broadcast(payload) {
  const channel = await getChannel();
  channel.publish(EXCHANGES.BROADCAST, "",
    Buffer.from(JSON.stringify({ ...payload, timestamp: new Date().toISOString() })),
    { persistent: true, contentType: "application/json" }
  );
}

export async function sendCommand(target, payload) {
  const channel = await getChannel();
  channel.publish(EXCHANGES.COMMANDS, target,
    Buffer.from(JSON.stringify({ ...payload, timestamp: new Date().toISOString() })),
    { persistent: true, contentType: "application/json" }
  );
}

export async function publishNotification(headers, payload) {
  const channel = await getChannel();
  channel.publish(EXCHANGES.NOTIFICATIONS, "",
    Buffer.from(JSON.stringify({ ...payload, timestamp: new Date().toISOString() })),
    { persistent: true, contentType: "application/json", headers }
  );
}

export async function publishMediaUploaded(message) {
  await publishEvent(ROUTING_KEYS.MEDIA_UPLOADED, message);
}

export async function closeRabbit() {
  if (connection) {
    await connection.close();
    connection = null;
    channelPromise = null;
  }
}
