// Camada de acesso ao PostgreSQL.
//
// Schema:
//   - users, vehicles, work_orders, work_order_mechanics, messages, media_assets
//   - parts, part_requests        (rastreamento de peças)
//   - step_history                (histórico da máquina de estados)
//   - notifications               (criadas pelo notification-worker)
//   - audit_events                (gravadas pelo audit-worker)

import { Pool } from "pg";
import crypto from "node:crypto";
import { STEPS } from "./steps.js";

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres",
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || "oficina_demo",
  user: process.env.POSTGRES_USER || "oficina",
  password: process.env.POSTGRES_PASSWORD || "oficina123"
});

// ===== Seeds =====
const seedUsers = [
  { id: "client-1", role: "CLIENTE", name: "Joao Silva", email: "joao@oficina.demo", password: "cliente123" },
  { id: "mechanic-1", role: "MECANICO", name: "Maria Souza", email: "maria@oficina.demo", password: "mecanico123" },
  { id: "manager-1", role: "GESTOR", name: "Carlos Pereira", email: "carlos@oficina.demo", password: "gestor123" },
  { id: "admin-1", role: "ADMINISTRADOR", name: "Ana Martins", email: "ana@oficina.demo", password: "admin123" },
  { id: "client-2", role: "CLIENTE", name: "Fernanda Costa", email: "fernanda@oficina.demo", password: "cliente234" },
  { id: "mechanic-2", role: "MECANICO", name: "Paulo Rocha", email: "paulo@oficina.demo", password: "mecanico234" },
  { id: "attendant-1", role: "ATENDENTE", name: "Beatriz Lima", email: "beatriz@oficina.demo", password: "atendente123" }
];

const seedVehicles = [
  { id: "vehicle-1", plate: "ABC1D23", model: "Gol 1.6 2018", ownerId: "client-1" },
  { id: "vehicle-2", plate: "XYZ9K88", model: "HB20 1.0 2020", ownerId: "client-2" }
];

const seedWorkOrders = [
  {
    id: "os-1001",
    customerId: "client-1",
    vehicleId: "vehicle-1",
    mechanicIds: ["mechanic-1"],
    title: "Troca de freios e revisao",
    description: "Cliente relatou ruido ao frear e pediu revisao geral.",
    step: STEPS.EM_DIAGNOSTICO,
    budget: { parts: 420, labor: 180, notes: "Pastilhas dianteiras, fluido e limpeza do sistema." },
    messages: [
      { id: "msg-1", author: "Maria Souza", role: "MECANICO", sentAt: "2026-05-19T13:00:00.000Z",
        text: "Veiculo em avaliacao inicial." }
    ],
    createdAt: "2026-05-19T12:30:00.000Z"
  },
  {
    id: "os-1002",
    customerId: "client-2",
    vehicleId: "vehicle-2",
    mechanicIds: ["mechanic-2"],
    title: "Diagnostico eletrico e troca de bateria",
    description: "Cliente relatou falha na partida e oscilacao no painel.",
    step: STEPS.ORCAMENTO_ENVIADO,
    budget: { parts: 560, labor: 120, notes: "Bateria, testes de alternador e limpeza de terminais." },
    messages: [
      { id: "msg-2", author: "Paulo Rocha", role: "MECANICO", sentAt: "2026-05-19T13:25:00.000Z",
        text: "Diagnostico inicial concluido. Orcamento enviado." }
    ],
    createdAt: "2026-05-19T12:50:00.000Z"
  }
];

const seedParts = [
  { id: "part-1", code: "BR-PAD-001", name: "Pastilha de freio dianteira", priceCents: 12000, stock: 25 },
  { id: "part-2", code: "BR-FLU-001", name: "Fluido de freio DOT-4 (500ml)", priceCents: 4500, stock: 40 },
  { id: "part-3", code: "EL-BAT-001", name: "Bateria automotiva 60Ah", priceCents: 45000, stock: 12 },
  { id: "part-4", code: "EL-CAB-001", name: "Cabo de bateria reforcado", priceCents: 3500, stock: 30 },
  { id: "part-5", code: "MO-OIL-001", name: "Oleo motor 5W30 sintetico (1L)", priceCents: 6500, stock: 60 }
];

