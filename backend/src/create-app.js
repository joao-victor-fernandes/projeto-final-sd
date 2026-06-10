import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  addMediaRecords, findUserByEmail, getDemoSnapshot, getDemoUsers,
  getPortalSnapshot, getPublicUser, getWorkOrderById, getVisibleWorkOrders,
  updateMediaStatus, updateStep, updateBudget, addPartToOrderBudget,
  listParts, createPartRequest, reservePartRequest, installPartRequest,
  createNotification, listNotifications, markNotificationsRead,
  getWorkOrderStakeholders, createCustomerWithVehicle, listCustomers,
  createCustomer, createVehicle, listMechanics, listAllVehicles,
  listVehiclesByOwner, createWorkOrder, debugResetDatabase,
  addRevisionItem, addBudgetItem, removeBudgetItem,
  addMessage, listPartRequests, listAuditEvents
} from "./store.js";
import {
  publishEvent, publishMediaUploaded, ROUTING_KEYS, broadcast
} from "./rabbit.js";
import { canTransition, STEPS, STEP_LABELS, STEP_ORDER, nextSteps } from "./steps.js";

export function createApp(options = {}) {
  const app = express();
  const internalApiKey = options.internalApiKey || process.env.INTERNAL_API_KEY || "demo-internal-key";
  const corsOrigin = options.corsOrigin || process.env.CORS_ORIGIN || "*";
  const sessions = options.sessions || new Map();
  const uploadDir = path.resolve(options.uploadDir || process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads"));
  const eventPublisher = options.publishEvent || publishEvent;
  const mediaUploadedPublisher = options.publishMediaUploaded || publishMediaUploaded;
  const broadcastPublisher = options.broadcast || broadcast;

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      cb(null, `${Date.now()}-${safeName}`);
    }
  });
  const upload = multer({ storage });

  app.use(cors({
    origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((item) => item.trim())
  }));
  app.use(express.json());
  app.use("/media", express.static(uploadDir));

  const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

  function extractToken(req) {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  }

  const requireAuth = asyncHandler(async (req, res, next) => {
    const token = extractToken(req);
    if (!token || !sessions.has(token)) {
      return res.status(401).json({ message: "Autenticacao obrigatoria." });
    }
    const session = sessions.get(token);
    const user = await getPublicUser(session.userId);
    if (!user) {
      sessions.delete(token);
      return res.status(401).json({ message: "Sessao invalida." });
    }
    req.user = user;
    req.sessionToken = token;
    return next();
  });

  const requireAnyRole = (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Sem permissao para esta operacao." });
    }
    return next();
  };

  // ===== Health & metadata =====
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "backend", timestamp: new Date().toISOString() });
  });

  app.get("/api/meta/steps", (_req, res) => {
    res.json({
      steps: STEP_ORDER.map((s) => ({ value: s, label: STEP_LABELS[s] })),
      transitions: STEP_ORDER.reduce((acc, s) => ({ ...acc, [s]: nextSteps(s) }), {})
    });
  });

  app.get("/api/demo", asyncHandler(async (_req, res) => {
    res.json(await getDemoSnapshot());
  }));

  // ===== Auth =====
  app.get("/api/auth/demo-users", asyncHandler(async (_req, res) => {
    res.json({ users: await getDemoUsers() });
  }));

  app.post("/api/auth/login", asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = await findUserByEmail(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Email ou senha invalidos." });
    }
    const token = crypto.randomUUID();
    sessions.set(token, { userId: user.id, createdAt: new Date().toISOString() });
    return res.json({ token, user: await getPublicUser(user.id) });
  }));

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    sessions.delete(req.sessionToken);
    res.status(204).send();
  });

  // ===== Portal =====
  app.get("/api/portal", requireAuth, asyncHandler(async (req, res) => {
    res.json(await getPortalSnapshot(req.user));
  }));

  app.get("/api/work-orders", requireAuth, asyncHandler(async (req, res) => {
    res.json(await getVisibleWorkOrders(req.user));
  }));

  app.get("/api/work-orders/:id", requireAuth, asyncHandler(async (req, res) => {
    const wo = await getWorkOrderById(req.params.id, req.user);
    if (!wo) return res.status(404).json({ message: "Ordem nao encontrada ou sem acesso." });
    return res.json(wo);
  }));

  app.get(
    "/api/customers",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (_req, res) => {
      res.json(await listCustomers());
    })
  );

  app.post(
    "/api/customers",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      const { name, email, password, vehicle } = req.body || {};
      const plate = vehicle?.plate;
      const model = vehicle?.model;

      if (!name || !email || !password) {
        return res.status(400).json({
          message: "name, email e password sao obrigatorios."
        });
      }

      const existing = await findUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "Ja existe um usuario com este email." });
      }

      if (vehicle && (!plate || !model)) {
        return res.status(400).json({
          message: "vehicle.plate e vehicle.model sao obrigatorios quando vehicle for enviado."
        });
      }

      const customer = vehicle ? await createCustomerWithVehicle({
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        password: String(password),
        plate: String(plate).trim().toUpperCase(),
        model: String(model).trim()
      }) : {
        customer: await createCustomer({
          name: String(name).trim(),
          email: String(email).trim().toLowerCase(),
          password: String(password)
        }),
        vehicle: null
      };

      await eventPublisher(ROUTING_KEYS.CUSTOMER_CREATED, {
        customerId: customer.customer.id,
        vehicleId: customer.vehicle?.id || null,
        createdBy: req.user.id,
        createdByRole: req.user.role
      });

      return res.status(201).json(customer);
    })
  );

  app.post(
    "/api/vehicles",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      const { ownerId, plate, model } = req.body || {};
      if (!ownerId || !plate || !model) {
        return res.status(400).json({ message: "ownerId, plate e model sao obrigatorios." });
      }

      const vehicle = await createVehicle({
        ownerId,
        plate: String(plate).trim().toUpperCase(),
        model: String(model).trim()
      });

      if (!vehicle) {
        return res.status(404).json({ message: "Cliente nao encontrado." });
      }

      await eventPublisher(ROUTING_KEYS.VEHICLE_CREATED, {
        customerId: ownerId,
        vehicleId: vehicle.id,
        createdBy: req.user.id,
        createdByRole: req.user.role
      });

      return res.status(201).json(vehicle);
    })
  );

  // ===== Veículos e mecânicos (para criação de OS) =====

  app.get(
    "/api/vehicles",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (_req, res) => {
      res.json(await listAllVehicles());
    })
  );

  app.get(
    "/api/customers/:id/vehicles",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      res.json(await listVehiclesByOwner(req.params.id));
    })
  );

  app.get(
    "/api/mechanics",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (_req, res) => {
      res.json(await listMechanics());
    })
  );

  // ===== Criar OS =====

  app.post(
    "/api/work-orders",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      const { vehicleId, mechanicIds, title, description } = req.body || {};
      if (!vehicleId || !title || !description) {
        return res.status(400).json({ message: "vehicleId, title e description sao obrigatorios." });
      }
      const order = await createWorkOrder({
        vehicleId,
        mechanicIds: Array.isArray(mechanicIds) ? mechanicIds : (mechanicIds ? [mechanicIds] : []),
        title: String(title).trim(),
        description: String(description).trim()
      });
      if (!order) return res.status(404).json({ message: "Veiculo nao encontrado." });

      await eventPublisher(ROUTING_KEYS.WORKORDER_OPENED, {
        workOrderId: order.id,
        customerId: order.customerId,
        vehicleId: order.vehicleId,
        createdBy: req.user.id
      });

      return res.status(201).json(order);
    })
  );

  // ===== Debug reset =====

  app.post(
    "/api/debug/reset",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (_req, res) => {
      await debugResetDatabase();
      sessions.clear();
      res.json({ ok: true, message: "Simulacao resetada. Faça login novamente." });
    })
  );

  // ===== Mídia =====
  app.post(
    "/api/work-orders/:id/media",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    upload.array("files", 10),
    asyncHandler(async (req, res) => {
      const wo = await getWorkOrderById(req.params.id, req.user);
      if (!wo) return res.status(404).json({ message: "Ordem nao encontrada ou sem acesso." });
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "Envie ao menos um arquivo." });
      }

      const records = await addMediaRecords(req.params.id, req.files, req.user.id);

      await Promise.all(records.map((record) =>
        mediaUploadedPublisher({
          event: "media.uploaded",
          mediaId: record.id,
          workOrderId: record.workOrderId,
          storedName: record.storedName,
          uploadedAt: record.createdAt
        })
      ));

      return res.status(201).json({
        message: "Arquivos recebidos e enviados para processamento.",
        media: records
      });
    })
  );

  // ===== Mensagens / comentários da OS =====
  app.post(
    "/api/work-orders/:id/messages",
    requireAuth,
    asyncHandler(async (req, res) => {
      const wo = await getWorkOrderById(req.params.id, req.user);
      if (!wo) return res.status(404).json({ message: "Ordem nao encontrada ou sem acesso." });
      const { text } = req.body || {};
      if (!text?.trim()) return res.status(400).json({ message: "text e obrigatorio." });
      const msg = await addMessage(req.params.id, req.user.name, req.user.role, text.trim());
      return res.json(msg);
    })
  );

  app.post("/internal/media/:id/status", asyncHandler(async (req, res) => {
    if (req.headers["x-internal-api-key"] !== internalApiKey) {
      return res.status(401).json({ message: "Nao autorizado." });
    }
    const status = req.body?.status;
    if (!status) return res.status(400).json({ message: "Status obrigatorio." });
    const media = await updateMediaStatus(req.params.id, status);
    if (!media) return res.status(404).json({ message: "Midia nao encontrada." });

    if (status === "PROCESSED") {
      await eventPublisher(ROUTING_KEYS.MEDIA_PROCESSED, {
        mediaId: media.id, workOrderId: media.workOrderId, fileName: media.fileName
      });
    } else if (status === "FAILED") {
      await eventPublisher(ROUTING_KEYS.MEDIA_FAILED, {
        mediaId: media.id, workOrderId: media.workOrderId
      });
    }

    return res.json(media);
  }));

  // ===== Máquina de estados das etapas =====
  // Permissões context-aware: o que cada papel pode fazer depende do estado atual da OS.
  function checkStepPermission(user, fromStep, toStep) {
    if (user.role === "CLIENTE") {
      // Cliente aprova/reprova orçamento inicial
      if (fromStep === STEPS.ORCAMENTO_ENVIADO &&
          (toStep === STEPS.ORCAMENTO_APROVADO || toStep === STEPS.ORCAMENTO_REPROVADO)) return null;
      // Cliente aprova ou cancela revisão de orçamento (peças adicionais)
      if (fromStep === STEPS.REVISAO_ORCAMENTO &&
          (toStep === STEPS.EM_REPARO || toStep === STEPS.CANCELADO)) return null;
      return "Sem permissao para esta operacao.";
    }
    if (user.role === "MECANICO") {
      // Mecânico não pode aprovar/reprovar orçamento do cliente
      if (toStep === STEPS.ORCAMENTO_APROVADO || toStep === STEPS.ORCAMENTO_REPROVADO) {
        return "Somente o cliente pode aprovar ou reprovar o orcamento.";
      }
      // Mecânico não pode aprovar sua própria revisão
      if (fromStep === STEPS.REVISAO_ORCAMENTO && toStep === STEPS.EM_REPARO) {
        return "Somente o cliente pode aprovar a revisao de orcamento.";
      }
      return null;
    }
    // ADMINISTRADOR: tudo permitido
    return null;
  }

  app.post(
    "/api/work-orders/:id/step",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR", "CLIENTE"]),
    asyncHandler(async (req, res) => {
      const wo = await getWorkOrderById(req.params.id, req.user);
      if (!wo) return res.status(404).json({ message: "Ordem nao encontrada ou sem acesso." });

      const newStep = req.body?.step;
      if (!newStep || !STEPS[newStep]) {
        return res.status(400).json({ message: "Etapa invalida." });
      }
      if (!canTransition(wo.step, newStep)) {
        return res.status(409).json({
          message: `Transicao invalida de ${wo.step} para ${newStep}.`,
          validNext: nextSteps(wo.step)
        });
      }

      const permError = checkStepPermission(req.user, wo.step, newStep);
      if (permError) return res.status(403).json({ message: permError });

      const result = await updateStep(req.params.id, newStep, req.user.id);

      // Publica evento no Topic Exchange
      await eventPublisher(ROUTING_KEYS.STEP_UPDATED, {
        workOrderId: req.params.id,
        fromStep: result.fromStep,
        toStep: result.toStep,
        changedBy: req.user.id,
        changedByName: req.user.name
      });

      // Ao enviar orçamento, publica budget.created com os valores
      if (newStep === STEPS.ORCAMENTO_ENVIADO) {
        await eventPublisher(ROUTING_KEYS.BUDGET_CREATED, {
          workOrderId: req.params.id,
          parts: wo.budget.parts,
          labor: wo.budget.labor,
          notes: wo.budget.notes
        });
      }

      // Ao cliente aprovar, publica budget.approved
      if (newStep === STEPS.ORCAMENTO_APROVADO) {
        await eventPublisher(ROUTING_KEYS.BUDGET_APPROVED, {
          workOrderId: req.params.id,
          approvedBy: req.user.id
        });
      }

      // Ao cliente reprovar, publica budget.rejected
      if (newStep === STEPS.ORCAMENTO_REPROVADO) {
        await eventPublisher(ROUTING_KEYS.BUDGET_REJECTED, {
          workOrderId: req.params.id,
          rejectedBy: req.user.id
        });
      }

      // Cliente aprova revisão de orçamento → budget.approved
      if (newStep === STEPS.EM_REPARO && wo.step === STEPS.REVISAO_ORCAMENTO) {
        await eventPublisher(ROUTING_KEYS.BUDGET_APPROVED, {
          workOrderId: req.params.id,
          approvedBy: req.user.id,
          revision: true
        });
      }

      // Cancelamento gera workorder.cancelled
      if (newStep === STEPS.CANCELADO) {
        await eventPublisher(ROUTING_KEYS.WORKORDER_COMPLETED, {
          workOrderId: req.params.id,
          completedBy: req.user.id,
          cancelled: true
        });
      }

      // Eventos terminais geram workorder.completed
      if (newStep === STEPS.ENTREGUE) {
        await eventPublisher(ROUTING_KEYS.WORKORDER_COMPLETED, {
          workOrderId: req.params.id,
          completedBy: req.user.id
        });
      }

      return res.status(200).json({ ok: true, ...result });
    })
  );

  // ===== Revisão de orçamento (após reprovação) =====
  app.put(
    "/api/work-orders/:id/budget",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      const wo = await getWorkOrderById(req.params.id, req.user);
      if (!wo) return res.status(404).json({ message: "Ordem nao encontrada ou sem acesso." });

      const allowedStates = [STEPS.ORCAMENTO_REPROVADO, STEPS.CAUSA_IDENTIFICADA];
      if (!allowedStates.includes(wo.step)) {
        return res.status(409).json({
          message: "O orçamento só pode ser revisado quando reprovado ou com causa identificada."
        });
      }

      const { labor, notes } = req.body || {};
      if (labor === undefined) {
        return res.status(400).json({ message: "labor e obrigatorio." });
      }
      if (Number(labor) < 0) {
        return res.status(400).json({ message: "labor nao pode ser negativo." });
      }

      const updated = await updateBudget(req.params.id, labor, notes ?? "");
      return res.json(updated);
    })
  );

  // ===== Orçamento inicial — adicionar item (catálogo ou item customizado) =====
  // Disponível antes de enviar o orçamento (CAUSA_IDENTIFICADA) ou após rejeição (ORCAMENTO_REPROVADO).
  app.post(
    "/api/work-orders/:id/budget/items",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      const wo = await getWorkOrderById(req.params.id, req.user);
      if (!wo) return res.status(404).json({ message: "Ordem nao encontrada ou sem acesso." });

      const BUDGET_ELIGIBLE = new Set([
        STEPS.RECEBIDO, STEPS.RELATO_REGISTRADO, STEPS.EM_DIAGNOSTICO,
        STEPS.CAUSA_IDENTIFICADA, STEPS.ORCAMENTO_REPROVADO
      ]);
      if (!BUDGET_ELIGIBLE.has(wo.step)) {
        return res.status(409).json({ message: "Itens de orçamento so podem ser adicionados antes do envio." });
      }

      const { description, priceCents, partId } = req.body || {};
      if (!description || !Number.isFinite(Number(priceCents)) || Number(priceCents) <= 0) {
        return res.status(400).json({ message: "description e priceCents (> 0) sao obrigatorios." });
      }

      const result = await addBudgetItem(
        req.params.id,
        String(description).trim(),
        Math.round(Number(priceCents)),
        req.user.id,
        partId || null
      );
      return res.json(result);
    })
  );

  // ===== Orçamento inicial — remover item =====
  app.delete(
    "/api/work-orders/:id/budget/items/:itemId",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      const wo = await getWorkOrderById(req.params.id, req.user);
      if (!wo) return res.status(404).json({ message: "Ordem nao encontrada ou sem acesso." });

      const BUDGET_ELIGIBLE = new Set([
        STEPS.RECEBIDO, STEPS.RELATO_REGISTRADO, STEPS.EM_DIAGNOSTICO,
        STEPS.CAUSA_IDENTIFICADA, STEPS.ORCAMENTO_REPROVADO
      ]);
      if (!BUDGET_ELIGIBLE.has(wo.step)) {
        return res.status(409).json({ message: "Itens so podem ser removidos antes do envio do orcamento." });
      }

      const result = await removeBudgetItem(req.params.id, req.params.itemId);
      if (!result) return res.status(404).json({ message: "Item nao encontrado." });
      return res.json(result);
    })
  );

  // ===== Revisão de orçamento — adicionar item (peça do catálogo ou item customizado) =====
  // Disponível a partir de ORCAMENTO_ENVIADO. Cada item adicionado soma ao orçamento e
  // transiciona para REVISAO_ORCAMENTO (se ainda não estiver lá). Se já estiver em
  // REVISAO_ORCAMENTO, apenas acumula mais itens sem mudar o step.
  app.post(
    "/api/work-orders/:id/revision/items",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      const wo = await getWorkOrderById(req.params.id, req.user);
      if (!wo) return res.status(404).json({ message: "Ordem nao encontrada ou sem acesso." });

      const REVISION_ELIGIBLE = new Set([
        STEPS.ORCAMENTO_ENVIADO, STEPS.ORCAMENTO_APROVADO,
        STEPS.PECAS_SOLICITADAS, STEPS.EM_REPARO, STEPS.REVISAO_ORCAMENTO
      ]);
      if (!REVISION_ELIGIBLE.has(wo.step)) {
        return res.status(409).json({
          message: "Revisao de orcamento nao disponivel nesta etapa."
        });
      }

      const { description, priceCents } = req.body || {};
      if (!description || !Number.isFinite(Number(priceCents)) || Number(priceCents) <= 0) {
        return res.status(400).json({ message: "description e priceCents (> 0) sao obrigatorios." });
      }

      const result = await addRevisionItem(
        req.params.id,
        String(description).trim(),
        Math.round(Number(priceCents)),
        req.user.id
      );

      // Transiciona para REVISAO_ORCAMENTO apenas se não estiver lá
      let stepResult = null;
      if (wo.step !== STEPS.REVISAO_ORCAMENTO) {
        stepResult = await updateStep(req.params.id, STEPS.REVISAO_ORCAMENTO, req.user.id);
        await eventPublisher(ROUTING_KEYS.STEP_UPDATED, {
          workOrderId: req.params.id,
          fromStep: stepResult.fromStep,
          toStep: stepResult.toStep,
          changedBy: req.user.id,
          changedByName: req.user.name
        });
      }

      await eventPublisher(ROUTING_KEYS.BUDGET_UPDATED, {
        workOrderId: req.params.id,
        description,
        addedCost: result.addedCost,
        updatedBy: req.user.id
      });

      return res.status(201).json({
        revisionItemId: result.revisionItemId,
        addedCost: result.addedCost,
        newStep: wo.step !== STEPS.REVISAO_ORCAMENTO ? STEPS.REVISAO_ORCAMENTO : wo.step
      });
    })
  );

  // ===== Peças =====
  app.get("/api/parts", requireAuth, asyncHandler(async (_req, res) => {
    res.json(await listParts());
  }));

  app.post(
    "/api/work-orders/:id/parts/request",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      const wo = await getWorkOrderById(req.params.id, req.user);
      if (!wo) return res.status(404).json({ message: "Ordem nao encontrada ou sem acesso." });

      const { partId, quantity } = req.body || {};
      if (!partId || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "partId e quantity (inteiro >0) sao obrigatorios." });
      }

      const request = await createPartRequest(req.params.id, partId, quantity, req.user.id);

      await eventPublisher(ROUTING_KEYS.PART_REQUESTED, {
        requestId: request.id,
        workOrderId: req.params.id,
        partId, quantity,
        requestedBy: req.user.id
      });

      res.status(201).json(request);
    })
  );

  app.post(
    "/api/work-orders/:id/parts/:requestId/install",
    requireAuth,
    requireAnyRole(["MECANICO", "ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      const result = await installPartRequest(req.params.requestId);
      await eventPublisher(ROUTING_KEYS.PART_INSTALLED, {
        requestId: req.params.requestId,
        workOrderId: req.params.id,
        installedBy: req.user.id
      });
      res.json(result);
    })
  );

  // ===== Gestor: Estoque =====
  app.get(
    "/api/manager/stock",
    requireAuth,
    requireAnyRole(["ADMINISTRADOR"]),
    asyncHandler(async (_req, res) => {
      const [parts, partRequests] = await Promise.all([listParts(), listPartRequests()]);
      res.json({ parts, partRequests });
    })
  );

  // ===== Gestor: Auditoria =====
  app.get(
    "/api/manager/audit",
    requireAuth,
    requireAnyRole(["ADMINISTRADOR"]),
    asyncHandler(async (_req, res) => {
      const events = await listAuditEvents(100);
      res.json(events);
    })
  );

  // ===== Endpoint interno usado pelo inventory-worker =====
  app.post("/internal/parts/:requestId/reserve", asyncHandler(async (req, res) => {
    if (req.headers["x-internal-api-key"] !== internalApiKey) {
      return res.status(401).json({ message: "Nao autorizado." });
    }
    const result = await reservePartRequest(req.params.requestId);
    if (!result) return res.status(404).json({ message: "Solicitacao nao encontrada." });

    if (result.status === "RESERVED") {
      await eventPublisher(ROUTING_KEYS.PART_RESERVED, { requestId: result.requestId });
    } else if (result.status === "OUT_OF_STOCK") {
      await eventPublisher(ROUTING_KEYS.PART_OUT_OF_STOCK, { requestId: result.requestId });
    }
    res.json(result);
  }));

  // ===== Endpoint interno usado pelo notification-worker =====
  app.post("/internal/notifications", asyncHandler(async (req, res) => {
    if (req.headers["x-internal-api-key"] !== internalApiKey) {
      return res.status(401).json({ message: "Nao autorizado." });
    }
    const { userId, workOrderId, title, body } = req.body || {};
    if (!userId || !title || !body) {
      return res.status(400).json({ message: "userId, title e body sao obrigatorios." });
    }
    const n = await createNotification(userId, workOrderId || null, title, body);
    res.status(201).json(n);
  }));

  // ===== Para o notification-worker descobrir quem notificar =====
  app.get("/internal/work-orders/:id/stakeholders", asyncHandler(async (req, res) => {
    if (req.headers["x-internal-api-key"] !== internalApiKey) {
      return res.status(401).json({ message: "Nao autorizado." });
    }
    res.json(await getWorkOrderStakeholders(req.params.id));
  }));

  // ===== Notificações do usuário logado =====
  app.get("/api/notifications", requireAuth, asyncHandler(async (req, res) => {
    res.json(await listNotifications(req.user.id));
  }));

  app.post("/api/notifications/read", requireAuth, asyncHandler(async (req, res) => {
    await markNotificationsRead(req.user.id);
    res.json({ ok: true });
  }));

  // ===== Broadcast manual (apenas gestor/admin) =====
  app.post(
    "/api/broadcast",
    requireAuth,
    requireAnyRole(["ADMINISTRADOR"]),
    asyncHandler(async (req, res) => {
      await broadcastPublisher({
        title: req.body?.title || "Aviso da oficina",
        body: req.body?.body || "",
        from: req.user.id
      });
      res.json({ ok: true });
    })
  );

  app.use((req, res) => {
    res.status(404).json({ message: `Rota nao encontrada: ${req.method} ${req.path}` });
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ message: "Erro interno no servidor." });
  });

  return app;
}
