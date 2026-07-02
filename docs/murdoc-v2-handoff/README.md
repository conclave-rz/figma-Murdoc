# Murdoc v2 — sandbox de reproducción (Pilar 3, parte 2)

Fixtures y material para **reproducir la sesión de pruebas en vivo** de `apply-contract`, `connect-codebase` y `reuse-first`. Es un sandbox — prueba la mecánica, **no** es un contrato/repo de producción.

## Qué es cada cosa (y dónde vive en este repo)

| Pieza | Ubicación en el repo | Rol |
|---|---|---|
| Fix del cuelgue de `figma_instantiate_component` | `docs/fixes/reuse-first-instantiate-fallback.md` | Diagnóstico + drop-in async + fix de bridge |
| Scripts para el path `figma_execute` | `figma-scripts/*.js` | `reuse-component.js` (reúso), `create-stubs.js` (Paso 3 de apply-contract), `create-ghost-stub.js` (trampa) |
| Fixture del contrato | `docs/murdoc-v2-handoff/contract-reference/` | Los 3 ids canónicos (= los 3 stubs) + trampas |
| Fixture del codebase | `docs/murdoc-v2-handoff/codebase-fixture/src/` | Componentes con `data-component="category/role/variant"` |
| Salida de referencia | `docs/murdoc-v2-handoff/examples/code-connect.map.example.json` | Cómo debe verse el map de `connect-codebase` |

> **Ojo:** el contrato **real** del Pilar 0 vive en `docs/contract-reference/` (formato W3C DTCG + registry shadcn). El `contract-reference/` de aquí es un **fixture simplificado** para el sandbox; no lo confundas ni lo copies sobre el real.

## El fix, en una línea

`figma_instantiate_component` se cuelga ~15s en archivos `documentAccess: dynamic-page`. `reuse-first` (Paso 3) ya **no** usa la tool dedicada: reúsa vía `figma_execute` con el helper `reuseComponent()` async (`figma-scripts/reuse-component.js`). Detalle y fix de bridge en `docs/fixes/reuse-first-instantiate-fallback.md`.

## Reproducir la sesión (orden)

1. **Setup del sandbox.** Apunta Murdoc a este fixture como `docs/contract-reference/` de tu proyecto de diseño (o usa el contrato real, que tiene los mismos 3 ids), y copia `codebase-fixture/src/` a tu `src/` (o ajusta rutas). El codebase es lo que `connect-codebase` greppea por `data-component`.
2. **Colecciones + stubs.** Corre `apply-contract` (Paso 2 crea las colecciones `Contract/*` desde el contrato DTCG; Paso 3 crea los stubs). Si ya tienes las colecciones, basta `figma-scripts/create-stubs.js` por el path `figma_execute`.
   - Nota: `create-stubs.js` **no** crea las colecciones `Contract/*` (48 tokens): sus valores/alias vienen del contrato DTCG y solo `apply-contract` Paso 2 los reconstruye fielmente.
3. **connect-codebase.** Corre el skill → esperado: `linked` (button, field), `figma-only` (dialog), y `code-only` (`data/table/standard`, si aplicaste `contract-reference/traps/`). Corre `figma-scripts/create-ghost-stub.js` → debe salir como `unmapped` (no inventarse). Re-corre → idempotente. Compara contra `examples/code-connect.map.example.json`.
4. **reuse-first.** Pide `action/button/primary` (existe) → reúsa vía `reuseComponent()` sin duplicar. Pide `feedback/toast/success` (no existe) → genera. Prueba `primaryy` / mayúsculas para tensar el match.

## Trampas (carpeta `contract-reference/traps/`)

- **code-only:** copia `traps/table-standard.contract.json` a `contract-reference/contract/examples/` y añade `traps/registry.addition.json` al array `items` de `contract-reference/registry.json`. El id `data/table/standard` tendrá código (`codebase-fixture/.../data-table.tsx`) pero no nodo en Figma.
- **orphan:** `figma-scripts/create-ghost-stub.js` crea `data/table/ghost`, cuyo id no está en el registry → `unmapped`.
- **idempotencia:** re-generar el map no debe duplicar entries.

## Caveats honestos

- Es **skill-as-executed** (como lo corre un agente), no binario compilado.
- `contract-reference/` y `codebase-fixture/` son **fixtures**, no producción — prueban la mecánica, no la integración real.
- Los valores de token de las colecciones `Contract/*` no están aquí (se crean con `apply-contract` Paso 2).
- El fix de bridge en `code.js` requiere **verificación en vivo** (Figma en modo dynamic-page); ver la prueba de regresión en `docs/fixes/reuse-first-instantiate-fallback.md`.
