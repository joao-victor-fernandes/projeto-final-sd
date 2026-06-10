// Inventory Worker
//
// Consome eventos parts.requested e chama o backend para tentar reservar
// a peça no estoque. O backend é quem decide se atende (status=RESERVED)
// ou indica falta (status=OUT_OF_STOCK).
//
// Demonstra padrão Work Queue: várias instâncias deste worker podem rodar
// em paralelo. O RabbitMQ distribui as mensagens com prefetch=1.

import amqp from "amqplib";

const RABBIT_URL = process.env.RABBITMQ_URL || "amqp://rabbitmq:5672";
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:4000";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || "demo-internal-key";

const EXCHANGE = "oficina.events";
const QUEUE = "q.inventory";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function reserve(requestId) {
  const r = await fetch(`${BACKEND_URL}/internal/parts/${requestId}/reserve`, {
    method: "POST",
    headers: { "x-internal-api-key": INTERNAL_KEY }
  });
  return r.ok ? r.json() : null;
}

async function start() {
  while (true) {
    try {
      const conn = await amqp.connect(RABBIT_URL);
      const ch = await conn.createChannel();
      await ch.assertExchange(EXCHANGE, "topic", { durable: true });
      await ch.assertQueue(QUEUE, { durable: true });
      await ch.bindQueue(QUEUE, EXCHANGE, "parts.requested");
      ch.prefetch(1); // Work Queue: 1 mensagem por vez

      console.log("[inventory-worker] aguardando parts.requested");

      ch.consume(QUEUE, async (msg) => {
        if (!msg) return;
        try {
          const payload = JSON.parse(msg.content.toString());
          console.log(`[inv] <- parts.requested req=${payload.requestId}`);

          // Simula latência de consulta ao sistema de estoque
          await wait(800);

          const result = await reserve(payload.requestId);
          console.log(`[inv] -> ${result?.status || "ERR"} req=${payload.requestId}`);
          ch.ack(msg);
        } catch (e) {
          console.error("[inv] erro:", e.message);
          ch.nack(msg, false, false);
        }
      });

      conn.on("close", () => {
        console.error("[inv] conexao fechada, reconectando...");
        setTimeout(() => start().catch(() => {}), 2000);
      });
      return;
    } catch (e) {
      console.error("[inv] RabbitMQ indisponivel:", e.message);
      await wait(2000);
    }
  }
}

start().catch((e) => { console.error("Worker failed:", e); process.exit(1); });
