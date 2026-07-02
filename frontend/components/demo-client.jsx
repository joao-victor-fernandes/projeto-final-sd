"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

const demoAccounts = [
  {
    role: "MECANICO", name: "Maria Souza", email: "maria@oficina.demo", password: "mecanico123",
    notes: "Avança etapas, revisa orçamentos, envia evidências."
  },
  {
    role: "ADMINISTRADOR", name: "Ana Martins", email: "ana@oficina.demo", password: "admin123",
    notes: "Acesso total ao sistema."
  },
  {
    role: "GESTOR", name: "Carlos Pereira", email: "carlos@oficina.demo", password: "gestor123",
    notes: "Dashboard gerencial, estoque, auditoria e avisos globais."
  },
  {
    role: "CLIENTE", name: "Joao Silva", email: "joao@oficina.demo", password: "cliente123",
    notes: "Acompanha a própria ordem e aprova orçamentos."
  },
  {
    role: "ATENDENTE", name: "Beatriz Lima", email: "beatriz@oficina.demo", password: "atendente123",
    notes: "Apenas cadastra clientes/veículos e abre ordens de serviço."
  },
];

const TERMINAL_STEPS = new Set(["ENTREGUE", "CANCELADO"]);

// Etapas em que o mecânico pode iniciar revisão de orçamento
const REVISION_ELIGIBLE = new Set([
  "ORCAMENTO_ENVIADO", "ORCAMENTO_APROVADO",
  "PECAS_SOLICITADAS", "EM_REPARO", "REVISAO_ORCAMENTO"
]);

// Destinos que só o cliente pode acionar via botão de step
const CLIENT_ONLY_TARGETS = new Set(["ORCAMENTO_APROVADO", "ORCAMENTO_REPROVADO"]);

