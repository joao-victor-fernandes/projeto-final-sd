import amqp from "amqplib";

const rabbitUrl = process.env.RABBITMQ_URL || "amqp://rabbitmq:5672";
const queueName = process.env.RABBITMQ_QUEUE || "media.uploaded";
const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:4000";
const internalApiKey = process.env.INTERNAL_API_KEY || "demo-internal-key";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateStatus(mediaId, status) {
  const response = await fetch(`${backendUrl}/internal/media/${mediaId}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": internalApiKey
    },
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    throw new Error(`Erro ao atualizar status ${status} para ${mediaId}`);
  }
}

async function start() {
  while (true) {
    try {
      const connection = await amqp.connect(rabbitUrl);
      const channel = await connection.createChannel();
      await channel.assertExchange("oficina.dlx", "topic", { durable: true });
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": "oficina.dlx",
          "x-dead-letter-routing-key": "media.failed"
        }
      });
      channel.prefetch(1);

      console.log(`Worker aguardando mensagens em ${queueName}`);

      channel.consume(queueName, async (message) => {
        if (!message) {
          return;
        }

        const payload = JSON.parse(message.content.toString());

        try {
          console.log(`Processando ${payload.mediaId}`);
          await updateStatus(payload.mediaId, "PROCESSING");
          await wait(2000);
          await updateStatus(payload.mediaId, "PROCESSED");
          channel.ack(message);
          console.log(`Midia ${payload.mediaId} concluida`);
        } catch (error) {
          console.error(error);
          await updateStatus(payload.mediaId, "FAILED").catch(() => {});
          channel.nack(message, false, false);
        }
      });

      connection.on("close", async () => {
        console.error("Conexao com RabbitMQ encerrada. Tentando novamente...");
        await wait(2000);
        start().catch(() => {});
      });

      return;
    } catch (error) {
      console.error("RabbitMQ indisponivel, nova tentativa em 2s", error.message);
      await wait(2000);
    }
  }
}

start().catch((error) => {
  console.error("Worker failed to start", error);
  process.exit(1);
});
