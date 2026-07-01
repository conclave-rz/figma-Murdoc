#!/usr/bin/env node
// tokens-to-css.mjs — DTCG (.tokens.json) → CSS custom properties.
// Node puro, sin dependencias. Resuelve referencias {a.b.c} a var(--a-b-c)
// para preservar la cascada de temas, y maneja dimensiones DTCG 2025.10
// en forma de objeto { value, unit }.
//
// Uso: node tools/tokens-to-css.mjs [ruta.tokens.json] [salida.css]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const IN = process.argv[2] ?? "tokens/design.tokens.json";
const OUT = process.argv[3] ?? "dist/tokens.css";

const raw = JSON.parse(readFileSync(resolve(IN), "utf8"));

const dashed = (path) => "--" + path.join("-");

function resolveValue(val) {
  // referencia DTCG: "{a.b.c}" → var(--a-b-c)
  if (typeof val === "string") {
    const m = val.match(/^\{(.+)\}$/);
    if (m) return `var(${dashed(m[1].split("."))})`;
    return val;
  }
  // dimensión DTCG 2025.10: { value, unit }
  if (val && typeof val === "object" && "value" in val && "unit" in val) {
    return `${val.value}${val.unit}`;
  }
  if (typeof val === "number") return String(val);
  return String(val);
}

const lines = [];
function walk(node, path) {
  if (node && typeof node === "object" && "$value" in node) {
    lines.push(`  ${dashed(path)}: ${resolveValue(node["$value"])};`);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key.startsWith("$")) continue;
    walk(node[key], [...path, key]);
  }
}
walk(raw, []);

const css = `:root {\n${lines.join("\n")}\n}\n`;
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), css, "utf8");
console.log(`✓ ${lines.length} tokens → ${OUT}`);