function currency(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function statusLabel(s) {
  return { UPLOADED: "Enviado", PROCESSING: "Processando", PROCESSED: "Processado", FAILED: "Falhou" }[s] || s;
}

function stepLabel(s) {
  return ({
    RECEBIDO: "Recebido",
    RELATO_REGISTRADO: "Relato registrado",
    EM_DIAGNOSTICO: "Em diagnóstico",
    CAUSA_IDENTIFICADA: "Causa identificada",
    ORCAMENTO_ENVIADO: "Orçamento enviado",
    ORCAMENTO_APROVADO: "Orçamento aprovado",
    ORCAMENTO_REPROVADO: "Orçamento reprovado",
    PECAS_SOLICITADAS: "Peças solicitadas",
    EM_REPARO: "Em reparo",
    REVISAO_ORCAMENTO: "Revisão de orçamento",
    TESTE_FINAL: "Teste final",
    CONCLUIDO: "Concluído",
    ENTREGUE: "Entregue",
    CANCELADO: "Cancelado",
  })[s] || s;
}

function stepColor(s) {
  if (s === "CANCELADO") return "#b91c1c";
  if (s === "ENTREGUE" || s === "CONCLUIDO") return "#15803d";
  if (s === "ORCAMENTO_REPROVADO") return "#b45309";
  if (s === "ORCAMENTO_APROVADO") return "#15803d";
  if (s === "ORCAMENTO_ENVIADO" || s === "REVISAO_ORCAMENTO") return "#1d4ed8";
  return "#475569";
}

function auditTitle(ev) {
  const rk = ev.routingKey;
  const p = ev.payload || {};
  const by = p.changedByName || "";
  const wo = p.workOrderId ? ` — ${p.workOrderId}` : "";

  if (rk === "maintenance.step.updated") {
    const from = stepLabel(p.fromStep || "—");
    const to = stepLabel(p.toStep || "—");
    return `${by ? by + " alterou" : "Etapa alterada"}: ${from} → ${to}${wo}`;
  }
  if (rk === "budget.created") return `Orçamento enviado ao cliente${wo}`;
  if (rk === "budget.updated") return `Revisão de orçamento adicionada${wo}`;
  if (rk === "budget.approved") return `Orçamento aprovado${wo}`;
  if (rk === "budget.rejected") return `Orçamento recusado${wo}`;
  if (rk === "parts.requested") return `Peça solicitada${wo}`;
  if (rk === "parts.reserved") return `Peça reservada pelo inventory-worker${wo}`;
  if (rk === "parts.outofstock") return `Sem estoque — inventory-worker${wo}`;
  if (rk === "parts.installed") return `Peça instalada${wo}`;
  if (rk === "media.uploaded") return `Mídia enviada: ${p.fileCount ?? "?"} arquivo(s)${wo}`;
  if (rk === "media.processed") return `Mídia processada pelo media-worker: ${p.fileName || p.mediaId || "—"}${wo}`;
  if (rk === "workorder.completed") return `Serviço concluído${wo}`;
  return rk + wo;
}

function auditSummary(ev) {
  const rk = ev.routingKey;
  const p = ev.payload || {};
  if (rk === "maintenance.step.updated") return `${p.fromStep || "—"} → ${p.toStep || "—"} (${p.changedByName || "sistema"})`;
  if (rk === "budget.created") return `Orçamento: peças R$${p.parts ?? 0} + m.o. R$${p.labor ?? 0}`;
  if (rk === "budget.updated") return "Revisão de orçamento adicionada";
  if (rk === "budget.approved") return "Orçamento aprovado";
  if (rk === "budget.rejected") return "Orçamento recusado";
  if (rk === "parts.requested") return `Solicitação: ${p.requestId || "—"}`;
  if (rk === "parts.reserved") return `Peça reservada: ${p.requestId || "—"}`;
  if (rk === "parts.outofstock") return `Sem estoque: ${p.requestId || "—"}`;
  if (rk === "parts.installed") return `Peça instalada: ${p.requestId || "—"}`;
  if (rk === "media.uploaded") return `Upload: ${p.fileCount ?? "?"} arquivo(s)`;
  if (rk === "media.processed") return `Mídia processada: ${p.fileName || p.mediaId || "—"}`;
  if (rk === "workorder.completed") return "Serviço concluído";
  return JSON.stringify(p).slice(0, 80);
}

function getTabsForRole(role) {
  if (role === "CLIENTE") {
    return [
      { id: "orders", label: "Ordens" },
      { id: "timeline", label: "Linha do Tempo" },
      { id: "notifications", label: "Notificações" },
    ];
  }
  if (role === "ADMINISTRADOR") {
    return [
      { id: "dashboard", label: "Dashboard" },
      { id: "orders", label: "Ordens" },
      { id: "timeline", label: "Linha do Tempo" },
      { id: "notifications", label: "Notificações" },
      { id: "registrations", label: "Cadastros" },
      { id: "stock", label: "Estoque" },
      { id: "audit", label: "Auditoria" },
    ];
  }
  if (role === "GESTOR") {
    return [
      { id: "dashboard", label: "Dashboard" },
      { id: "orders", label: "Ordens" },
      { id: "timeline", label: "Linha do Tempo" },
      { id: "notifications", label: "Notificações" },
      { id: "stock", label: "Estoque" },
      { id: "audit", label: "Auditoria" },
    ];
  }
  if (role === "ATENDENTE") {
    // Atendente só cadastra clientes/veículos e abre OS — não acompanha ordens, estoque ou auditoria.
    return [{ id: "registrations", label: "Cadastros" }];
  }
  // MECANICO
  return [
    { id: "orders", label: "Ordens" },
    { id: "timeline", label: "Linha do Tempo" },
    { id: "notifications", label: "Notificações" },
    { id: "registrations", label: "Cadastros" },
  ];
}

const EMPTY_WO_FORM = { customerId: "", vehicleId: "", title: "", description: "", mechanicId: "" };
const EMPTY_REVISION_FORM = { description: "", priceCents: "", catalogPartId: "" };
const EMPTY_BUDGET_ITEM_FORM = { description: "", priceCents: "", catalogPartId: "" };

export function DemoClient({ debugMode = false }) {
  const [token, setToken] = useState("");
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [allVehicles, setAllVehicles] = useState([]);
  const [catalogParts, setCatalogParts] = useState([]);
  const [stepsMeta, setStepsMeta] = useState({ transitions: {} });
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("orders");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [stockData, setStockData] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const [commentText, setCommentText] = useState("");

  const [loginForm, setLoginForm] = useState({ email: demoAccounts[0].email, password: demoAccounts[0].password });
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", password: "" });
  const [vehicleForm, setVehicleForm] = useState({ ownerId: "", plate: "", model: "" });
  const [workOrderForm, setWorkOrderForm] = useState(EMPTY_WO_FORM);
  const [budgetForm, setBudgetForm] = useState({ labor: "", notes: "" });
  const [revisionForm, setRevisionForm] = useState(EMPTY_REVISION_FORM);
  const [budgetItemForm, setBudgetItemForm] = useState(EMPTY_BUDGET_ITEM_FORM);

  const [, startTransition] = useTransition();

  const currentOrder = useMemo(() => {
    if (!data?.workOrders?.length) return null;
    return data.workOrders.find((o) => o.id === selectedOrderId) || data.workOrders[0];
  }, [data, selectedOrderId]);

  const validNextSteps = useMemo(() => {
    if (!currentOrder) return [];
    return stepsMeta.transitions?.[currentOrder.step] || [];
  }, [currentOrder, stepsMeta]);

  const customerVehicles = useMemo(
    () => allVehicles.filter((v) => v.ownerId === workOrderForm.customerId),
    [allVehicles, workOrderForm.customerId]
  );

  useEffect(() => {
    if (currentOrder?.budget) {
      setBudgetForm({
        labor: currentOrder.budget.labor,
        notes: currentOrder.budget.notes,
      });
    }
    setCancelConfirm(false);
    setMessage("");
    setRevisionForm(EMPTY_REVISION_FORM);
    setBudgetItemForm(EMPTY_BUDGET_ITEM_FORM);
  }, [currentOrder?.id, currentOrder?.step]);

  function getHeaders(t = token) {
    return { Authorization: `Bearer ${t}` };
  }

  async function refresh(t = token) {
    const r = await fetch(`${API_BASE_URL}/api/portal`, { cache: "no-store", headers: getHeaders(t) });
    if (r.status === 401) {
      window.localStorage.removeItem("demo-token");
      setToken(""); setSession(null); setData(null); setSelectedOrderId("");
      setMessage("Sua sessão expirou. Entre novamente.");
      return;
    }
    const next = await r.json();
    setData(next);
    setSession(next.user);
    setSelectedOrderId((cv) => cv || next.workOrders[0]?.id || "");
  }

  async function loadOperatorData(t = token) {
    const [custR, mechR, vehR, partsR] = await Promise.all([
      fetch(`${API_BASE_URL}/api/customers`, { headers: getHeaders(t) }),
      fetch(`${API_BASE_URL}/api/mechanics`, { headers: getHeaders(t) }),
      fetch(`${API_BASE_URL}/api/vehicles`, { headers: getHeaders(t) }),
      fetch(`${API_BASE_URL}/api/parts`, { headers: getHeaders(t) }),
    ]);
    if (custR.ok) { const list = await custR.json(); setCustomers(list); setVehicleForm((cv) => ({ ...cv, ownerId: cv.ownerId || list[0]?.id || "" })); }
    if (mechR.ok) { setMechanics(await mechR.json()); }
    if (vehR.ok) { setAllVehicles(await vehR.json()); }
    if (partsR.ok) { setCatalogParts(await partsR.json()); }
  }

  async function loadCatalogParts(t = token) {
    const r = await fetch(`${API_BASE_URL}/api/parts`, { headers: getHeaders(t) });
    if (r.ok) setCatalogParts(await r.json());
  }

  async function loadManagerData(t = token) {
    const [stockR, auditR, dashR] = await Promise.all([
      fetch(`${API_BASE_URL}/api/manager/stock`, { headers: getHeaders(t) }),
      fetch(`${API_BASE_URL}/api/manager/audit`, { headers: getHeaders(t) }),
      fetch(`${API_BASE_URL}/api/manager/dashboard`, { headers: getHeaders(t) }),
    ]);
    if (stockR.ok) setStockData(await stockR.json());
    if (auditR.ok) setAuditData(await auditR.json());
    if (dashR.ok) setDashboardData(await dashR.json());
  }

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/meta/steps`).then((r) => r.json()).then(setStepsMeta).catch(() => { });
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("demo-token");
    if (!saved) return;
    setToken(saved);
    refresh(saved).catch(() => window.localStorage.removeItem("demo-token"));
  }, []);

  useEffect(() => {
    if (!token || !session) return;
    if (["MECANICO", "ADMINISTRADOR", "ATENDENTE"].includes(session.role)) {
      loadOperatorData(token).catch(() => { });
    } else {
      loadCatalogParts(token).catch(() => { });
    }
    if (["GESTOR", "ADMINISTRADOR"].includes(session.role)) {
      loadManagerData(token).catch(() => { });
    }
  }, [token, session?.id]);

  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(async () => {
      const t = tokenRef.current;
      if (!t) return;
      try {
        const r = await fetch(`${API_BASE_URL}/api/notifications`, {
          cache: "no-store", headers: { Authorization: `Bearer ${t}` },
        });
        if (r.ok) {
          const notifications = await r.json();
          setData((prev) => prev ? {
            ...prev, notifications,
            totals: { ...prev.totals, unreadNotifications: notifications.filter((n) => !n.read).length },
          } : prev);
        }
      } catch (_) { }
    }, 5000);
    return () => clearInterval(id);
  }, [token]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function handleLogin(e) {
    e.preventDefault();
    setMessage("Autenticando...");
    try {
      const r = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao autenticar."); return; }
      window.localStorage.setItem("demo-token", p.token);
      setToken(p.token); setSession(p.user);
      setActiveTab(
        p.user.role === "ATENDENTE" ? "registrations"
          : ["GESTOR", "ADMINISTRADOR"].includes(p.user.role) ? "dashboard"
            : "orders"
      ); setMessage("");
      await refresh(p.token);
    } catch (_) {
      setMessage(`Não foi possível conectar ao backend em ${API_BASE_URL}.`);
    }
  }

  async function handleLogout() {
    if (token) await fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST", headers: getHeaders() }).catch(() => { });
    window.localStorage.removeItem("demo-token");
    setToken(""); setSession(null); setData(null); setSelectedOrderId("");
    setActiveTab("orders"); setMessage("Sessão encerrada.");
  }

  async function handleDebugReset() {
    setMessage("Resetando simulação...");
    setResetConfirm(false);
    try {
      const r = await fetch(`${API_BASE_URL}/api/debug/reset`, { method: "POST", headers: getHeaders() });
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao resetar."); return; }
      window.localStorage.removeItem("demo-token");
      setToken(""); setSession(null); setData(null); setSelectedOrderId("");
      setCustomers([]); setMechanics([]); setAllVehicles([]);
      setWorkOrderForm(EMPTY_WO_FORM);
      setActiveTab("orders");
      setMessage("Simulação resetada! Faça login para continuar.");
    } catch (_) {
      setMessage("Não foi possível conectar ao backend.");
    }
  }

  async function advanceStep(toStep) {
    if (!currentOrder) return;
    setMessage(`Avançando para ${stepLabel(toStep)}...`);
    setCancelConfirm(false);
    try {
      const r = await fetch(`${API_BASE_URL}/api/work-orders/${currentOrder.id}/step`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ step: toStep }),
      });
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao avançar."); return; }
      setMessage(toStep === "CANCELADO" ? "Ordem cancelada." : `Etapa avançada para ${stepLabel(toStep)}.`);
      startTransition(async () => { await refresh(); });
    } catch (_) {
      setMessage("Não foi possível conectar ao backend.");
    }
  }

  // Preenche o form de revisão com os dados do item do catálogo selecionado
  function handleCatalogPartSelect(partId) {
    const part = catalogParts.find((p) => p.id === partId);
    if (part) {
      setRevisionForm({ catalogPartId: partId, description: part.name, priceCents: String(part.priceCents / 100) });
    } else {
      setRevisionForm((f) => ({ ...f, catalogPartId: partId }));
    }
  }

  function handleCatalogBudgetPartSelect(partId) {
    const part = catalogParts.find((p) => p.id === partId);
    if (part) {
      setBudgetItemForm({ catalogPartId: partId, description: part.name, priceCents: String(part.priceCents / 100) });
    } else {
      setBudgetItemForm((f) => ({ ...f, catalogPartId: partId }));
    }
  }

  async function handleRemoveBudgetItem(itemId) {
    if (!currentOrder) return;
    setMessage("Removendo item...");
    try {
      const r = await fetch(
        `${API_BASE_URL}/api/work-orders/${currentOrder.id}/budget/items/${itemId}`,
        { method: "DELETE", headers: getHeaders() }
      );
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao remover item."); return; }
      setMessage("Item removido.");
      startTransition(async () => { await refresh(); });
    } catch (_) {
      setMessage("Não foi possível conectar ao backend.");
    }
  }

  async function handleAddBudgetItem(e) {
    e.preventDefault();
    if (!currentOrder) return;
    const { description, priceCents, catalogPartId } = budgetItemForm;
    if (!description.trim() || !priceCents || Number(priceCents) <= 0) {
      setMessage("Preencha a descrição e um valor positivo.");
      return;
    }
    setMessage("Adicionando item ao orçamento...");
    try {
      const r = await fetch(`${API_BASE_URL}/api/work-orders/${currentOrder.id}/budget/items`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          priceCents: Math.round(Number(String(priceCents).replace(",", ".")) * 100),
          ...(catalogPartId ? { partId: catalogPartId } : {}),
        }),
      });
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao adicionar item."); return; }
      setMessage(`"${description}" adicionado (${currency(p.addedCost)}).`);
      setBudgetItemForm(EMPTY_BUDGET_ITEM_FORM);
      startTransition(async () => { await refresh(); });
    } catch (_) {
      setMessage("Não foi possível conectar ao backend.");
    }
  }

  async function handleAddRevisionItem(e) {
    e.preventDefault();
    if (!currentOrder) return;
    const { description, priceCents } = revisionForm;
    if (!description.trim() || !priceCents || Number(priceCents) <= 0) {
      setMessage("Preencha a descrição e um valor positivo.");
      return;
    }
    setMessage("Adicionando item ao orçamento...");
    try {
      const r = await fetch(`${API_BASE_URL}/api/work-orders/${currentOrder.id}/revision/items`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          priceCents: Math.round(Number(String(priceCents).replace(",", ".")) * 100),
        }),
      });
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao adicionar item."); return; }
      setMessage(`"${description}" adicionado (+${currency(p.addedCost)}). Aguardando aprovação do cliente.`);
      setRevisionForm(EMPTY_REVISION_FORM);
      startTransition(async () => { await refresh(); });
    } catch (_) {
      setMessage("Não foi possível conectar ao backend.");
    }
  }

  async function handleBudgetUpdate() {
    if (!currentOrder) return;
    const labor = parseFloat(String(budgetForm.labor).replace(",", "."));
    if (isNaN(labor) || labor < 0) {
      setMessage("Mão de obra deve ser um número positivo.");
      return;
    }
    setMessage("Salvando orçamento...");
    try {
      const r = await fetch(`${API_BASE_URL}/api/work-orders/${currentOrder.id}/budget`, {
        method: "PUT",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ labor, notes: budgetForm.notes }),
      });
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao salvar orçamento."); return; }
      await advanceStep("ORCAMENTO_ENVIADO");
    } catch (_) {
      setMessage("Não foi possível conectar ao backend.");
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!currentOrder) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    const files = formData.getAll("files").filter(Boolean);
    if (!files.length) { setMessage("Selecione um arquivo."); return; }
    setMessage("Enviando arquivos...");
    const r = await fetch(`${API_BASE_URL}/api/work-orders/${currentOrder.id}/media`, {
      method: "POST", headers: getHeaders(), body: formData,
    });
    const p = await r.json();
    if (!r.ok) { setMessage(p.message || "Falha no upload."); return; }
    setMessage("Upload concluído. O media-worker vai processar em segundo plano.");
    form.reset();
    startTransition(async () => { await refresh(); });
  }

  async function registerCustomer(e) {
    e.preventDefault();
    setMessage("Registrando cliente...");
    try {
      const r = await fetch(`${API_BASE_URL}/api/customers`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(customerForm),
      });
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao cadastrar cliente."); return; }
      setCustomerForm({ name: "", email: "", password: "" });
      await loadOperatorData();
      setMessage(`Cliente ${p.customer.name} cadastrado.`);
    } catch (_) { setMessage("Não foi possível conectar ao backend."); }
  }

  async function registerVehicle(e) {
    e.preventDefault();

    const cleanPlate = vehicleForm.plate.toUpperCase().replace(/[- ]/g, "");

    const BRAZILIAN_PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

    if (!BRAZILIAN_PLATE_REGEX.test(cleanPlate)) {
      setMessage("Erro: A placa digitada não é válida no padrão brasileiro (Tradicional ou Mercosul).");
      return;
    }

    setMessage("Registrando veículo...");
    try {
      const r = await fetch(`${API_BASE_URL}/api/vehicles`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(vehicleForm),
      });
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao cadastrar veículo."); return; }
      setVehicleForm((cv) => ({ ownerId: cv.ownerId, plate: "", model: "" }));
      await loadOperatorData();
      setMessage(`Veículo ${p.plate} cadastrado.`);
    } catch (_) { setMessage("Não foi possível conectar ao backend."); }
  }

  async function handleCreateWorkOrder(e) {
    e.preventDefault();
    const { vehicleId, title, description, mechanicId } = workOrderForm;
    if (!vehicleId || !title || !description) {
      setMessage("Selecione veículo, título e descrição.");
      return;
    }
    setMessage("Criando ordem de serviço...");
    try {
      const r = await fetch(`${API_BASE_URL}/api/work-orders`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, title, description, mechanicIds: mechanicId ? [mechanicId] : [] }),
      });
      const p = await r.json();
      if (!r.ok) { setMessage(p.message || "Falha ao criar ordem."); return; }
      setWorkOrderForm(EMPTY_WO_FORM);
      setMessage(`Ordem ${p.id} criada com sucesso!`);
      startTransition(async () => { await refresh(); });
    } catch (_) { setMessage("Não foi possível conectar ao backend."); }
  }

  async function handleSendComment(e) {
    e.preventDefault();
    if (!currentOrder || !commentText.trim()) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/work-orders/${currentOrder.id}/messages`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: commentText.trim() }),
      });
      if (!r.ok) { const p = await r.json(); setMessage(p.message || "Falha ao enviar."); return; }
      setCommentText("");
      startTransition(async () => { await refresh(); });
    } catch (_) {
      setMessage("Não foi possível conectar ao backend.");
    }
  }

  async function markAllRead() {
    await fetch(`${API_BASE_URL}/api/notifications/read`, { method: "POST", headers: getHeaders() });
    startTransition(async () => { await refresh(); });
  }

  // ── Login screen ──────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <main className="page">
        {debugMode && <div className="debug-bar"><span className="debug-label">MODO DEBUG</span></div>}
        <section className="hero">
          <h1>Portal Oficina</h1>
          <p>Plataforma distribuída orientada a eventos para acompanhamento em tempo real de manutenção veicular.</p>
        </section>
        <section className="grid">
          <div className="panel">
            <div className="two-col login-cols">
              <div>
                <h2 style={{ marginBottom: 20 }}>Entrar</h2>
                <form className="upload-form" onSubmit={handleLogin}>
                  <label>
                    <div className="label">Email</div>
                    <input className="text-input" type="email" value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
                  </label>
                  <label>
                    <div className="label">Senha</div>
                    <input className="text-input" type="password" value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
                  </label>
                  <div className="actions" style={{ marginTop: 4 }}>
                    <button className="button" type="submit" style={{ width: "100%", justifyContent: "center" }}>
                      Entrar
                    </button>
                  </div>
                </form>
                {message && <p className="hint feedback-msg" style={{ marginTop: 14 }}>{message}</p>}
              </div>
              <div>
                <h2 style={{ marginBottom: 20 }}>Contas disponíveis</h2>
                <ul className="account-list">
                  {demoAccounts.map((a) => (
                    <li className="message-card account-card" key={a.email}>
                      <span className="role-chip" style={{ marginBottom: 8, display: "inline-block" }}>{a.role}</span>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.name}</div>
                      <div className="hint" style={{ marginBottom: 2 }}>{a.email}</div>
                      <div className="hint" style={{ marginBottom: 8 }}>Senha: <code>{a.password}</code></div>
                      <div className="hint" style={{ marginBottom: 12, fontSize: "0.8rem" }}>{a.notes}</div>
                      <button className="button secondary" type="button"
                        style={{ width: "100%", justifyContent: "center" }}
                        onClick={() => setLoginForm({ email: a.email, password: a.password })}>
                        Usar esta conta
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // ── Role flags ────────────────────────────────────────────────────────────────
  const isOperator = ["MECANICO", "ADMINISTRADOR"].includes(session.role);
  const canRegister = ["MECANICO", "ADMINISTRADOR", "ATENDENTE"].includes(session.role);
  const isMechanic = session.role === "MECANICO";
  const isClient = session.role === "CLIENTE";
  const isTerminal = currentOrder ? TERMINAL_STEPS.has(currentOrder.step) : false;
  const tabs = getTabsForRole(session.role);
  const unread = data?.totals?.unreadNotifications ?? 0;

  // Botões de avanço de step para o operador — exclui CANCELADO, destinos client-only,
  // REVISAO_ORCAMENTO (gerenciado pelo formulário de revisão), EM_REPARO quando vindo de REVISAO,
  // e ORCAMENTO_ENVIADO quando em CAUSA_IDENTIFICADA (substituído pelo formulário de orçamento)
  const advanceSteps = validNextSteps.filter(
    (s) => s !== "CANCELADO" &&
      s !== "REVISAO_ORCAMENTO" &&
      !CLIENT_ONLY_TARGETS.has(s) &&
      !(currentOrder?.step === "REVISAO_ORCAMENTO" && s === "EM_REPARO") &&
      !(currentOrder?.step === "CAUSA_IDENTIFICADA" && s === "ORCAMENTO_ENVIADO")
  );

  const canClientDecide = isClient && currentOrder?.step === "ORCAMENTO_ENVIADO";
  const canClientRevision = isClient && currentOrder?.step === "REVISAO_ORCAMENTO";
  // canSendBudget: CAUSA_IDENTIFICADA = primeiro envio; ORCAMENTO_REPROVADO = reenvio
  const canSendBudget = isOperator && ["CAUSA_IDENTIFICADA", "ORCAMENTO_REPROVADO"].includes(currentOrder?.step);
  const canRevise = isOperator && currentOrder && REVISION_ELIGIBLE.has(currentOrder.step);
  const canCancel = isOperator && currentOrder && !isTerminal;

  // ── Painel de revisão de orçamento (mecânico) ─────────────────────────────────
  function renderRevisionPanel() {
    const isAlreadyInRevision = currentOrder?.step === "REVISAO_ORCAMENTO";
    const items = currentOrder?.revisionItems ?? [];

    return (
      <div className={`detail-section ${isAlreadyInRevision ? "revision-alert" : ""}`}>
        <h3>
          {isAlreadyInRevision
            ? "Revisão pendente — aguardando aprovação do cliente"
            : "Revisar orçamento"}
        </h3>

        {isAlreadyInRevision && (
          <p className="hint" style={{ marginBottom: 14 }}>
            O cliente está avaliando a revisão. Você pode adicionar mais itens enquanto aguarda.
          </p>
        )}

        {/* Itens já adicionados */}
        {items.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 8 }}>Itens na revisão</div>
            <ul className="parts-list">
              {items.map((item) => (
                <li className="parts-item" key={item.id}>
                  <div>
                    <strong>{item.description}</strong>
                  </div>
                  <strong style={{ color: "var(--text)", whiteSpace: "nowrap" }}>
                    {currency(item.priceCents / 100)}
                  </strong>
                </li>
              ))}
              <li className="parts-item" style={{ background: "var(--primary-light)", borderColor: "var(--primary-muted)" }}>
                <div><strong>Total adicionado</strong></div>
                <strong style={{ color: "var(--primary)" }}>
                  {currency(items.reduce((s, i) => s + i.priceCents / 100, 0))}
                </strong>
              </li>
            </ul>
          </div>
        )}

        {/* Selecionar do catálogo para pré-preencher */}
        <div className="upload-form" style={{ marginBottom: 0 }}>
          <label>
            <div className="label">Pré-preencher do catálogo (opcional)</div>
            <select className="text-input" value={revisionForm.catalogPartId}
              onChange={(e) => handleCatalogPartSelect(e.target.value)}>
              <option value="">Selecione uma peça do catálogo...</option>
              {catalogParts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {currency(p.priceCents / 100)}
                </option>
              ))}
            </select>
          </label>

          <form onSubmit={handleAddRevisionItem} style={{ display: "contents" }}>
            <div className="budget-inputs">
              <label>
                <div className="label">Descrição do item</div>
                <input className="text-input" placeholder="Ex: Engrenagem principal, Mão de obra extra..."
                  value={revisionForm.description}
                  onChange={(e) => setRevisionForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
              <label>
                <div className="label">Valor (R$)</div>
                <input className="text-input" type="number" min="0.01" step="0.01" placeholder="0,00"
                  value={revisionForm.priceCents}
                  onChange={(e) => setRevisionForm((f) => ({ ...f, priceCents: e.target.value }))} />
              </label>
            </div>
            <div className="actions">
              <button className="button" type="submit">+ Adicionar item ao orçamento</button>
              {!isAlreadyInRevision && items.length === 0 && (
                <span className="hint" style={{ alignSelf: "center" }}>
                  O primeiro item enviará a revisão ao cliente.
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── Order detail panel ────────────────────────────────────────────────────────
  function renderOrderDetail() {
    if (!currentOrder) return <p className="hint">Selecione uma ordem na lista ao lado.</p>;

    const isCancelled = currentOrder.step === "CANCELADO";

    return (
      <div className="order-detail">
        <div style={{ marginBottom: 16 }}>
          <h2 className="order-detail-title">{currentOrder.title}</h2>
          <p className="hint" style={{ margin: 0 }}>{currentOrder.description}</p>
        </div>

        <ul className="meta-list" style={{ marginBottom: 20 }}>
          <li><strong>Cliente:</strong> {currentOrder.customer.name}</li>
          <li><strong>Veículo:</strong> {currentOrder.vehicle.model} — placa {currentOrder.vehicle.plate}</li>
          <li>
            <strong>Etapa:</strong>{" "}
            <span style={{ color: stepColor(currentOrder.step), fontWeight: 700 }}>
              {stepLabel(currentOrder.step)}
            </span>
          </li>
          <li><strong>Mecânicos:</strong> {currentOrder.mechanics.length ? currentOrder.mechanics.map((m) => m.name).join(", ") : "—"}</li>
        </ul>

        {/* Resumo do orçamento */}
        {!isCancelled && (
          <div className="budget-summary">
            {(currentOrder.budgetItems ?? []).length > 0 ? (
              (currentOrder.budgetItems).map((item) => (
                <div key={item.id} className="budget-row">
                  <span>{item.description}</span>
                  <strong>{currency(item.priceCents / 100)}</strong>
                </div>
              ))
            ) : (
              <div className="budget-row">
                <span>Peças / materiais</span>
                <strong>{currency(currentOrder.budget.parts)}</strong>
              </div>
            )}
            <div className="budget-row"><span>Mão de obra</span><strong>{currency(currentOrder.budget.labor)}</strong></div>
            {currentOrder.budget.notes && <div className="budget-notes">{currentOrder.budget.notes}</div>}
            <div className="budget-row budget-total">
              <span>Total</span>
              <strong>{currency(currentOrder.budget.parts + currentOrder.budget.labor)}</strong>
            </div>
          </div>
        )}

        {/* Cliente: decisão sobre orçamento inicial */}
        {canClientDecide && (
          <div className="detail-section">
            <h3>Aguardando sua decisão</h3>
            <p className="hint" style={{ marginBottom: 14 }}>
              O mecânico enviou um orçamento. Revise os valores acima e escolha uma opção.
            </p>
            <div className="actions">
              <button className="button" type="button" onClick={() => advanceStep("ORCAMENTO_APROVADO")}>
                Aprovar orçamento
              </button>
              <button className="button secondary" type="button" onClick={() => advanceStep("ORCAMENTO_REPROVADO")}>
                Recusar orçamento
              </button>
            </div>
          </div>
        )}

        {/* Cliente: revisão de orçamento enviada pelo mecânico */}
        {canClientRevision && (
          <div className="detail-section revision-alert">
            <h3>O mecânico adicionou itens ao orçamento</h3>
            <p className="hint" style={{ marginBottom: 14 }}>
              Itens adicionais foram identificados durante o serviço. Revise abaixo e decida.
            </p>
            {currentOrder.revisionItems.length > 0 && (
              <ul className="parts-list" style={{ marginBottom: 16 }}>
                {currentOrder.revisionItems.map((item) => (
                  <li className="parts-item" key={item.id}>
                    <div><strong>{item.description}</strong></div>
                    <strong>{currency(item.priceCents / 100)}</strong>
                  </li>
                ))}
                <li className="parts-item" style={{ background: "var(--primary-light)", borderColor: "var(--primary-muted)" }}>
                  <div><strong>Total adicionado</strong></div>
                  <strong style={{ color: "var(--primary)" }}>
                    {currency(currentOrder.revisionItems.reduce((s, i) => s + i.priceCents / 100, 0))}
                  </strong>
                </li>
              </ul>
            )}
            <div className="actions">
              <button className="button" type="button" onClick={() => advanceStep("EM_REPARO")}>
                Aceitar novo orçamento
              </button>
              <button className="button danger" type="button" onClick={() => advanceStep("CANCELADO")}>
                Recusar e cancelar
              </button>
            </div>
          </div>
        )}

        {/* Operador: avançar etapa (steps normais) */}
        {isOperator && !isCancelled && advanceSteps.length > 0 && (
          <div className="detail-section">
            <h3>Avançar etapa</h3>
            <div className="actions">
              {advanceSteps.map((s) => (
                <button key={s} className="button" type="button" onClick={() => advanceStep(s)}>
                  → {stepLabel(s)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mecânico: formulário de orçamento — primeiro envio (CAUSA_IDENTIFICADA) ou reenvio (ORCAMENTO_REPROVADO) */}
        {canSendBudget && (
          <div className="detail-section budget-revision">
            <h3>
              {currentOrder.step === "CAUSA_IDENTIFICADA"
                ? "Montar orçamento"
                : "Orçamento recusado — revisar e reenviar"}
            </h3>
            <p className="hint" style={{ marginBottom: 14 }}>
              {currentOrder.step === "CAUSA_IDENTIFICADA"
                ? "Adicione as peças e serviços necessários, depois envie ao cliente para aprovação."
                : "Revise os itens e valores abaixo, reenvie ou cancele a ordem."}
            </p>

            {/* Itens já no orçamento */}
            {(currentOrder.budgetItems ?? []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="label" style={{ marginBottom: 8 }}>Itens no orçamento</div>
                <ul className="parts-list">
                  {currentOrder.budgetItems.map((item) => (
                    <li className="parts-item" key={item.id}>
                      <div><strong>{item.description}</strong></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
                        <strong style={{ color: "var(--text)" }}>
                          {currency(item.priceCents / 100)}
                        </strong>
                        <button
                          type="button"
                          title="Remover item"
                          onClick={() => handleRemoveBudgetItem(item.id)}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "var(--danger)", fontSize: "1rem", padding: "0 2px",
                            lineHeight: 1
                          }}>
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                  <li className="parts-item" style={{ background: "var(--primary-light)", borderColor: "var(--primary-muted)" }}>
                    <div><strong>Subtotal peças</strong></div>
                    <strong style={{ color: "var(--primary)" }}>
                      {currency(currentOrder.budgetItems.reduce((s, i) => s + i.priceCents / 100, 0))}
                    </strong>
                  </li>
                </ul>
              </div>
            )}

            {/* Adicionar item: catálogo + item customizado */}
            <div className="upload-form" style={{ marginBottom: 16 }}>
              <label>
                <div className="label">Selecionar do catálogo (opcional)</div>
                <select className="text-input" value={budgetItemForm.catalogPartId}
                  onChange={(e) => handleCatalogBudgetPartSelect(e.target.value)}>
                  <option value="">Selecione uma peça do catálogo...</option>
                  {catalogParts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {currency(p.priceCents / 100)}
                    </option>
                  ))}
                </select>
              </label>
              <form onSubmit={handleAddBudgetItem} style={{ display: "contents" }}>
                <div className="budget-inputs">
                  <label>
                    <div className="label">Descrição do item</div>
                    <input className="text-input" placeholder="Ex: Pastilha de freio, Mão de obra diagnóstico..."
                      value={budgetItemForm.description}
                      onChange={(e) => setBudgetItemForm((f) => ({ ...f, description: e.target.value }))} />
                  </label>
                  <label>
                    <div className="label">Valor (R$)</div>
                    <input className="text-input" type="number" min="0.01" step="0.01" placeholder="0,00"
                      value={budgetItemForm.priceCents}
                      onChange={(e) => setBudgetItemForm((f) => ({ ...f, priceCents: e.target.value }))} />
                  </label>
                </div>
                <div className="actions">
                  <button className="button secondary" type="submit">+ Adicionar item</button>
                </div>
              </form>
            </div>

            {/* Mão de obra + Observações + Enviar */}
            <div className="upload-form">
              <div className="budget-inputs">
                <label>
                  <div className="label">Mão de obra (R$)</div>
                  <input className="text-input" type="number" min="0" step="0.01" placeholder="0,00"
                    value={budgetForm.labor}
                    onChange={(e) => setBudgetForm({ ...budgetForm, labor: e.target.value })} />
                </label>
              </div>
              <label>
                <div className="label">Observações</div>
                <input className="text-input" value={budgetForm.notes}
                  placeholder="Observações sobre o orçamento..."
                  onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })} />
              </label>
              <div className="actions">
                <button className="button" type="button" onClick={handleBudgetUpdate}>
                  {currentOrder.step === "CAUSA_IDENTIFICADA" ? "Enviar orçamento ao cliente" : "Reenviar orçamento"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Operador: painel de revisão de orçamento */}
        {canRevise && renderRevisionPanel()}

        {/* Operador: upload de evidências (bloqueado quando ordem encerrada) */}
        {isOperator && !isTerminal && (
          <div className="detail-section">
            <h3>Upload de evidências</h3>
            <form className="upload-form" onSubmit={handleUpload}>
              <input type="file" name="files" multiple accept="video/*,image/*" />
              <div className="actions">
                <button className="button" type="submit">Enviar mídias</button>
                <button className="button secondary" type="button"
                  onClick={() => startTransition(() => refresh())}>Atualizar</button>
              </div>
            </form>
          </div>
        )}

        {/* Mídias — visível para todos */}
        {currentOrder.media.length > 0 && (
          <div className="detail-section">
            <h3>Evidências / Mídias</h3>
            <ul className="media-list">
              {currentOrder.media.map((m) => (
                <li className="media-card" key={m.id}>
                  <strong>{m.fileName}</strong>
                  <div style={{ marginTop: 8 }}>
                    <span className={`badge ${m.status}`}>{statusLabel(m.status)}</span>
                  </div>
                  <div className="hint" style={{ marginTop: 6 }}>{(m.size / 1024 / 1024).toFixed(2)} MB</div>
                  {m.status === "PROCESSED" && (
                    m.contentType?.startsWith("video/") ? (
                      <video className="video" controls src={`${API_BASE_URL}/media/${m.storedName}`} />
                    ) : (
                      <img className="video" src={`${API_BASE_URL}/media/${m.storedName}`} alt={m.fileName} />
                    )
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Comentários — visível por todos; form bloqueado quando ordem encerrada */}
        <div className="detail-section">
          <h3>Comentários</h3>
          {currentOrder.messages.length === 0 ? (
            <p className="hint" style={{ marginBottom: 12 }}>Nenhum comentário ainda.</p>
          ) : (
            <ul className="comment-list">
              {currentOrder.messages.map((m) => (
                <li key={m.id} className={`comment-item ${m.role === "CLIENTE" ? "comment-client" : "comment-mechanic"}`}>
                  <div className="comment-header">
                    <strong>{m.author}</strong>
                    <span className="role-chip" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>{m.role}</span>
                    <span className="hint" style={{ fontSize: "0.78rem" }}>
                      {new Date(m.sentAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="comment-text">{m.text}</div>
                </li>
              ))}
            </ul>
          )}
          {isTerminal ? (
            <p className="hint" style={{ marginTop: 10, fontStyle: "italic" }}>
              Ordem encerrada — comentários desabilitados.
            </p>
          ) : (
            <form onSubmit={handleSendComment} style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                className="text-input"
                placeholder="Escreva um comentário..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="button" type="submit" disabled={!commentText.trim()}>
                Enviar
              </button>
            </form>
          )}
        </div>

        {/* Atualizar (cliente) */}
        {isClient && !isCancelled && (
          <div style={{ marginTop: 8 }}>
            <button className="button secondary" type="button"
              onClick={() => startTransition(() => refresh())}>Atualizar</button>
          </div>
        )}

        {/* Cancelar OS */}
        {canCancel && (
          <div className="cancel-section">
            {!cancelConfirm ? (
              <button className="button danger" type="button" onClick={() => setCancelConfirm(true)}>
                Cancelar ordem
              </button>
            ) : (
              <div className="cancel-confirm">
                <p>Tem certeza? Esta ação não pode ser desfeita.</p>
                <div className="actions">
                  <button className="button danger" type="button" onClick={() => advanceStep("CANCELADO")}>
                    Confirmar cancelamento
                  </button>
                  <button className="button secondary" type="button" onClick={() => setCancelConfirm(false)}>
                    Voltar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {message && <p className="hint feedback-msg">{message}</p>}
      </div>
    );
  }

  // ── Authenticated shell ───────────────────────────────────────────────────────
  return (
    <main className="page">
      {debugMode && (
        <div className="debug-bar">
          <span className="debug-label">MODO DEBUG</span>
          {!resetConfirm ? (
            <button className="button danger" type="button" onClick={() => setResetConfirm(true)}>
              Resetar simulação
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "0.85rem", color: "#c4b5fd", fontWeight: 600 }}>
                Apaga todos os dados de demo. Continuar?
              </span>
              <button className="button danger" type="button" onClick={handleDebugReset}>
                Confirmar reset
              </button>
              <button className="button secondary" type="button" onClick={() => setResetConfirm(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      <header className="app-header">
        <div>
          <h1 className="app-title">Portal Oficina</h1>
          <span className="hint">
            {session.name} <span className="role-chip">{session.role}</span> {session.email}
          </span>
        </div>
        <button className="button secondary" type="button" onClick={handleLogout}>Sair</button>
      </header>

      <nav className="tab-nav">
        {tabs.map((tab) => (
          <button key={tab.id} type="button"
            className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => { setActiveTab(tab.id); setMessage(""); }}>
            {tab.label}
            {tab.id === "notifications" && unread > 0 && (
              <span className="tab-badge">{unread}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="tab-content">

        {/* ── ABA: Dashboard (GESTOR e ADMINISTRADOR) ──────────────────────── */}
        {activeTab === "dashboard" && ["GESTOR", "ADMINISTRADOR"].includes(session.role) && (
          <div className="panel">
            <div className="topbar" style={{ marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>Dashboard Gerencial</h2>
              <button className="button secondary" type="button" onClick={() => loadManagerData()}>
                Atualizar
              </button>
            </div>

            {!dashboardData ? (
              <p className="hint">Carregando métricas...</p>
            ) : (
              <>
                {/* KPIs */}
                <div className="dash-kpis">
                  <div className="dash-kpi">
                    <strong>{dashboardData.orders.total}</strong>
                    <span>ordens no total</span>
                  </div>
                  <div className="dash-kpi">
                    <strong style={{ color: "var(--primary)" }}>{dashboardData.orders.active}</strong>
                    <span>em andamento</span>
                  </div>
                  <div className="dash-kpi">
                    <strong style={{ color: "var(--success)" }}>{dashboardData.orders.concluded}</strong>
                    <span>concluídas</span>
                  </div>
                  <div className="dash-kpi">
                    <strong style={{ color: "#b91c1c" }}>{dashboardData.orders.cancelled}</strong>
                    <span>canceladas</span>
                  </div>
                  <div className="dash-kpi">
                    <strong style={{ color: "var(--success)" }}>{currency(dashboardData.budget.concludedValue)}</strong>
                    <span>faturado (concluídas)</span>
                  </div>
                  <div className="dash-kpi">
                    <strong style={{ color: "var(--primary)" }}>{currency(dashboardData.budget.activeValue)}</strong>
                    <span>em orçamentos ativos</span>
                  </div>
                  <div className="dash-kpi">
                    <strong>{dashboardData.media.processed}/{dashboardData.media.total}</strong>
                    <span>mídias processadas</span>
                  </div>
                </div>

                <div className="dash-grid">
                  {/* Ordens por etapa */}
                  <div className="dash-card">
                    <h3>Ordens por etapa</h3>
                    {(() => {
                      const byStep = dashboardData.orders.byStep || [];
                      const order = (stepsMeta.steps || []).map((s) => s.value);
                      const sorted = [...byStep].sort(
                        (a, b) => order.indexOf(a.step) - order.indexOf(b.step)
                      );
                      const max = Math.max(1, ...sorted.map((s) => s.count));
                      return sorted.length === 0 ? (
                        <p className="hint">Sem ordens registradas.</p>
                      ) : (
                        <div className="dash-bars">
                          {sorted.map((s) => (
                            <div className="dash-bar-row" key={s.step}>
                              <span className="dash-bar-label">{stepLabel(s.step)}</span>
                              <div className="dash-bar-track">
                                <div className="dash-bar-fill"
                                  style={{ width: `${(s.count / max) * 100}%`, background: stepColor(s.step) }} />
                              </div>
                              <span className="dash-bar-value">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Carga por mecânico */}
                  <div className="dash-card">
                    <h3>OS ativas por mecânico</h3>
                    {!dashboardData.mechanicLoad?.length ? (
                      <p className="hint">Nenhum mecânico cadastrado.</p>
                    ) : (
                      <div className="dash-bars">
                        {(() => {
                          const max = Math.max(1, ...dashboardData.mechanicLoad.map((m) => m.activeOrders));
                          return dashboardData.mechanicLoad.map((m) => (
                            <div className="dash-bar-row" key={m.id}>
                              <span className="dash-bar-label">{m.name}</span>
                              <div className="dash-bar-track">
                                <div className="dash-bar-fill"
                                  style={{ width: `${(m.activeOrders / max) * 100}%`, background: "var(--primary)" }} />
                              </div>
                              <span className="dash-bar-value">{m.activeOrders}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Solicitações de peças */}
                  <div className="dash-card">
                    <h3>Solicitações de peças</h3>
                    {!dashboardData.partRequestsByStatus?.length ? (
                      <p className="hint">Nenhuma solicitação registrada.</p>
                    ) : (
                      <div className="dash-chips">
                        {dashboardData.partRequestsByStatus.map((s) => {
                          const badgeClass =
                            s.status === "RESERVED" || s.status === "INSTALLED" ? "PROCESSED"
                              : s.status === "OUT_OF_STOCK" ? "FAILED"
                                : "UPLOADED";
                          return (
                            <div className="dash-chip" key={s.status}>
                              <span className={`badge ${badgeClass}`}>{s.status}</span>
                              <strong>{s.count}</strong>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Estoque baixo */}
                  <div className="dash-card">
                    <h3>Estoque baixo (≤ 5 unidades)</h3>
                    {!dashboardData.stock.lowStock?.length ? (
                      <p className="hint" style={{ color: "var(--success)" }}>
                        Nenhuma peça com estoque crítico.
                      </p>
                    ) : (
                      <ul className="dash-low-stock">
                        {dashboardData.stock.lowStock.map((p) => (
                          <li key={p.id}>
                            <div>
                              <strong>{p.name}</strong>
                              <div className="hint" style={{ fontSize: "0.78rem" }}><code>{p.code}</code></div>
                            </div>
                            <span className="badge FAILED">{p.stock} un.</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Eventos por routing key */}
                  <div className="dash-card">
                    <h3>Eventos no broker (por routing key)</h3>
                    {!dashboardData.eventsByRoutingKey?.length ? (
                      <p className="hint">Nenhum evento capturado ainda.</p>
                    ) : (
                      <div className="dash-bars">
                        {(() => {
                          const max = Math.max(1, ...dashboardData.eventsByRoutingKey.map((e) => e.count));
                          return dashboardData.eventsByRoutingKey.map((e) => (
                            <div className="dash-bar-row" key={e.routingKey}>
                              <span className="dash-bar-label"><code style={{ fontSize: "0.75rem" }}>{e.routingKey}</code></span>
                              <div className="dash-bar-track">
                                <div className="dash-bar-fill"
                                  style={{ width: `${(e.count / max) * 100}%`, background: "var(--text-2)" }} />
                              </div>
                              <span className="dash-bar-value">{e.count}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Últimos eventos de auditoria */}
                  <div className="dash-card">
                    <h3>Atividade recente</h3>
                    {!dashboardData.recentAudit?.length ? (
                      <p className="hint">Nenhum evento registrado ainda.</p>
                    ) : (
                      <ul className="dash-activity">
                        {dashboardData.recentAudit.map((ev) => (
                          <li key={ev.id}>
                            <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{auditTitle(ev)}</div>
                            <div className="hint" style={{ fontSize: "0.78rem" }}>
                              {new Date(ev.receivedAt).toLocaleString("pt-BR")}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ABA: Ordens ─────────────────────────────────────────────────────── */}
        {activeTab === "orders" && (
          <>
            <div className="panel stats-panel">
              <h2>Visão rápida</h2>
              <div className="stats">
                <div className="stat"><strong>{data?.totals.workOrders ?? 0}</strong><span>ordens</span></div>
                <div className="stat"><strong>{data?.totals.media ?? 0}</strong><span>mídias</span></div>
                <div className="stat"><strong>{data?.totals.processed ?? 0}</strong><span>processadas</span></div>
                <div className="stat"><strong>{data?.totals.pending ?? 0}</strong><span>pendentes</span></div>
                <div className="stat"><strong>{unread}</strong><span>avisos novos</span></div>
              </div>
            </div>
            <div className="panel">
              <div className="order-cols">
                <div>
                  <h2>Ordens visíveis</h2>
                  <div className="order-list">
                    {!(data?.workOrders?.length) && <p className="hint">Nenhuma ordem visível.</p>}
                    {(data?.workOrders || []).map((o) => (
                      <button key={o.id} type="button"
                        className={`order-button ${currentOrder?.id === o.id ? "active" : ""} ${TERMINAL_STEPS.has(o.step) ? "terminal" : ""}`}
                        onClick={() => setSelectedOrderId(o.id)}>
                        <strong>{o.id}</strong>
                        <span>{o.title}</span>
                        <small style={{ color: stepColor(o.step) }}>{stepLabel(o.step)}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <div>{renderOrderDetail()}</div>
              </div>
            </div>
          </>
        )}

        {/* ── ABA: Linha do Tempo ─────────────────────────────────────────────── */}
        {activeTab === "timeline" && (
          <div className="panel">
            <div className="topbar" style={{ marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>Linha do Tempo</h2>
              <button className="button secondary" type="button"
                onClick={() => startTransition(() => refresh())}>Atualizar</button>
            </div>
            {!(data?.workOrders?.length) ? (
              <p className="hint">Nenhuma ordem visível.</p>
            ) : (
              (data.workOrders).map((order) => (
                <div key={order.id} className="timeline-order-block">
                  <div className="timeline-order-header">
                    <div>
                      <span className="hint" style={{ fontSize: "0.78rem" }}>{order.id}</span>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>{order.title}</div>
                    </div>
                    <span style={{ color: stepColor(order.step), fontWeight: 600, fontSize: "0.85rem" }}>
                      {stepLabel(order.step)}
                    </span>
                  </div>
                  {order.history.length === 0 ? (
                    <p className="hint" style={{ marginLeft: 16, marginTop: 8 }}>Sem histórico registrado.</p>
                  ) : (
                    <ul className="timeline-list" style={{ marginTop: 12 }}>
                      {order.history.map((h, i) => (
                        <li className="timeline-item" key={h.id}>
                          <div className="timeline-dot"
                            style={{ background: stepColor(h.toStep), boxShadow: `0 0 0 2px ${stepColor(h.toStep)}` }} />
                          {i < order.history.length - 1 && <div className="timeline-line" />}
                          <div className="timeline-body">
                            <strong style={{ color: stepColor(h.toStep) }}>{stepLabel(h.toStep)}</strong>
                            <div className="hint">
                              {h.fromStep ? `de ${stepLabel(h.fromStep)}` : "início"} —{" "}
                              {new Date(h.changedAt).toLocaleString("pt-BR")}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── ABA: Notificações ───────────────────────────────────────────────── */}
        {activeTab === "notifications" && (
          <div className="panel">
            <div className="topbar" style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Notificações</h2>
              {data?.notifications?.length > 0 && (
                <button className="button secondary" type="button" onClick={markAllRead}>
                  Marcar todas como lidas
                </button>
              )}
            </div>
            {!data?.notifications?.length ? (
              <p className="hint">Sem notificações.</p>
            ) : (
              <ul className="message-list">
                {data.notifications.map((n) => (
                  <li className="message-card" key={n.id}
                    style={{
                      background: n.read ? "var(--surface-muted)" : "var(--warning-bg)",
                      borderColor: n.read ? "var(--border)" : "var(--warning-border)"
                    }}>
                    <strong>{n.title}</strong>
                    <div className="hint">{n.body}</div>
                    <div className="hint" style={{ marginTop: 4, fontSize: "0.8rem" }}>
                      {new Date(n.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── ABA: Cadastros ──────────────────────────────────────────────────── */}
        {activeTab === "registrations" && canRegister && (
          <div className="panel">
            <h2>Cadastros</h2>

            <div className="registrations-section">
              <h3 className="registrations-heading">Nova ordem de serviço</h3>
              <form className="upload-form reg-form-wide" onSubmit={handleCreateWorkOrder}>
                <div className="reg-row">
                  <label>
                    <div className="label">Cliente</div>
                    <select className="text-input" value={workOrderForm.customerId}
                      onChange={(e) => setWorkOrderForm({ ...workOrderForm, customerId: e.target.value, vehicleId: "" })}>
                      <option value="">Selecione um cliente...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div className="label">Veículo</div>
                    <select className="text-input" value={workOrderForm.vehicleId}
                      disabled={!workOrderForm.customerId}
                      onChange={(e) => setWorkOrderForm({ ...workOrderForm, vehicleId: e.target.value })}>
                      <option value="">Selecione um veículo...</option>
                      {customerVehicles.map((v) => (
                        <option key={v.id} value={v.id}>{v.model} — {v.plate}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div className="label">Mecânico responsável</div>
                    <select className="text-input" value={workOrderForm.mechanicId}
                      onChange={(e) => setWorkOrderForm({ ...workOrderForm, mechanicId: e.target.value })}>
                      <option value="">Nenhum por enquanto</option>
                      {mechanics.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <div className="label">Título</div>
                  <input className="text-input" placeholder="Ex: Troca de freios e revisão geral"
                    value={workOrderForm.title}
                    onChange={(e) => setWorkOrderForm({ ...workOrderForm, title: e.target.value })} />
                </label>
                <label>
                  <div className="label">Descrição do problema</div>
                  <input className="text-input" placeholder="Descreva o que o cliente relatou..."
                    value={workOrderForm.description}
                    onChange={(e) => setWorkOrderForm({ ...workOrderForm, description: e.target.value })} />
                </label>
                <div className="actions">
                  <button className="button" type="submit">Abrir ordem de serviço</button>
                </div>
              </form>
            </div>

            <div className="registrations-section">
              <h3 className="registrations-heading">Cadastrar cliente</h3>
              <form className="upload-form" onSubmit={registerCustomer} style={{ maxWidth: 500 }}>
                <label>
                  <div className="label">Nome</div>
                  <input className="text-input" value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} />
                </label>
                <label>
                  <div className="label">Email</div>
                  <input className="text-input" type="email" value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} />
                </label>
                <label>
                  <div className="label">Senha inicial</div>
                  <input className="text-input" type="password" value={customerForm.password}
                    onChange={(e) => setCustomerForm({ ...customerForm, password: e.target.value })} />
                </label>
                <div className="actions">
                  <button className="button" type="submit">Cadastrar cliente</button>
                </div>
              </form>
            </div>

            <div className="registrations-section">
              <h3 className="registrations-heading">Cadastrar veículo</h3>
              <form className="upload-form" onSubmit={registerVehicle} style={{ maxWidth: 500 }}>
                <label>
                  <div className="label">Cliente vinculado</div>
                  <select className="text-input" value={vehicleForm.ownerId}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, ownerId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <div className="label">Placa</div>
                  <input
                    className="text-input"
                    type="text"
                    placeholder="Ex: ABC1234 ou ABC1D23"
                    maxLength={7} 
                    value={vehicleForm.plate}
                    onChange={(e) => {
                      const treatedValue = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "");

                      setVehicleForm({ ...vehicleForm, plate: treatedValue });
                    }}
                  />
                </label>
                <label>
                  <div className="label">Modelo</div>
                  <input className="text-input" value={vehicleForm.model}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} />
                </label>
                <div className="actions">
                  <button className="button" type="submit">Cadastrar veículo</button>
                </div>
              </form>
            </div>

            {message && <p className="hint feedback-msg" style={{ marginTop: 16 }}>{message}</p>}
          </div>
        )}

        {/* ── ABA: Estoque (GESTOR e ADMINISTRADOR) ────────────────────────── */}
        {activeTab === "stock" && ["GESTOR", "ADMINISTRADOR"].includes(session.role) && (
          <div className="panel">
            <div className="topbar" style={{ marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>Estoque de Peças</h2>
              <button className="button secondary" type="button" onClick={() => loadManagerData()}>
                Atualizar
              </button>
            </div>

            <h3 style={{ marginBottom: 12, color: "var(--text-2)" }}>Catálogo</h3>
            {!stockData ? (
              <p className="hint">Carregando...</p>
            ) : (
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <thead>
                    <tr>
                      <th>Código</th><th>Nome</th><th>Preço unit.</th><th>Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockData.parts.map((p) => (
                      <tr key={p.id}>
                        <td><code>{p.code}</code></td>
                        <td>{p.name}</td>
                        <td>{currency(p.priceCents / 100)}</td>
                        <td>
                          <span className={`badge ${p.stock <= 5 ? "FAILED" : "PROCESSED"}`}>
                            {p.stock}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 style={{ marginTop: 32, marginBottom: 12, color: "var(--text-2)" }}>Solicitações de Peças</h3>
            {!stockData ? null : !stockData.partRequests.length ? (
              <p className="hint">Nenhuma solicitação registrada ainda.</p>
            ) : (
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <thead>
                    <tr>
                      <th>Ordem</th><th>Peça</th><th>Qtd</th><th>Status</th><th>Solicitante</th><th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockData.partRequests.map((r) => {
                      const badgeClass =
                        r.status === "RESERVED" || r.status === "INSTALLED" ? "PROCESSED"
                          : r.status === "OUT_OF_STOCK" ? "FAILED"
                            : "UPLOADED";
                      return (
                        <tr key={r.id}>
                          <td><code>{r.workOrderId}</code></td>
                          <td>{r.partName}</td>
                          <td style={{ textAlign: "center" }}>{r.quantity}</td>
                          <td><span className={`badge ${badgeClass}`}>{r.status}</span></td>
                          <td>{r.requestedByName || "—"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{new Date(r.requestedAt).toLocaleString("pt-BR")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA: Auditoria (GESTOR e ADMINISTRADOR) ──────────────────────── */}
        {activeTab === "audit" && ["GESTOR", "ADMINISTRADOR"].includes(session.role) && (
          <div className="panel">
            <div className="topbar" style={{ marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>Auditoria do Sistema</h2>
              <button className="button secondary" type="button" onClick={() => loadManagerData()}>
                Atualizar
              </button>
            </div>
            <p className="hint" style={{ marginBottom: 16 }}>
              Últimos 100 eventos capturados pelo <strong>Audit Worker</strong> via RabbitMQ Topic Exchange.
            </p>

            {!auditData ? (
              <p className="hint">Carregando...</p>
            ) : !auditData.length ? (
              <p className="hint">Nenhum evento registrado ainda. Interaja com o sistema para gerar eventos.</p>
            ) : (
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <thead>
                    <tr>
                      <th style={{ width: 160 }}>Data/Hora</th>
                      <th>O que aconteceu</th>
                      <th style={{ width: 130 }}>Routing Key</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditData.map((ev) => {
                      const isOpen = expandedAuditId === ev.id;
                      const p = ev.payload || {};
                      return (
                        <>
                          <tr
                            key={ev.id}
                            style={{ cursor: "pointer" }}
                            onClick={() => setExpandedAuditId(isOpen ? null : ev.id)}
                          >
                            <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                              {new Date(ev.receivedAt).toLocaleString("pt-BR")}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                                {auditTitle(ev)}
                              </div>
                              {!isOpen && (
                                <div style={{ fontSize: "0.8rem", color: "var(--text-3)", marginTop: 2 }}>
                                  Clique para ver detalhes
                                </div>
                              )}
                            </td>
                            <td>
                              <code style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
                                {ev.routingKey}
                              </code>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${ev.id}-detail`} style={{ background: "var(--primary-light)" }}>
                              <td colSpan={3} style={{ padding: "12px 16px" }}>
                                <div style={{ fontSize: "0.82rem", display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
                                  {Object.entries(p)
                                    .filter(([, v]) => v !== null && v !== undefined && v !== "")
                                    .map(([k, v]) => (
                                      <div key={k}>
                                        <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{k}: </span>
                                        <span style={{ color: "var(--text)", fontFamily: "monospace" }}>
                                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
