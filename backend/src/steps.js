// Máquina de estados das etapas de manutenção.
//
// Cada OS percorre uma sequência de etapas. As transições são validadas:
// não é possível pular do diagnóstico direto para "concluído", por exemplo.
// Cada transição emite o evento maintenance.step.updated no Topic Exchange.

export const STEPS = {
  RECEBIDO: "RECEBIDO",
  RELATO_REGISTRADO: "RELATO_REGISTRADO",
  EM_DIAGNOSTICO: "EM_DIAGNOSTICO",
  CAUSA_IDENTIFICADA: "CAUSA_IDENTIFICADA",
  ORCAMENTO_ENVIADO: "ORCAMENTO_ENVIADO",
  ORCAMENTO_APROVADO: "ORCAMENTO_APROVADO",
  ORCAMENTO_REPROVADO: "ORCAMENTO_REPROVADO",
  PECAS_SOLICITADAS: "PECAS_SOLICITADAS",
  EM_REPARO: "EM_REPARO",
  TESTE_FINAL: "TESTE_FINAL",
  CONCLUIDO: "CONCLUIDO",
  ENTREGUE: "ENTREGUE",
  CANCELADO: "CANCELADO",
  REVISAO_ORCAMENTO: "REVISAO_ORCAMENTO"
};

// Transições permitidas (estado origem -> [estados destino permitidos]).
// CANCELADO: operadores a partir de qualquer etapa ativa.
// ORCAMENTO_APROVADO / ORCAMENTO_REPROVADO: exclusivos do cliente (inicial).
// REVISAO_ORCAMENTO: cliente aprova (EM_REPARO) ou cancela (CANCELADO).
const TRANSITIONS = {
  RECEBIDO:            ["RELATO_REGISTRADO",                          "CANCELADO"],
  RELATO_REGISTRADO:   ["EM_DIAGNOSTICO",                            "CANCELADO"],
  EM_DIAGNOSTICO:      ["CAUSA_IDENTIFICADA",                        "CANCELADO"],
  CAUSA_IDENTIFICADA:  ["ORCAMENTO_ENVIADO",                         "CANCELADO"],
  ORCAMENTO_ENVIADO:   ["ORCAMENTO_APROVADO", "ORCAMENTO_REPROVADO", "REVISAO_ORCAMENTO", "CANCELADO"],
  ORCAMENTO_APROVADO:  ["PECAS_SOLICITADAS",  "EM_REPARO", "REVISAO_ORCAMENTO",    "CANCELADO"],
  ORCAMENTO_REPROVADO: ["ORCAMENTO_ENVIADO",                                        "CANCELADO"],
  PECAS_SOLICITADAS:   ["EM_REPARO",          "REVISAO_ORCAMENTO",                 "CANCELADO"],
  EM_REPARO:           ["REVISAO_ORCAMENTO",  "TESTE_FINAL",                       "CANCELADO"],
  REVISAO_ORCAMENTO:   ["EM_REPARO",                                               "CANCELADO"],
  TESTE_FINAL:         ["CONCLUIDO",                                 "CANCELADO"],
  CONCLUIDO:           ["ENTREGUE"],
  ENTREGUE:            [],
  CANCELADO:           []
};

export const STEP_LABELS = {
  RECEBIDO: "Recebido",
  RELATO_REGISTRADO: "Relato do cliente registrado",
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
  ENTREGUE: "Entregue ao cliente",
  CANCELADO: "Cancelado"
};

export const STEP_ORDER = Object.keys(STEPS);

export function canTransition(from, to) {
  if (!TRANSITIONS[from]) return false;
  return TRANSITIONS[from].includes(to);
}

export function nextSteps(current) {
  return TRANSITIONS[current] || [];
}

export function isTerminal(step) {
  return TRANSITIONS[step] && TRANSITIONS[step].length === 0;
}
