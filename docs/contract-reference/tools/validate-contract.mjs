#!/usr/bin/env node
// validate-contract.mjs — valida los *.contract.json contra el contrato.
// Node puro, sin dependencias. Sale con código 1 si hay errores (gate de CI).
//
// Reglas que hace cumplir:
//   1. id en convención category/role/variant.
//   2. Campos requeridos presentes (name, when, states, tokensUsed).
//   3. states no vacío.
//   4. REGLA DURA: cada token usado existe en design.tokens.json Y es
//      semantic.* o component.* — nunca primitive.* directo.
//   5. ids únicos entre archivos.
//   6. behavior.primitive con prefijo ark:/zag: si no es null.
//
// Uso: node tools/validate-contract.mjs

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const TOKENS = "tokens/design.tokens.json";
const DIR = "contract/examples";
const ID_RE = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;
const PRIM_RE = /^(zag|ark):[a-z-]+$/;

// --- indexar todos los paths de tokens existentes ---
const tokenPaths = new Set();
(function walk(node, path) {
  if (node && typeof node === "object" && "$value" in node) {
    tokenPaths.add(path.join("."));
    return;
  }
  for (const k of Object.keys(node)) {
    if (k.startsWith("$")) continue;
    walk(node[k], [...path, k]);
  }
})(JSON.parse(readFileSync(resolve(TOKENS), "utf8")), []);

const files = readdirSync(resolve(DIR)).filter((f) => f.endsWith(".contract.json"));
const seenIds = new Map();
const errors = [];
const warns = [];

for (const file of files) {
  const c = JSON.parse(readFileSync(resolve(join(DIR, file)), "utf8"));
  const at = (msg) => errors.push(`${file}: ${msg}`);

  if (!c.id || !ID_RE.test(c.id)) at(`id inválido → "${c.id}" (esperado category/role/variant)`);
  else if (seenIds.has(c.id)) at(`id duplicado "${c.id}" (también en ${seenIds.get(c.id)})`);
  else seenIds.set(c.id, file);

  if (!c.name) at("falta 'name'");
  if (!c.when || c.when.length < 12) at("'when' ausente o demasiado corto (la regla de uso no puede quedar vacía)");
  if (!Array.isArray(c.states) || c.states.length === 0) at("'states' debe tener al menos un estado");

  if (c.behavior && c.behavior.primitive != null && !PRIM_RE.test(c.behavior.primitive))
    at(`behavior.primitive inválido → "${c.behavior.primitive}" (usa ark:… o zag:…)`);

  if (!Array.isArray(c.tokensUsed) || c.tokensUsed.length === 0) {
    at("'tokensUsed' vacío");
  } else {
    for (const t of c.tokensUsed) {
      if (t.startsWith("primitive.")) at(`usa primitivo directo → "${t}" (los componentes solo consumen semantic.* o component.*)`);
      else if (!/^(semantic|component)\./.test(t)) at(`token fuera de nivel → "${t}"`);
      else if (!tokenPaths.has(t)) at(`token inexistente → "${t}" (no está en ${TOKENS})`);
    }
  }
  if (!c.slots || c.slots.length === 0) warns.push(`${file}: sin 'slots' (anatomía vacía)`);
}

console.log(`Contratos revisados: ${files.length} · tokens indexados: ${tokenPaths.size}`);
for (const w of warns) console.log(`  ⚠ ${w}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} error(es):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("✓ contrato válido");
