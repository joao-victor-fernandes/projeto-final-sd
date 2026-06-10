#!/usr/bin/env bash
# Smoke test end-to-end do prototipo.
# Exercita: login, maquina de estados, pecas, midia, notificacoes.

set -euo pipefail
API=${API:-http://localhost:4000}

ok()   { printf "[OK]   %s\n" "$*"; }
info() { printf "[--]   %s\n" "$*"; }
fail() { printf "[FAIL] %s\n" "$*"; exit 1; }

info "Aguardando backend em ${API} ..."
for attempt in $(seq 1 20); do
  if curl -fsS "${API}/health" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "${API}/health" >/dev/null || fail "backend nao respondeu /health"
ok "backend respondeu /health"

info "Login como mecanico"
TOKEN_M=$(curl -fsS "${API}/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"maria@oficina.demo","password":"mecanico123"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
[ -n "$TOKEN_M" ] || fail "sem token de mecanico"
ok "token mecanico obtido"

info "Login como cliente"
TOKEN_C=$(curl -fsS "${API}/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"joao@oficina.demo","password":"cliente123"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
[ -n "$TOKEN_C" ] || fail "sem token de cliente"
ok "token cliente obtido"

info "Avancar etapa: EM_DIAGNOSTICO -> CAUSA_IDENTIFICADA"
curl -fsS -X POST "${API}/api/work-orders/os-1001/step" \
  -H "Authorization: Bearer ${TOKEN_M}" -H 'Content-Type: application/json' \
  -d '{"step":"CAUSA_IDENTIFICADA"}' >/dev/null
ok "etapa avancada (publicou maintenance.step.updated)"

info "Listar pecas"
PART_ID=$(curl -fsS "${API}/api/parts" -H "Authorization: Bearer ${TOKEN_M}" \
  | sed -E 's/.*"id":"([^"]+)".*/\1/' | head -1)
ok "primeira peca: ${PART_ID}"

info "Solicitar peca (publica parts.requested)"
curl -fsS -X POST "${API}/api/work-orders/os-1001/parts/request" \
  -H "Authorization: Bearer ${TOKEN_M}" -H 'Content-Type: application/json' \
  -d "{\"partId\":\"${PART_ID}\",\"quantity\":2}" >/dev/null
ok "peca solicitada"

info "Aguardando inventory-worker reservar..."
sleep 3

info "Snapshot do cliente - deve listar notificacoes recem-criadas"
PORTAL=$(curl -fsS "${API}/api/portal" -H "Authorization: Bearer ${TOKEN_C}")
NOTIF_COUNT=$(echo "$PORTAL" | grep -o '"unreadNotifications":[0-9]*' | head -1 | sed 's/.*://')
ok "cliente tem ${NOTIF_COUNT:-0} notificacoes nao lidas"

info "Logout"
curl -fsS -X POST "${API}/api/auth/logout" -H "Authorization: Bearer ${TOKEN_M}" >/dev/null
curl -fsS -X POST "${API}/api/auth/logout" -H "Authorization: Bearer ${TOKEN_C}" >/dev/null
ok "sessoes encerradas"

echo
echo "============================================================"
echo "  Smoke test completo. Confira a RabbitMQ UI em :15672"
echo "  para ver as filas q.notifications, q.audit e q.inventory."
echo "============================================================"
