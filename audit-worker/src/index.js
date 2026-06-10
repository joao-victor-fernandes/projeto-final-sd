// Audit Worker
//
// Consome TODOS os eventos publicados em oficina.events (routing key "#")
// e grava cada um na tabela audit_events do PostgreSQL.
//
// Demonstra:
//   - Topic Exchange com curinga universal (#)
//   - Persistência de trilha de auditoria fora do fluxo síncrono
//   - Worker que escreve direto no banco (sem passar pelo backend)

import amqp from "amqplib";
import pg from "pg";

const { Pool } = pg;

const RABBIT_URL = process.env.RABBITMQ_URL || "amqp://rabbitmq:5672";
const EXCHANGE = "oficina.events";
const QUEUE = "q.audit";

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres",
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || "oficina_demo",
  user: process.env.POSTGRES_USER || "oficina",
  password: process.env.POSTGRES_PASSWORD || "oficina123"
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function persist(routingKey, event, payload) {
  await pool.query(
    `insert into audit_events (event, routing_key, payload) values ($1, $2, $3)`,
    [event, routingKey, payload]
  );
}

async function start() {
  while (true) {
    try {
      const conn = await amqp.connect(RABBIT_URL);
      const ch = await conn.createChannel();
      await ch.assertExchange(EXCHANGE, "topic", { durable: true });
      await ch.assertQueue(QUEUE, { durable: true });
      await ch.bindQueue(QUEUE, EXCHANGE, "#"); // captura TUDO
      ch.prefetch(20);

      console.log("[audit-worker] capturando todos os eventos com pattern '#'");

      ch.consume(QUEUE, async (msg) => {
        if (!msg) return;
        try {
          const rk = msg.fields.routingKey;
          const raw = msg.content.toString();
          const payload = JSON.parse(raw);
          console.log(`[audit] <- ${rk}`);
          await persist(rk, payload.event || rk, raw);
          ch.ack(msg);
        } catch (e) {
          console.error("[audit] erro:", e.message);
          ch.nack(msg, false, false);
        }
      });

      conn.on("close", () => {
        console.error("[audit] conexao fechada, reconectando...");
        setTimeout(() => start().catch(() => {}), 2000);
      });
      return;
    } catch (e) {
      console.error("[audit] RabbitMQ ou PG indisponivel:", e.message);
      await wait(2000);
    }
  }
}

start().catch((e) => { console.error("Worker failed:", e); process.exit(1); });
