import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../src/create-app.js";
import {
  closeDatabase,
  getWorkOrderById,
  initDatabase,
  resetDatabase
} from "../src/store.js";

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "oficina-demo-tests-"));
const publishedEvents = [];

const app = createApp({
  uploadDir: uploadsDir,
  publishMediaUploaded: async (message) => {
    publishedEvents.push(message);
  },
  publishEvent: async (routingKey, message) => {
    publishedEvents.push({ routingKey, ...message });
  },
  internalApiKey: "test-internal-key"
});

async function loginAs(email, password) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password });

  assert.equal(response.status, 200);
  return response.body.token;
}

before(async () => {
  await initDatabase();
});

beforeEach(async () => {
  publishedEvents.length = 0;
  await resetDatabase();

  for (const file of fs.readdirSync(uploadsDir)) {
    fs.rmSync(path.join(uploadsDir, file), { force: true });
  }
});

after(async () => {
  await resetDatabase();
  await closeDatabase();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

test("health endpoint responds successfully", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("login succeeds with seeded credentials and returns session data", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "joao@oficina.demo", password: "cliente123" });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(response.body.user.role, "CLIENTE");
});

test("login fails with invalid credentials", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "joao@oficina.demo", password: "senha-errada" });

  assert.equal(response.status, 401);
  assert.match(response.body.message, /invalidos/i);
});

test("protected portal route requires authentication", async () => {
  const response = await request(app).get("/api/portal");

  assert.equal(response.status, 401);
});

test("client sees only its own work order", async () => {
  const token = await loginAs("joao@oficina.demo", "cliente123");

  const response = await request(app)
    .get("/api/portal")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.workOrders.map((item) => item.id), ["os-1001"]);
});

test("manager sees all work orders", async () => {
  const token = await loginAs("carlos@oficina.demo", "gestor123");

  const response = await request(app)
    .get("/api/work-orders")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.map((item) => item.id),
    ["os-1001", "os-1002"]
  );
});

test("administrator sees all work orders", async () => {
  const token = await loginAs("ana@oficina.demo", "admin123");

  const response = await request(app)
    .get("/api/work-orders")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.map((item) => item.id),
    ["os-1001", "os-1002"]
  );
});

test("mechanic can register a customer", async () => {
  const token = await loginAs("maria@oficina.demo", "mecanico123");

  const response = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Rafael Nunes",
      email: "rafael@oficina.demo",
      password: "cliente345"
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.customer.role, "CLIENTE");
  assert.equal(response.body.customer.email, "rafael@oficina.demo");
  assert.equal(response.body.vehicle, null);
});

test("mechanic can register a vehicle linked to a selected customer", async () => {
  const token = await loginAs("maria@oficina.demo", "mecanico123");

  const customerResponse = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Rafael Nunes",
      email: "rafael@oficina.demo",
      password: "cliente345"
    });

  const customerId = customerResponse.body.customer.id;

  const customersResponse = await request(app)
    .get("/api/customers")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(customersResponse.status, 200);
  assert.ok(customersResponse.body.some((customer) => customer.id === customerId));

  const vehicleResponse = await request(app)
    .post("/api/vehicles")
    .set("Authorization", `Bearer ${token}`)
    .send({
      ownerId: customerId,
      plate: "BRA2E19",
      model: "Onix 1.4 2021"
    });

  assert.equal(vehicleResponse.status, 201);
  assert.equal(vehicleResponse.body.ownerId, customerId);
  assert.equal(vehicleResponse.body.plate, "BRA2E19");
});

test("client cannot register customers", async () => {
  const token = await loginAs("joao@oficina.demo", "cliente123");

  const response = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Sem Permissao",
      email: "sempermissao@oficina.demo",
      password: "cliente345",
      vehicle: { plate: "AAA1A11", model: "Uno 2015" }
    });

  assert.equal(response.status, 403);
});

test("client cannot upload media", async () => {
  const token = await loginAs("joao@oficina.demo", "cliente123");

  const response = await request(app)
    .post("/api/work-orders/os-1001/media")
    .set("Authorization", `Bearer ${token}`)
    .attach("files", Buffer.from("fake-video"), "teste.mp4");

  assert.equal(response.status, 403);
});

test("mechanic upload persists media metadata and publishes event", async () => {
  const token = await loginAs("maria@oficina.demo", "mecanico123");

  const response = await request(app)
    .post("/api/work-orders/os-1001/media")
    .set("Authorization", `Bearer ${token}`)
    .attach("files", Buffer.from("fake-video"), "teste.mp4");

  assert.equal(response.status, 201);
  assert.equal(response.body.media.length, 1);
  assert.equal(publishedEvents.length, 1);
  assert.equal(publishedEvents[0].workOrderId, "os-1001");

  const workOrder = await getWorkOrderById("os-1001", {
    id: "mechanic-1",
    role: "MECANICO"
  });

  assert.equal(workOrder.media.length, 1);
  assert.equal(workOrder.media[0].status, "UPLOADED");
  assert.equal(workOrder.media[0].uploadedBy, "mechanic-1");
  assert.equal(fs.readdirSync(uploadsDir).length, 1);
});

test("internal status endpoint updates media processing status", async () => {
  const token = await loginAs("maria@oficina.demo", "mecanico123");

  const uploadResponse = await request(app)
    .post("/api/work-orders/os-1001/media")
    .set("Authorization", `Bearer ${token}`)
    .attach("files", Buffer.from("fake-video"), "teste.mp4");

  const mediaId = uploadResponse.body.media[0].id;

  const unauthorized = await request(app)
    .post(`/internal/media/${mediaId}/status`)
    .send({ status: "PROCESSING" });

  assert.equal(unauthorized.status, 401);

  const authorized = await request(app)
    .post(`/internal/media/${mediaId}/status`)
    .set("x-internal-api-key", "test-internal-key")
    .send({ status: "PROCESSED" });

  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.status, "PROCESSED");

  const workOrder = await getWorkOrderById("os-1001", {
    id: "mechanic-1",
    role: "MECANICO"
  });

  assert.equal(workOrder.media[0].status, "PROCESSED");
});