// ===== Helpers =====
function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

function canAccessWorkOrder(user, order) {
  if (!user || !order) return false;
  if (user.role === "ADMINISTRADOR") return true;
  if (user.role === "GESTOR") return true;
  if (user.role === "CLIENTE") return order.customerId === user.id;
  if (user.role === "MECANICO") return (order.mechanicIds || []).includes(user.id);
  return false;
}

async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

// ===== Schema =====
export async function initDatabase() {
  await pool.query(`
    create table if not exists users (
      id text primary key,
      role text not null,
      name text not null,
      email text not null unique,
      password text not null
    );

    create table if not exists vehicles (
      id text primary key,
      plate text not null,
      model text not null,
      owner_id text not null references users(id)
    );

    create table if not exists work_orders (
      id text primary key,
      customer_id text not null references users(id),
      vehicle_id text not null references vehicles(id),
      title text not null,
      description text not null,
      step text not null default 'RECEBIDO',
      budget_parts numeric(10,2) not null,
      budget_labor numeric(10,2) not null,
      budget_notes text not null,
      created_at timestamptz not null
    );

    create table if not exists work_order_mechanics (
      work_order_id text not null references work_orders(id) on delete cascade,
      mechanic_id text not null references users(id),
      primary key (work_order_id, mechanic_id)
    );

    create table if not exists messages (
      id text primary key,
      work_order_id text not null references work_orders(id) on delete cascade,
      author_name text not null,
      role text not null,
      sent_at timestamptz not null,
      text text not null
    );

    create table if not exists media_assets (
      id text primary key,
      work_order_id text not null references work_orders(id) on delete cascade,
      file_name text not null,
      stored_name text not null,
      content_type text not null,
      size integer not null,
      status text not null,
      uploaded_by text not null references users(id),
      created_at timestamptz not null,
      updated_at timestamptz not null
    );

    create table if not exists step_history (
      id bigserial primary key,
      work_order_id text not null references work_orders(id) on delete cascade,
      from_step text,
      to_step text not null,
      changed_by text references users(id),
      changed_at timestamptz not null default now()
    );

    create table if not exists parts (
      id text primary key,
      code text not null unique,
      name text not null,
      price_cents integer not null,
      stock integer not null
    );

    create table if not exists part_requests (
      id text primary key,
      work_order_id text not null references work_orders(id) on delete cascade,
      part_id text not null references parts(id),
      quantity integer not null,
      status text not null default 'PENDING',
      requested_by text references users(id),
      requested_at timestamptz not null default now(),
      reserved_at timestamptz,
      installed_at timestamptz
    );

    create table if not exists notifications (
      id bigserial primary key,
      user_id text not null references users(id) on delete cascade,
      work_order_id text references work_orders(id) on delete cascade,
      title text not null,
      body text not null,
      read boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table if not exists revision_items (
      id text primary key,
      work_order_id text not null references work_orders(id) on delete cascade,
      description text not null,
      price_cents integer not null,
      added_by text references users(id),
      added_at timestamptz not null default now()
    );

    create table if not exists budget_items (
      id text primary key,
      work_order_id text not null references work_orders(id) on delete cascade,
      description text not null,
      price_cents integer not null,
      added_by text references users(id),
      added_at timestamptz not null default now()
    );

    alter table budget_items add column if not exists part_id text references parts(id);

    create table if not exists audit_events (
      id bigserial primary key,
      event text not null,
      routing_key text not null,
      payload jsonb not null,
      received_at timestamptz not null default now()
    );

    create index if not exists idx_notifications_user on notifications(user_id, read);
    create index if not exists idx_step_history_wo on step_history(work_order_id);
    create index if not exists idx_audit_event on audit_events(event);
  `);

  const [{ count }] = await query(`select count(*)::int as count from users`);
  if (count > 0) return;

  await seedDatabase();
}

