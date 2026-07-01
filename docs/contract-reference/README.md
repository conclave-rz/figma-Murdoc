# Pilar 0 · El contrato

La fuente única de verdad sobre la que se construyen los otros tres pilares. No es una herramienta: es el **contrato** que rz-dash *produce*, que design-in-code *consume y valida*, y que Murdoc *lee* para Code Connect. Si vive por separado en cada pilar, cada quien lo define distinto y vuelve el drift. Aquí se define una vez.

## Las tres capas (ninguna se inventó desde cero)

1. **Tokens → W3C DTCG.** `tokens/design.tokens.json` en el formato estándar (versión estable 2025.10), en tres niveles: `primitive` → `semantic` → `component`. Es el idioma que Figma, Tokens Studio y Style Dictionary ya hablan, así que el handoff no necesita conversión. Los componentes **nunca** referencian primitivos: solo semánticos.
2. **Comportamiento → Ark UI / Zag.js.** El contrato no reimplementa accesibilidad ni máquinas de estado: cada componente stateful apunta, en `behavior.primitive`, al primitivo agnóstico de framework que lo respalda (`ark:dialog`, `zag:field`). Sirve vanilla y React con una sola base de comportamiento.
3. **Distribución → registry.json (shadcn).** `registry.json` empaqueta tokens y componentes para instalarse con la CLI de shadcn (agnóstica de framework). Es el mismo mecanismo que llevará el skill de design-in-code (pilar c).

La única capa que construimos nosotros —porque nada de lo anterior la da— es la **opinada**: la convención `category/role/variant`, el campo `when` (cuándo usar cada pieza) y la regla dura de solo-tokens. Ese es el IP; todo lo de abajo es estándar.

## Estructura

```
pilar-0-contrato/
├── tokens/
│   └── design.tokens.json          # DTCG, 3 niveles · fuente de verdad
├── contract/
│   ├── component-contract.schema.json  # JSON Schema del contrato (el IP)
│   ├── naming.md                   # convención category/role/variant
│   └── examples/                   # una instancia por componente
│       ├── action-button-primary.contract.json
│       ├── form-field-text.contract.json
│       └── overlay-dialog-modal.contract.json
├── registry.json                   # manifiesto de distribución (shadcn)
├── tools/
│   ├── tokens-to-css.mjs           # DTCG → CSS vars (dependency-free)
│   └── validate-contract.mjs       # gate: naming + solo semánticos + refs
└── .github/workflows/contract-gate.yml
```

## Cómo lo consume cada pilar

- **Pilar a · rz-dash** → *produce* items de contrato: su salida es un `.contract.json` + su entrada en `registry.json`, con el `id` en `category/role/variant`.
- **Pilar c · design-in-code + kit** → *consume* los tokens (`tokens.css` generado) y *valida* con `validate-contract.mjs`; en runtime, el kit ensambla piezas leyendo el contrato.
- **Pilar b · Murdoc** → *lee* los tokens DTCG y el registry para Code Connect. El loop code-to-Figma cierra porque ambos hablan el mismo estándar.

## Reglas duras (las hace cumplir `validate-contract.mjs`)

1. `id` en `category/role/variant`, único en todo el contrato.
2. `when` presente — la regla de uso no puede quedar vacía.
3. Al menos un estado en `states`.
4. **Solo `semantic.*` o `component.*` en `tokensUsed`. Nunca `primitive.*` directo.**
5. Todo token usado debe existir en `design.tokens.json`.

Si el validador marca error, no se mergea. Es un gate, no una sugerencia.

## Correr

```bash
node tools/tokens-to-css.mjs      # → dist/tokens.css
node tools/validate-contract.mjs  # gate; sale con 1 si hay violaciones
```

En CI, `.github/workflows/contract-gate.yml` corre ambos en cada PR que toque tokens, contrato o registry.

## Extender (agregar un componente)

1. Crea `contract/examples/<archivo>.contract.json` conforme al schema.
2. Agrega su item en `registry.json` con el puntero `meta.contract`.
3. Corre el validador. Si pasa, existe; si no, no existe.

## Caveats honestos

- **DTCG 2025.10** usa dimensiones como objeto `{ value, unit }` (no `"16px"`). El generador propio las maneja; si migras a **Style Dictionary**, la v4 tiene soporte DTCG de primera clase pero el 2025.10 completo sigue en progreso en la v5 — fija versiones.
- **registry.json (shadcn)** asume mundo JS/JSON. Aquí lo usamos como **esquema + distribución de archivos**, no por sus comodidades de React. El campo `meta` por item es una extensión nuestra (la CLI ignora lo que no conoce).
- Los nombres de CSS var salen con el path completo (`--semantic-color-accent`). Si prefieres alias cortos, es una transform adicional; se dejó explícito para que el nivel se lea de un vistazo.

---
Pilar 0 de 4 · preparado por **Rz** · base: DTCG + Ark/Zag + shadcn registry
