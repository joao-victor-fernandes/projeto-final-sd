import { initDatabase } from "./store.js";
import { createApp } from "./create-app.js";

const port = Number(process.env.PORT || 4000);

async function ensureDatabaseReady() {
  const attempts = 15;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await initDatabase();
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }

      console.error(`PostgreSQL ainda indisponivel (tentativa ${attempt}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

await ensureDatabaseReady();

const app = createApp();

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