async function seedDatabase() {
  for (const user of seedUsers) {
    await query(
      `insert into users (id, role, name, email, password) values ($1, $2, $3, $4, $5)`,
      [user.id, user.role, user.name, user.email, user.password]
    );
  }
  for (const vehicle of seedVehicles) {
    await query(
      `insert into vehicles (id, plate, model, owner_id) values ($1, $2, $3, $4)`,
      [vehicle.id, vehicle.plate, vehicle.model, vehicle.ownerId]
    );
  }
  for (const part of seedParts) {
    await query(
      `insert into parts (id, code, name, price_cents, stock) values ($1, $2, $3, $4, $5)`,
      [part.id, part.code, part.name, part.priceCents, part.stock]
    );
  }
  for (const workOrder of seedWorkOrders) {
    await query(
      `insert into work_orders (id, customer_id, vehicle_id, title, description, step,
                                budget_parts, budget_labor, budget_notes, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [workOrder.id, workOrder.customerId, workOrder.vehicleId, workOrder.title,
       workOrder.description, workOrder.step, workOrder.budget.parts, workOrder.budget.labor,
       workOrder.budget.notes, workOrder.createdAt]
    );
    await query(
      `insert into step_history (work_order_id, from_step, to_step, changed_at)
       values ($1, null, $2, $3)`,
      [workOrder.id, workOrder.step, workOrder.createdAt]
    );
    for (const mechanicId of workOrder.mechanicIds) {
      await query(
        `insert into work_order_mechanics (work_order_id, mechanic_id) values ($1, $2)`,
        [workOrder.id, mechanicId]
      );
    }
    for (const message of workOrder.messages) {
      await query(
        `insert into messages (id, work_order_id, author_name, role, sent_at, text)
         values ($1, $2, $3, $4, $5, $6)`,
        [message.id, workOrder.id, message.author, message.role, message.sentAt, message.text]
      );
    }
  }
}

export async function closeDatabase() { await pool.end(); }

export async function resetDatabase() {
  await pool.query(`
    truncate table
      audit_events,
      notifications,
      part_requests,
      parts,
      step_history,
      media_assets,
      messages,
      work_order_mechanics,
      work_orders,
      vehicles,
      users
    restart identity cascade
  `);
  await seedDatabase();
}

// Limpa dados de demo mantendo peças e usuários staff (MECANICO/ADMINISTRADOR/ATENDENTE).
// Joao Silva é sempre recriado como cliente padrão disponível de imediato.
export async function debugResetDatabase() {
  await pool.query(`truncate table work_orders cascade`);
  await pool.query(`truncate table vehicles cascade`);
  await pool.query(`delete from users where role = 'CLIENTE'`);
  await pool.query(`truncate table audit_events, notifications restart identity`);
  // Restaura estoque das peças do catálogo aos valores originais
  for (const part of seedParts) {
    await query(`update parts set stock = $2 where id = $1`, [part.id, part.stock]);
  }
  // Cliente padrão — sempre existe após o reset
  await query(
    `insert into users (id, role, name, email, password) values ($1, 'CLIENTE', $2, $3, $4)`,
    ["client-1", "Joao Silva", "joao@oficina.demo", "cliente123"]
  );
  await query(
    `insert into vehicles (id, plate, model, owner_id) values ($1, $2, $3, $4)`,
    ["vehicle-1", "ABC1D23", "Gol 1.6 2018", "client-1"]
  );
}

// ===== Carregar dados =====
async function loadDb() {
  const [users, vehicles, workOrders, workOrderMechanics, messages, media, history, parts, partRequests, revisionItems, budgetItems] =
    await Promise.all([
      query(`select id, role, name, email, password from users`),
      query(`select id, plate, model, owner_id as "ownerId" from vehicles`),
      query(`select id, customer_id as "customerId", vehicle_id as "vehicleId", title,
                    description, step, budget_parts as "budgetParts", budget_labor as "budgetLabor",
                    budget_notes as "budgetNotes", created_at as "createdAt"
             from work_orders order by created_at asc`),
      query(`select work_order_id as "workOrderId", mechanic_id as "mechanicId" from work_order_mechanics`),
      query(`select id, work_order_id as "workOrderId", author_name as author, role,
                    sent_at as "sentAt", text
             from messages order by sent_at asc`),
      query(`select id, work_order_id as "workOrderId", file_name as "fileName",
                    stored_name as "storedName", content_type as "contentType", size, status,
                    uploaded_by as "uploadedBy", created_at as "createdAt", updated_at as "updatedAt"
             from media_assets order by created_at asc`),
      query(`select id, work_order_id as "workOrderId", from_step as "fromStep",
                    to_step as "toStep", changed_by as "changedBy", changed_at as "changedAt"
             from step_history order by changed_at asc`),
      query(`select id, code, name, price_cents as "priceCents", stock from parts`),
      query(`select id, work_order_id as "workOrderId", part_id as "partId", quantity,
                    status, requested_by as "requestedBy",
                    requested_at as "requestedAt", reserved_at as "reservedAt",
                    installed_at as "installedAt"
             from part_requests order by requested_at asc`),
      query(`select id, work_order_id as "workOrderId", description,
                    price_cents as "priceCents", added_by as "addedBy", added_at as "addedAt"
             from revision_items order by added_at asc`),
      query(`select id, work_order_id as "workOrderId", description,
                    price_cents as "priceCents", added_by as "addedBy", added_at as "addedAt",
                    part_id as "partId"
             from budget_items order by added_at asc`)
    ]);
  return { users, vehicles, workOrders, workOrderMechanics, messages, media, history, parts, partRequests, revisionItems, budgetItems };
}

function hydrateWorkOrder(order, db) {
  const mechanicIds = db.workOrderMechanics
    .filter((item) => item.workOrderId === order.id)
    .map((item) => item.mechanicId);

  const requests = db.partRequests.filter((r) => r.workOrderId === order.id).map((r) => ({
    ...r,
    part: db.parts.find((p) => p.id === r.partId) || null
  }));

  return {
    id: order.id,
    customerId: order.customerId,
    vehicleId: order.vehicleId,
    mechanicIds,
    title: order.title,
    description: order.description,
    step: order.step,
    budget: {
      parts: Number(order.budgetParts),
      labor: Number(order.budgetLabor),
      notes: order.budgetNotes
    },
    messages: db.messages.filter((item) => item.workOrderId === order.id),
    history: db.history.filter((item) => item.workOrderId === order.id),
    createdAt: order.createdAt,
    customer: sanitizeUser(db.users.find((user) => user.id === order.customerId)),
    vehicle: db.vehicles.find((vehicle) => vehicle.id === order.vehicleId) ?? null,
    mechanics: mechanicIds
      .map((mechanicId) => sanitizeUser(db.users.find((user) => user.id === mechanicId)))
      .filter(Boolean),
    media: db.media.filter((item) => item.workOrderId === order.id),
    partRequests: requests,
    revisionItems: db.revisionItems.filter((r) => r.workOrderId === order.id),
    budgetItems: db.budgetItems.filter((b) => b.workOrderId === order.id)
  };
}

// ===== Consultas =====
export async function findUserByEmail(email) {
  const rows = await query(
    `select id, role, name, email, password from users where lower(email) = lower($1) limit 1`,
    [String(email)]
  );
  return rows[0] ?? null;
}

export async function getPublicUser(userId) {
  const rows = await query(`select id, role, name, email from users where id = $1 limit 1`, [userId]);
  return rows[0] ?? null;
}

export async function getDemoUsers() {
  return query(`select id, role, name, email from users order by name asc`);
}

export async function listCustomers() {
  return query(`
    select id, role, name, email
    from users
    where role = 'CLIENTE'
    order by name asc
  `);
}

export async function getVisibleWorkOrders(user) {
  const db = await loadDb();
  return db.workOrders
    .map((order) => hydrateWorkOrder(order, db))
    .filter((order) => canAccessWorkOrder(user, order));
}

export async function getWorkOrderById(workOrderId, user) {
  const db = await loadDb();
  const order = db.workOrders.find((item) => item.id === workOrderId);
  if (!order) return null;
  const hydrated = hydrateWorkOrder(order, db);
  if (user && !canAccessWorkOrder(user, hydrated)) return null;
  return hydrated;
}

export async function createCustomerWithVehicle({ name, email, password, plate, model }) {
  const customerId = `client-${crypto.randomUUID()}`;
  const vehicleId = `vehicle-${crypto.randomUUID()}`;

  const rows = await query(
    `insert into users (id, role, name, email, password)
     values ($1, 'CLIENTE', $2, $3, $4)
     returning id, role, name, email`,
    [customerId, name, email, password]
  );

  const vehicleRows = await query(
    `insert into vehicles (id, plate, model, owner_id)
     values ($1, $2, $3, $4)
     returning id, plate, model, owner_id as "ownerId"`,
    [vehicleId, plate, model, customerId]
  );

  return { customer: rows[0], vehicle: vehicleRows[0] };
}

export async function createCustomer({ name, email, password }) {
  const customerId = `client-${crypto.randomUUID()}`;
  const rows = await query(
    `insert into users (id, role, name, email, password)
     values ($1, 'CLIENTE', $2, $3, $4)
     returning id, role, name, email`,
    [customerId, name, email, password]
  );
  return rows[0];
}

export async function listMechanics() {
  return query(`select id, role, name, email from users where role = 'MECANICO' order by name`);
}

export async function listAllVehicles() {
  return query(`
    select v.id, v.plate, v.model, v.owner_id as "ownerId", u.name as "ownerName"
    from vehicles v
    join users u on u.id = v.owner_id
    order by u.name, v.plate
  `);
}

export async function listVehiclesByOwner(ownerId) {
  return query(
    `select id, plate, model, owner_id as "ownerId" from vehicles where owner_id = $1 order by plate`,
    [ownerId]
  );
}

export async function createWorkOrder({ vehicleId, mechanicIds, title, description }) {
  const vehicleRows = await query(
    `select id, owner_id as "ownerId" from vehicles where id = $1`,
    [vehicleId]
  );
  if (!vehicleRows[0]) return null;

  const woId = `os-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await query(
    `insert into work_orders
       (id, customer_id, vehicle_id, title, description, step, budget_parts, budget_labor, budget_notes, created_at)
     values ($1,$2,$3,$4,$5,'RECEBIDO',0,0,'',$6)`,
    [woId, vehicleRows[0].ownerId, vehicleId, String(title).trim(), String(description).trim(), now]
  );

  await query(
    `insert into step_history (work_order_id, from_step, to_step, changed_at) values ($1, null, 'RECEBIDO', $2)`,
    [woId, now]
  );

  for (const mechanicId of (mechanicIds ?? [])) {
    await query(
      `insert into work_order_mechanics (work_order_id, mechanic_id) values ($1, $2)`,
      [woId, mechanicId]
    );
  }

  const db = await loadDb();
  const order = db.workOrders.find((o) => o.id === woId);
  return order ? hydrateWorkOrder(order, db) : null;
}

export async function createVehicle({ ownerId, plate, model }) {
  const owner = await getPublicUser(ownerId);
  if (!owner || owner.role !== "CLIENTE") return null;

  const vehicleId = `vehicle-${crypto.randomUUID()}`;
  const rows = await query(
    `insert into vehicles (id, plate, model, owner_id)
     values ($1, $2, $3, $4)
     returning id, plate, model, owner_id as "ownerId"`,
    [vehicleId, plate, model, ownerId]
  );
  return rows[0];
}

// ===== Mutações =====
export async function addMediaRecords(workOrderId, files, uploadedBy) {
  const now = new Date().toISOString();
  const records = [];
  for (const [index, file] of files.entries()) {
    const record = {
      id: `media-${Date.now()}-${index + 1}`,
      workOrderId, fileName: file.originalname, storedName: file.filename,
      contentType: file.mimetype, size: file.size, status: "UPLOADED",
      uploadedBy, createdAt: now, updatedAt: now
    };
    await query(
      `insert into media_assets (id, work_order_id, file_name, stored_name, content_type, size,
                                 status, uploaded_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [record.id, record.workOrderId, record.fileName, record.storedName, record.contentType,
       record.size, record.status, record.uploadedBy, record.createdAt, record.updatedAt]
    );
    records.push(record);
  }
  return records;
}

export async function updateMediaStatus(mediaId, status) {
  const rows = await query(
    `update media_assets set status = $2, updated_at = now() where id = $1
     returning id, work_order_id as "workOrderId", file_name as "fileName",
               stored_name as "storedName", content_type as "contentType", size, status,
               uploaded_by as "uploadedBy", created_at as "createdAt", updated_at as "updatedAt"`,
    [mediaId, status]
  );
  return rows[0] ?? null;
}

export async function updateStep(workOrderId, newStep, changedBy) {
  const rows = await query(`select step from work_orders where id = $1`, [workOrderId]);
  if (!rows[0]) return null;
  const currentStep = rows[0].step;
  await query(`update work_orders set step = $2 where id = $1`, [workOrderId, newStep]);
  await query(
    `insert into step_history (work_order_id, from_step, to_step, changed_by)
     values ($1, $2, $3, $4)`,
    [workOrderId, currentStep, newStep, changedBy]
  );
  return { workOrderId, fromStep: currentStep, toStep: newStep, changedBy };
}

export async function addPartToOrderBudget(workOrderId, partId, quantity, requestedBy) {
  const partRows = await query(`select price_cents from parts where id = $1`, [partId]);
  if (!partRows[0]) return null;
  const addedCost = (partRows[0].price_cents * quantity) / 100;
  const id = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await query(
    `insert into part_requests (id, work_order_id, part_id, quantity, requested_by, status)
     values ($1, $2, $3, $4, $5, 'PENDING')`,
    [id, workOrderId, partId, quantity, requestedBy]
  );
  await query(
    `update work_orders set budget_parts = budget_parts + $2 where id = $1`,
    [workOrderId, addedCost]
  );
  return { requestId: id, addedCost };
}

export async function addRevisionItem(workOrderId, description, priceCents, addedBy) {
  const id = `rev-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await query(
    `insert into revision_items (id, work_order_id, description, price_cents, added_by)
     values ($1, $2, $3, $4, $5)`,
    [id, workOrderId, description, priceCents, addedBy]
  );
  const addedCost = priceCents / 100;
  await query(
    `update work_orders set budget_parts = budget_parts + $2 where id = $1`,
    [workOrderId, addedCost]
  );
  return { revisionItemId: id, addedCost };
}

export async function addBudgetItem(workOrderId, description, priceCents, addedBy, partId = null) {
  const id = `bitem-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await query(
    `insert into budget_items (id, work_order_id, description, price_cents, added_by, part_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, workOrderId, description, priceCents, addedBy, partId || null]
  );
  const addedCost = priceCents / 100;
  await query(
    `update work_orders set budget_parts = budget_parts + $2 where id = $1`,
    [workOrderId, addedCost]
  );
  // Reduz estoque imediatamente quando é uma peça do catálogo
  if (partId) {
    await query(`update parts set stock = greatest(0, stock - 1) where id = $1`, [partId]);
  }
  return { budgetItemId: id, addedCost };
}

export async function removeBudgetItem(workOrderId, itemId) {
  const rows = await query(
    `delete from budget_items where id = $1 and work_order_id = $2
     returning price_cents, part_id as "partId"`,
    [itemId, workOrderId]
  );
  if (!rows[0]) return null;
  const { price_cents, partId } = rows[0];
  const removedCost = price_cents / 100;
  await query(
    `update work_orders set budget_parts = greatest(0, budget_parts - $2) where id = $1`,
    [workOrderId, removedCost]
  );
  // Devolve estoque se era peça do catálogo
  if (partId) {
    await query(`update parts set stock = stock + 1 where id = $1`, [partId]);
  }
  return { removedCost };
}

export async function updateBudget(workOrderId, labor, notes) {
  const rows = await query(
    `update work_orders
     set budget_labor = $2, budget_notes = $3
     where id = $1
     returning id, budget_parts as "budgetParts", budget_labor as "budgetLabor", budget_notes as "budgetNotes"`,
    [workOrderId, Number(labor), String(notes ?? "")]
  );
  return rows[0] ?? null;
}

export async function addMessage(workOrderId, authorName, role, text) {
  const id = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();
  await query(
    `insert into messages (id, work_order_id, author_name, role, sent_at, text)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, workOrderId, authorName, role, now, text]
  );
  return { id, workOrderId, author: authorName, role, sentAt: now, text };
}

export async function listParts() {
  return query(`select id, code, name, price_cents as "priceCents", stock from parts order by name`);
}

export async function createPartRequest(workOrderId, partId, quantity, requestedBy) {
  const id = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await query(
    `insert into part_requests (id, work_order_id, part_id, quantity, requested_by)
     values ($1, $2, $3, $4, $5)`,
    [id, workOrderId, partId, quantity, requestedBy]
  );
  const rows = await query(
    `select id, work_order_id as "workOrderId", part_id as "partId", quantity, status,
            requested_by as "requestedBy", requested_at as "requestedAt"
     from part_requests where id = $1`,
    [id]
  );
  return rows[0];
}

export async function reservePartRequest(requestId) {
  const reqRows = await query(
    `select part_id, quantity from part_requests where id = $1 and status = 'PENDING'`,
    [requestId]
  );
  if (!reqRows[0]) return null;
  const { part_id, quantity } = reqRows[0];

  const partRows = await query(`select stock from parts where id = $1 for update`, [part_id]);
  if (!partRows[0] || partRows[0].stock < quantity) {
    await query(`update part_requests set status = 'OUT_OF_STOCK' where id = $1`, [requestId]);
    return { requestId, status: "OUT_OF_STOCK" };
  }
  await query(`update parts set stock = stock - $2 where id = $1`, [part_id, quantity]);
  await query(
    `update part_requests set status = 'RESERVED', reserved_at = now() where id = $1`,
    [requestId]
  );
  return { requestId, status: "RESERVED" };
}

export async function installPartRequest(requestId) {
  await query(
    `update part_requests set status = 'INSTALLED', installed_at = now()
     where id = $1 and status = 'RESERVED'`,
    [requestId]
  );
  return { requestId, status: "INSTALLED" };
}

// ===== Notificações =====
export async function createNotification(userId, workOrderId, title, body) {
  const rows = await query(
    `insert into notifications (user_id, work_order_id, title, body)
     values ($1, $2, $3, $4)
     returning id, user_id as "userId", work_order_id as "workOrderId",
               title, body, read, created_at as "createdAt"`,
    [userId, workOrderId, title, body]
  );
  return rows[0];
}

export async function listNotifications(userId) {
  return query(
    `select id, user_id as "userId", work_order_id as "workOrderId",
            title, body, read, created_at as "createdAt"
     from notifications where user_id = $1 order by created_at desc limit 50`,
    [userId]
  );
}

export async function markNotificationsRead(userId) {
  await query(`update notifications set read = true where user_id = $1`, [userId]);
}

export async function listPartRequests() {
  return query(`
    select
      pr.id,
      pr.work_order_id  as "workOrderId",
      p.code            as "partCode",
      p.name            as "partName",
      p.price_cents     as "partPriceCents",
      pr.quantity,
      pr.status,
      u.name            as "requestedByName",
      pr.requested_at   as "requestedAt",
      pr.reserved_at    as "reservedAt",
      pr.installed_at   as "installedAt"
    from part_requests pr
    join parts p on p.id = pr.part_id
    left join users u on u.id = pr.requested_by
    order by pr.requested_at desc
  `);
}

export async function listAuditEvents(limit = 100) {
  const rows = await query(
    `select id, event, routing_key as "routingKey", payload, received_at as "receivedAt"
     from audit_events
     order by received_at desc
     limit $1`,
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload
  }));
}

// ===== Auditoria =====
export async function appendAuditEvent(event, routingKey, payload) {
  await query(
    `insert into audit_events (event, routing_key, payload) values ($1, $2, $3)`,
    [event, routingKey, JSON.stringify(payload)]
  );
}

// ===== Dashboard do gestor (GESTOR/ADMINISTRADOR) =====
export async function getDashboardMetrics() {
  const [
    ordersByStep,
    budgetTotals,
    parts,
    partRequestsByStatus,
    mechanicLoad,
    eventsByRoutingKey,
    recentAudit,
    mediaTotals
  ] = await Promise.all([
    query(`select step, count(*)::int as count from work_orders group by step`),
    query(`
      select
        count(*)::int as total,
        count(*) filter (where step in ('CONCLUIDO','ENTREGUE'))::int as concluded,
        count(*) filter (where step = 'CANCELADO')::int as cancelled,
        coalesce(sum(budget_parts + budget_labor) filter (where step in ('CONCLUIDO','ENTREGUE')), 0)::numeric as "concludedValue",
        coalesce(sum(budget_parts + budget_labor) filter (where step not in ('CONCLUIDO','ENTREGUE','CANCELADO')), 0)::numeric as "activeValue"
      from work_orders
    `),
    query(`select id, code, name, price_cents as "priceCents", stock from parts order by stock asc`),
    query(`select status, count(*)::int as count from part_requests group by status`),
    query(`
      select u.id, u.name, count(wom.work_order_id) filter (
        where wo.step not in ('CONCLUIDO','ENTREGUE','CANCELADO')
      )::int as "activeOrders"
      from users u
      left join work_order_mechanics wom on wom.mechanic_id = u.id
      left join work_orders wo on wo.id = wom.work_order_id
      where u.role = 'MECANICO'
      group by u.id, u.name
      order by u.name
    `),
    query(`
      select routing_key as "routingKey", count(*)::int as count
      from audit_events
      group by routing_key
      order by count desc
      limit 10
    `),
    listAuditEvents(8),
    query(`
      select
        count(*)::int as total,
        count(*) filter (where status = 'PROCESSED')::int as processed
      from media_assets
    `)
  ]);

  const totals = budgetTotals[0];
  return {
    orders: {
      total: totals.total,
      concluded: totals.concluded,
      cancelled: totals.cancelled,
      active: totals.total - totals.concluded - totals.cancelled,
      byStep: ordersByStep
    },
    budget: {
      concludedValue: Number(totals.concludedValue),
      activeValue: Number(totals.activeValue)
    },
    stock: {
      parts,
      lowStock: parts.filter((p) => p.stock <= 5)
    },
    partRequestsByStatus,
    mechanicLoad,
    eventsByRoutingKey,
    media: mediaTotals[0],
    recentAudit
  };
}

// ===== Snapshots =====
export async function getDemoSnapshot() {
  const db = await loadDb();
  const workOrders = db.workOrders.map((order) => hydrateWorkOrder(order, db));
  return {
    totals: {
      workOrders: workOrders.length,
      media: db.media.length,
      processed: db.media.filter((item) => item.status === "PROCESSED").length,
      pending: db.media.filter((item) => item.status !== "PROCESSED").length
    },
    workOrders
  };
}

export async function getPortalSnapshot(user) {
  const workOrders = await getVisibleWorkOrders(user);
  const notifications = await listNotifications(user.id);
  return {
    user: sanitizeUser(user),
    totals: {
      workOrders: workOrders.length,
      media: workOrders.reduce((acc, order) => acc + order.media.length, 0),
      processed: workOrders.reduce(
        (acc, order) => acc + order.media.filter((item) => item.status === "PROCESSED").length, 0
      ),
      pending: workOrders.reduce(
        (acc, order) => acc + order.media.filter((item) => item.status !== "PROCESSED").length, 0
      ),
      unreadNotifications: notifications.filter((n) => !n.read).length
    },
    workOrders,
    notifications
  };
}

export async function getWorkOrderStakeholders(workOrderId) {
  const owners = await query(`select customer_id as "userId" from work_orders where id = $1`, [workOrderId]);
  const mechs = await query(`select mechanic_id as "userId" from work_order_mechanics where work_order_id = $1`, [workOrderId]);
  return { customer: owners[0]?.userId, mechanics: mechs.map((r) => r.userId) };
}
