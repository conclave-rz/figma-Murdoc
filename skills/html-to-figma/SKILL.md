---
name: html-to-figma
description: >
  Toma un proyecto HTML/CSS (un solo artifact de Claude.ai, o una carpeta
  multi-archivo de Claude Code) y lo reconstruye en Figma como un handoff
  completo en tres capas: (1) Variables Collections + Effect Styles + Text
  Styles extraídos del CSS, (2) Component Sets con variants y component
  properties detectados de patrones repetidos, y (3) pantallas pintadas
  usando instances de esos componentes. Úsalo SIEMPRE que el usuario pegue,
  comparta o referencie código HTML/CSS de Claude.ai, Claude Code, un repo,
  o cualquier proyecto web, y pida verlo en Figma, importarlo, "pintarlo",
  convertirlo a Figma, o crear un handoff. También úsalo si el usuario
  menciona "design handoff", "Figma file desde el código", "pasar el
  artifact a Figma" o frases equivalentes en inglés.
---

# HTML to Figma Handoff

Convierte un proyecto HTML/CSS funcional en un archivo de Figma listo para handoff. La salida tiene tres capas conectadas: **tokens** (Variables + Text Styles + Effect Styles), **components** (Component Sets reutilizables con variants y component properties), y **screens** (pantallas con instances).

**Filosofía:** no hagas "screenshots vectoriales" del HTML. Reconstruye con la lógica de diseño que tendría un designer: tokens primero, después componentes, después pantallas. Cada decisión visible en el código debe quedar como decisión **explícita** en Figma (variable, property, variant, style), no como valor hardcoded.

> Este skill complementa a los skills visuales de marca (`multiplica-brand` y similares). Si el HTML viene de un sistema de marca conocido, **respeta los tokens existentes**; no inventes una paleta nueva.

---

## 00. Cuándo activarte

- El usuario pega código HTML/CSS y pide "pásamelo a Figma", "haz el handoff", "píntalo en Figma", "convierte este artifact a Figma".
- El usuario referencia un archivo `.html`, un proyecto `claude-code`, un repo o una carpeta con `index.html` y CSS.
- El usuario dice "tengo un proyecto en HTML, quiero verlo en Figma para iterar".
- El usuario pide "componetizar en Figma" un código existente.

**NO te actives si:**
- El usuario solo quiere análisis del código sin generar nada en Figma.
- El usuario quiere lo contrario (Figma → código): usa skills de inspección como `figma_get_component_for_development`.
- El usuario quiere modificar un Figma file existente sin código de origen.

---

## 01. Realidad de las tools de Murdoc — léelo antes de empezar

**La regla más importante de este skill: la mayoría del trabajo se hace con `figma_execute`, no con tools atómicas.**

Murdoc expone unas **tools "wrapper" útiles** (`figma_setup_design_tokens`, `figma_batch_create_variables`, `figma_create_child`, `figma_set_instance_properties`, `figma_lint_design`, `figma_capture_screenshot`) y un **gran escape hatch**: `figma_execute`, que ejecuta JS arbitrario contra la Plugin API de Figma con acceso completo al objeto `figma`.

**No existen** tools atómicas como `figma_set_fills`, `figma_set_strokes`, `figma_set_text`, `figma_resize_node`, `figma_move_node`, `figma_clone_node`. Si necesitas alguna de esas operaciones, **úsalas dentro de `figma_execute`** con la Plugin API directa. Lo mismo aplica a `figma_set_annotations` (la tool existe pero el bridge actual no la implementa en todos los entornos — fallback siempre vía `figma_execute` con `node.annotations`).

### Patrón obligatorio dentro de `figma_execute`

Figma corre con `documentAccess: dynamic-page`, lo que tiene 2 consecuencias críticas:

1. **Toda lookup de nodos/variables debe ser `async`**:
   - `figma.getNodeByIdAsync(id)` en vez de `getNodeById`
   - `figma.variables.getVariableByIdAsync(id)` en vez de `getVariableById`
   - `await figma.currentPage.loadAsync()` al inicio de **cada** ejecución antes de tocar nodos
   - `await figma.loadFontAsync({ family, style })` antes de crear o editar texto

2. **Las fuentes deben cargarse explícitamente.** Inter está disponible en Regular / Medium / Semi Bold / Bold (estilo "Semi Bold" con espacio, no "SemiBold"). Si el CSS pide un font no estándar, usa fallback y avisa.

### Plantilla mínima para todo `figma_execute`

```js
async function run() {
  await figma.currentPage.loadAsync();
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  // ... más loads de fuentes según el componente

  // Lookups
  const node = await figma.getNodeByIdAsync('150:209');
  const myVar = await figma.variables.getVariableByIdAsync('VariableID:150:217');

  // ... trabajo

  return { /* IDs y datos para el state */ };
}
return run();
```

Si el script crea o edita más de ~10 nodos, **sube el timeout** a `30000` ms en la llamada a `figma_execute`.

---

## 02. Tools de Murdoc — mapa real por fase

| Fase | Tools wrapper que SÍ existen | Operaciones que requieren `figma_execute` |
|---|---|---|
| Pre-flight | `figma_get_status`, `figma_list_open_files`, `figma_get_design_system_summary`, `figma_get_selection` | Inspección custom del archivo |
| Tokens | `figma_setup_design_tokens` (collection + variables en una sola call), `figma_batch_create_variables`, `figma_create_variable_collection`, `figma_get_variables` | **Effect Styles** y **Text Styles** (no son variables) |
| Components | `figma_arrange_component_set` (organiza variants en grid), `figma_analyze_component_set` (verifica consistencia) | **Toda la creación**: `figma.createComponent()`, `figma.combineAsVariants()`, `setBoundVariable`, `setBoundVariableForPaint`, `addComponentProperty`, `componentPropertyReferences`, `effects` |
| Sections / Frames | `figma_create_child` (un nodo simple a la vez) | Sections reales (`figma.createSection()`), layouts complejos, anidamiento múltiple |
| Instances | `figma_set_instance_properties` | Crear la instance (`variant.createInstance()`) + setear props nested |
| Imágenes | — | `figma.createImageAsync` + `imageHash` en fills |
| Handoff | `figma_lint_design` (linter listo) | `node.annotations = [...]` (annotations), `node.description = '...'` |
| Validación | `figma_capture_screenshot`, `figma_get_component_image` | — |

`figma_get_design_system_kit` y `figma_get_variables` con `enrich=true` requieren **REST API token** que muchas veces no está configurado. **Fallback obligatorio:** usar `figma_get_design_system_summary` (plugin-only) o `figma_execute` con `figma.variables.getLocalVariableCollectionsAsync()` para enumerar lo existente.

---

## 03. Workflow general (9 fases)

```
1. Pre-flight        →  Estado del plugin, archivo abierto, design system existente
2. Discovery         →  Clasificar input, leer archivos, inventariar pantallas
3. Token extraction  →  Parsear CSS, deduplicar, agrupar en escalas semánticas
4. Component inventory → Detectar patrones repetidos + estructurales, identificar variants
5. Checkpoint        →  Presentar plan al usuario, pedir confirmación explícita
   ─── BLUEPRINT JSON guardado aquí ───
6. Tokens en Figma   →  Variables Collections + Effect Styles + Text Styles
7. Components        →  Component Sets con variants + properties + nested instances
8. Screens           →  Frames de pantallas usando instances + auto-layout
9. Annotations + Lint → Documentar specs (vía figma_execute) y validar
```

**Las fases 2, 3, 4, 5 son offline-capable** — corren con `bash_tool` puro sin tocar Figma. Solo desde la Fase 6 en adelante se requiere el plugin conectado. Si el usuario tiene el plugin caído al inicio, **arranca igual** las fases de análisis y pídele activarlo en el Checkpoint.

Ejecuta una fase a la vez. Después de cada fase, **resume al usuario** lo que hiciste antes de continuar.

---

## 04. Fase 1 — Pre-flight

1. `figma_get_status` para confirmar el bridge. **Si no responde:** avanza con Fases 2-5 igual; antes de la Fase 6 le pides al usuario activar Figma Desktop + Murdoc plugin.
2. Si está conectado, `figma_list_open_files` y verifica el archivo target. Si hay múltiples, pregunta al usuario.
3. **Detectar design system existente** — preferencia de fallbacks:
   - Intenta `figma_get_design_system_summary` (plugin-only, gratis).
   - Si falla, usa `figma_execute` con este snippet para enumerar variables/componentes locales:
     ```js
     const collections = await figma.variables.getLocalVariableCollectionsAsync();
     const components = await figma.currentPage.findAllAsync(n => n.type === 'COMPONENT_SET' || n.type === 'COMPONENT');
     return {
       collections: collections.map(c => ({ id: c.id, name: c.name, modes: c.modes })),
       components: components.map(c => ({ id: c.id, name: c.name, type: c.type }))
     };
     ```
   - **No** intentes `figma_get_design_system_kit` sin token REST configurado — falla con `FIGMA_ACCESS_TOKEN not configured`.
4. `figma_get_selection` para saber dónde está parado el usuario.

Si encontraste design system existente, **reutiliza lo que encaje** (match por valor de color, no solo por nombre) en lugar de duplicar.

---

## 05. Fase 2 — Discovery del input

### Single artifact:
- Lee el HTML del mensaje o archivo.
- Cuenta pantallas implícitas (un artifact suele ser 1 sola pantalla; busca `<section>` con `id` de rutas, o router SPA en JS).
- Extrae CSS de: `<style>` blocks, `style=""` attributes, `<link rel="stylesheet">` (resuelve URLs externos con `web_fetch`).

### Proyecto multi-archivo:
- `bash_tool` con `find <path> -type f \( -name "*.html" -o -name "*.css" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.vue" -o -name "*.svelte" \)`.
- Lee cada archivo relevante.
- Para React/Vue/Svelte: **cada archivo de componente es candidato directo a Component Set**.
- Detecta rutas (React Router, Next.js `pages/`, etc.). Cada ruta es una pantalla.

### URL en vivo:
- `web_fetch` para traer HTML renderizado.

### Output interno:
- Lista de pantallas detectadas con su path y viewport probable.
- Lista de archivos CSS parseados.
- Lista de assets (imágenes, iconos SVG) con sus paths.

Resume al usuario: *"Detecté N pantallas: [list]. ¿Procedo con todas o quieres priorizar?"*

---

## 06. Fase 3 — Parsear CSS y extraer tokens

Recorre todo el CSS y agrupa en **5 categorías**:

| Categoría | Qué extraer | Cómo nombrar en Figma |
|---|---|---|
| **Colors** | `color`, `background-color`, `border-color`, `fill`, `stroke`, `box-shadow color`. CSS custom properties `--color-*`. | `color/primary`, `color/surface/base`, `color/text/primary`. Jerarquía con `/`. |
| **Typography** | Combinaciones únicas de `font-family` + `font-size` + `font-weight` + `line-height` + `letter-spacing`. | Variables: `typography/size/base`, `typography/weight/bold`. **Además, crea Text Styles** (ver Fase 6) por combinación. |
| **Spacing** | Valores únicos de `padding`, `margin`, `gap`. | `spacing/100`, `spacing/200` (numérica) o `spacing/xs`, `spacing/sm` (semántica). Sigue la convención del CSS. |
| **Radius** | `border-radius` únicos. | `radius/sm`, `radius/md`, `radius/lg`, `radius/full`. |
| **Effects** | `box-shadow` y `filter` únicos. | **No son variables** — van como **Effect Styles** (`shadow/sm`, `shadow/md`). |

### Reglas de extracción

1. **Deduplica agresivamente.** `#0B4D58` y `rgb(11,77,88)` son el mismo color → un solo token.
2. **`--variables` en `:root` = source of truth.** Sus nombres ya están dados.
3. **Política de declarados-pero-sin-uso** (`--space-500` declarado pero no usado): por default **respeta el sistema declarado y créalo en Figma** (un designer suele querer la escala completa aunque parte no se use aún). Marca con annotation `unused-in-code` si quieres rastrearlos.
4. **Detecta modes.** `[data-theme="dark"]`, `[data-mode="dark"]`, `.dark`, `@media (prefers-color-scheme: dark)` → crea Collection con `Light` + `Dark` modes.
5. **Mínimo para token:** un valor aparece ≥2 veces, O viene de una `--variable` declarada, O **pertenece a una familia semántica** (siguiente regla).
6. **Familias semánticas (regla crítica que la heurística básica falla):** valores únicos que forman un grupo cohesivo cuentan como un solo "uso colectivo". Ejemplo: cuatro `rgba()` para tints de badges success/warning/danger/neutral aparecen 1× cada uno, pero juntos forman la familia `color/tint/*` y deben volverse 4 tokens nuevos. Heurística: si encuentras N≥3 valores que comparten patrón estructural (mismo alpha, misma función) y se aplican a clases hermanas (`.badge--success`, `.badge--warning`...), crea tokens para todos.

### Detección de valores hardcoded no obvios

Después de extraer las `--variables`, busca valores de color (`rgba(...)`, `#hex`) **dentro de las reglas CSS** (no en `:root`). Esos son candidatos a nuevos tokens:
- Si forman familia (regla anterior) → crear tokens.
- Si son valores únicos de un contexto específico (ej. `rgba(255,255,255,0.7)` para texto sobre dark surface) → crear token nuevo con nombre semántico (`color/sidebar/text-muted`).
- Si es un valor verdaderamente one-off (un drop shadow específico de hero) → mantener hardcoded.

### Regex correcto para CSS

- Custom properties: `^\s*(--[\w-]+)\s*:\s*([^;]+);`
- BEM modifiers: `\.([\w-]+)--([\w-]+)` (el `--` separa base de modifier, no es `:hover`)
- Pseudo-states con BEM modifier: `\.([\w-]+)(?:--[\w-]+)?:(\w+)` — captura tanto `.btn:hover` como `.btn--primary:hover`. **Verifica el match group**: la base es group 1, el state es group 2; el modifier opcional se descarta.

### Output de la fase

Tabla por categoría con: nombre del token, valor, count de uso, marca de "declarado-sin-uso" o "familia-semántica".

---

## 07. Fase 4 — Inventario de componentes

Construye un **inventario** de elementos repetidos o estructurados.

### Heurísticas de detección

| Señal | Peso |
|---|---|
| Archivo `Button.tsx` / `Card.vue` / `<template>` existe | Muy alto — el archivo es source of truth |
| Atributo `data-component="..."` | Muy alto |
| Misma clase CSS aparece ≥3 veces en pantallas distintas | Alto |
| Patrón BEM repetido (`.btn`, `.btn--primary`, `.btn--secondary`) | Alto — variantes ya explícitas |
| **Estructura repetida sin clase**: ≥3 elementos con el mismo tag + misma estructura interna (e.g. `<tr>` con 4 `<td>` repetidos) | Alto |
| Mismo `<div>` con la misma estructura interna repetido | Medio |
| Elementos visualmente idénticos pero con clases distintas | Bajo — revisa, puede ser duplicación accidental |

**Detección estructural sin clase (crítico — la heurística de classes lo pierde):** después de contar classes, recorre el DOM buscando padres con N≥3 hijos del mismo tag y misma estructura interna. Si encuentras `<tbody>` con 5 `<tr>` idénticas en su shape, el `<tr>` es candidato a componente aunque no tenga clase. Igual para `<ul>` con `<li>` repetidos, `<nav>` con `<a>` repetidos.

### Por cada componente detectado, define

1. **Nombre canónico:** `Button`, `Card`, `Input`, `NavItem`, `TableRow`.
2. **Variants:** dimensiones del Component Set:
   - Modificadores BEM (`.btn--primary` → variant `kind=primary`)
   - Props del componente React/Vue (`<Button variant="primary" size="md">`)
   - Pseudo-clases con cambios visuales (`:hover`, `:active`, `:disabled` → variant `state=default|hover|pressed|disabled`)
3. **Component properties** (no variants, sino props internas):
   - Texto editable → `text` property (label del botón).
   - Icono opcional → `instance swap` property o `boolean` para mostrar/ocultar.
4. **Layout interno:** auto-layout direction, gap, padding (del CSS del componente).
5. **Tokens que usa:** lista de variables que aplican.
6. **Nested instances:** ¿este componente contiene otro componente? (Ej. StatCard contiene un Badge; TableRow contiene un Badge en la columna status). Documéntalo, porque la creación de Fase 7 debe respetar el orden de dependencia.

### Orden de creación (importante)

Ordena el inventario por **dependencias**: componentes sin nested instances primero, luego los que dependen de ellos. En la prueba del SaaS: Badge → Button → NavItem → StatCard (depende de Badge) → TableRow (depende de Badge).

---

## 08. Fase 5 — Checkpoint + Blueprint persistente

**No avances sin confirmación explícita.** Presenta un resumen compacto al usuario:

```
📐 Tokens detectados
  Colors: 17 (1 mode: Light)
    + 4 tints semánticos propuestos (familia)
  Typography: 10 (6 sizes + 4 weights) + propone N text styles
  Spacing: 7
  Radius: 4
  Effects: 2 (irán como Effect Styles, no variables)

🧩 Components detectados (5) — orden de creación
  1. Badge — 4 variants (kind)
  2. Button — 6 variants (kind × state)
  3. NavItem — 3 variants (state)
  4. StatCard — sin variants, anida Badge
  5. TableRow — sin variants, anida Badge

📱 Screens a pintar (1)
  Dashboard / Desktop — 1440×900
```

### Guardar el blueprint como JSON

Antes de avanzar a Fase 6, guarda el plan completo en `/home/claude/figma-handoff-blueprint.json` con la estructura:

```json
{
  "phase_completed": 5,
  "input_summary": { "type": "single|multi", "screens": [...], "css_files": [...] },
  "tokens": {
    "colors": [...],
    "spacing": [...],
    "radius": [...],
    "typography_sizes": [...],
    "typography_weights": [...],
    "effects": [...],
    "text_styles": [...]
  },
  "components": [
    {
      "name": "Badge",
      "variants": [{ "props": { "kind": "success" }, "tokens": {...}, "text": "..." }, ...],
      "component_properties": [...],
      "nested_dependencies": []
    }
  ],
  "screens": [
    { "name": "...", "width": 1440, "height": 900, "tree": [...] }
  ],
  "figma_ids": {}
}
```

**Después de cada fase ejecutada (6, 7, 8, 9), actualiza `phase_completed` y agrega los IDs de Figma a `figma_ids`.** Así, si el plugin cae a mitad de ejecución, puedes reanudar leyendo el blueprint sin perder estado.

Espera "ok"/"sí"/"procede" antes de la Fase 6. En este punto, si el plugin no está conectado, pide al usuario que active Murdoc + Figma Desktop antes de continuar.

---

## 09. Fase 6 — Tokens en Figma

### 6a. Variables Collections

Orden de creación (cada collection alimenta a la siguiente):

1. **Colors** (con modes si aplica) — usa `figma_setup_design_tokens` en **una sola llamada** (collection + modes + variables atómico). Hex con alpha va como 8-digit hex: `#16A34A1A` (= `rgba(22,163,74,0.1)`).
2. **Spacing**, **Radius** — `figma_setup_design_tokens` o `figma_create_variable_collection` + `figma_batch_create_variables`. Tipo `FLOAT`.
3. **Typography** (sizes y weights en la misma collection, agrupados con `/` en el nombre: `typography/size/base`, `typography/weight/bold`). Tipo `FLOAT`.

Después de cada Collection creada, **registra el `collectionId`, los `modeId` y los `variableId`** en el blueprint JSON. Los necesitas para las Fases 7 y 8.

### 6b. Effect Styles (shadows, blurs)

Figma Variables **no soporta shadows nativamente**. Crear como Effect Styles vía `figma_execute`:

```js
async function createEffectStyle() {
  const style = figma.createEffectStyle();
  style.name = 'shadow/sm';
  style.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.05 },
    offset: { x: 0, y: 1 },
    radius: 2,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL'
  }];
  return { id: style.id, name: style.name };
}
return createEffectStyle();
```

Para aplicar en un nodo después: `node.effectStyleId = style.id` (no `node.effects = [...]`, eso es para efectos inline).

### 6c. Text Styles

Por cada combinación única de `font-family + font-size + font-weight + line-height + letter-spacing` que detectaste en Fase 3, crea un Text Style. Esto es lo que el linter `no-text-style` pide:

```js
async function createTextStyle() {
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  const style = figma.createTextStyle();
  style.name = 'body/semibold';
  style.fontName = { family: 'Inter', style: 'Semi Bold' };
  style.fontSize = 14;
  style.lineHeight = { unit: 'PERCENT', value: 150 };
  style.letterSpacing = { unit: 'PIXELS', value: 0 };
  return { id: style.id };
}
return createTextStyle();
```

Naming sugerido: `<role>/<weight>` (e.g. `display/bold`, `heading/semibold`, `body/regular`, `caption/medium`). Los tamaños quedan implícitos en el role.

### 6d. Section "Tokens" — visualización

Crea una **Section real** (no frame) con `figma.createSection()` con muestras visuales de la escala. Los Section nodes no aplican layout y son ideales para organizar el archivo:

```js
const section = figma.createSection();
section.name = 'Tokens';
section.x = X;
section.y = Y;
section.resizeWithoutConstraints(W, H);
figma.currentPage.appendChild(section);
```

---

## 10. Fase 7 — Crear Components

Para cada componente del inventario (en orden de dependencias de Fase 4):

### 10a. Búsqueda previa de reuso

Llama a `figma_execute` para buscar si ya existe algo similar:

```js
const existing = await figma.currentPage.findAllAsync(
  n => (n.type === 'COMPONENT_SET' || n.type === 'COMPONENT') && n.name.toLowerCase() === 'button'
);
return existing.map(c => ({ id: c.id, name: c.name }));
```

Si existe, propón reuso al usuario antes de crear duplicado.

### 10b. Crear cada variante como Component, luego combinar

**Patrón obligatorio para variants** (el bug más fácil de cometer):

1. Crea cada variante con `figma.createComponent()`.
2. **Asígnale nombre con la convención `prop=value, prop2=value2`** (ej. `kind=primary, state=hover`).
3. **`figma.currentPage.appendChild(c)` ANTES de combinar** — `combineAsVariants` requiere que los componentes estén en la página, no flotando en memoria.
4. Cuando todos los variants están colocados: `figma.combineAsVariants([v1, v2, ...], figma.currentPage)`.
5. Renombra el Component Set resultante con el nombre canónico (`Button`).

### 10c. Bind de variables a propiedades del componente

Para **fills/strokes** (necesita helper especial):

```js
function bindFill(node, colorVar) {
  const ph = { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } };
  node.fills = [figma.variables.setBoundVariableForPaint(ph, 'color', colorVar)];
}
function bindStroke(node, colorVar) {
  const ph = { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } };
  node.strokes = [figma.variables.setBoundVariableForPaint(ph, 'color', colorVar)];
  node.strokeWeight = 1;
}
```

Para **layout properties** (padding, gap, radius, fontSize, fontWeight):

```js
node.setBoundVariable('paddingTop', spacingVar);
node.setBoundVariable('paddingBottom', spacingVar);
node.setBoundVariable('paddingLeft', spacingVar);
node.setBoundVariable('paddingRight', spacingVar);
node.setBoundVariable('itemSpacing', gapVar);
node.setBoundVariable('topLeftRadius', radiusVar);
node.setBoundVariable('topRightRadius', radiusVar);
node.setBoundVariable('bottomLeftRadius', radiusVar);
node.setBoundVariable('bottomRightRadius', radiusVar);

// En text nodes:
textNode.setBoundVariable('fontSize', sizeVar);
textNode.setBoundVariable('fontWeight', weightVar);
```

Para **Text Styles**: prefiere `node.textStyleId = style.id` cuando creaste un text style en Fase 6c. Si solo tienes variables sueltas, usa `setBoundVariable` como arriba (peor para handoff porque el linter marca `no-text-style`).

### 10d. Component Properties (TEXT / BOOLEAN / INSTANCE_SWAP)

```js
const labelPropId = compSet.addComponentProperty('label', 'TEXT', 'Default text');
// Bind a un text node específico de cada variant:
variants.forEach(v => {
  v.textNode.componentPropertyReferences = { characters: labelPropId };
});
```

**Importante:** `addComponentProperty` devuelve una key con sufijo `#nodeId` (ej. `label#150:21`). Ese es el ID correcto, guárdalo. Si después necesitas setear la prop desde una instance, usa la key completa (con sufijo).

### 10e. Component que anida otro Component

```js
const badgeSet = await figma.getNodeByIdAsync('150:265');
const successVariant = badgeSet.children.find(c => c.name === 'kind=success');
const badgeInstance = successVariant.createInstance();
await badgeInstance.setProperties({ [Object.keys(badgeInstance.componentProperties)[0]]: '+12.5%' });
card.appendChild(badgeInstance);
```

Si la instance tiene múltiples props, no uses `Object.keys(...)[0]` — itera y matchea por prefijo (`'label#'`, `'kind#'`).

### 10f. Reposicionar / organizar

Al final de la fase, llama a `figma_arrange_component_set` por cada Component Set para que quede ordenado con el grid púrpura visual de Figma. Luego mueve todos los component sets a la Section "Components" (creada en Fase 6d).

**Nota sobre Sections vs Frames:** los Sections (`figma.createSection()`) son contenedores ligeros sin auto-layout, ideales para agrupar Component Sets sin afectarlos. Si usas un Frame con auto-layout como contenedor, los components heredan el layout y se rompen. Usa **Section** para "carpetas" organizativas.

### 10g. Verificación

Por cada Component Set creado, llama a `figma_analyze_component_set` con el ID para validar consistencia cross-variant.

---

## 11. Fase 8 — Crear Screens

Para cada pantalla del inventario:

### 11a. Frame raíz

Crea el frame del tamaño correcto con `figma.createFrame()`:
- Desktop: `1440 × <alto>`
- Tablet: `768 × <alto>`
- Mobile: `375 × <alto>` (o `390` para iOS moderno)
- Si hay `@media` breakpoints, **un frame por breakpoint relevante**, nombrado `<Name> / <Breakpoint>`.

Aplica auto-layout horizontal o vertical según la estructura raíz del HTML, bind del background al token correspondiente.

### 11b. Recorrer el DOM y emitir nodos

Por cada elemento del DOM:
- **Match con Component Set existente** → `variant.createInstance()`, luego `setProperties` con los valores del HTML. Para nested instances dentro de la instance principal, usa `instance.findOne(n => n.type === 'INSTANCE')` y aplica props también ahí.
- **Contenido único** (heading, hero text, logo) → crea nodos directos con `figma.createText()`, bind a tokens.
- **Layout containers** (`<div>`, `<section>`, `<header>` con flex/grid) → `figma.createFrame()` con `layoutMode = 'HORIZONTAL' | 'VERTICAL'`, padding y gap bound a tokens.

### 11c. Helper para obtener TEXT prop key de una instance

```js
function getTextPropKey(instance) {
  return Object.keys(instance.componentProperties).find(
    k => instance.componentProperties[k].type === 'TEXT'
  );
}
```

### 11d. Imágenes

```js
const image = await figma.createImageAsync('https://...');
node.fills = [{
  type: 'IMAGE',
  scaleMode: 'FILL',
  imageHash: image.hash
}];
```

Si no tienes el asset, deja placeholder gris y agrega annotation `Missing asset — replace with <path>`.

### 11e. Nomenclatura

- Frame de pantalla: `Screen / <Name>` o `<Name> / <Breakpoint>` (ej. `Dashboard / Desktop`).
- ⚠ El `/` en el nombre puede hacer que el linter marque `detached-component`. Es un falso positivo aceptable; documéntalo en el resumen final.

---

## 12. Fase 9 — Annotations + Lint

### 12a. Annotations (vía `figma_execute`)

`figma_set_annotations` puede fallar (`Unknown method: SET_ANNOTATIONS`) en algunos bridges. Fallback obligatorio:

```js
async function annotate() {
  await figma.currentPage.loadAsync();
  const node = await figma.getNodeByIdAsync('150:278');
  node.annotations = [{
    label: 'Hover transition: background-color 150ms ease. Cursor pointer.',
    properties: [
      { type: 'fills' },
      { type: 'cornerRadius' }
    ]
  }];
  return { ok: true };
}
return annotate();
```

Anota:
- En cada Component Set: animations, transitions, interaction (hover/click/focus behavior).
- En screens: stickys, scroll-snap, breakpoint thresholds.

### 12b. Descriptions

Por cada Component Set, agrega descripción con `figma_execute`:

```js
const node = await figma.getNodeByIdAsync('150:278');
node.description = 'Primary CTA button. Use ghost for tertiary actions; secondary for non-destructive defaults.';
```

### 12c. Lint

Llama a `figma_lint_design` con `nodeId` apuntando al frame de cada screen y a la Section "Components".

**Interpretación de findings (importante para no entregar ruido):**

| Finding | ¿Real? | Acción |
|---|---|---|
| `wcag-contrast` con `fg` y `bg` iguales (ej. `#16A34A` sobre `#16A34A`) | **Falso positivo** | El linter no compone alpha sobre el parent. El bg real era `#16A34A1A` (10% opacity) sobre blanco = `#E7F6EC`. Marca como "false positive: alpha compositing not evaluated" y omite del reporte al usuario. |
| `no-text-style` con muchos hits | **Real solo si NO creaste text styles en Fase 6c** | Si los creaste, los textos no los aplicaron — fix: rebindear `textStyleId` en cada text node. |
| `default-name` | Real, fix rápido | Renombra los frames "Frame", "Group 1", etc. |
| `detached-component` en frames con `/` en el nombre | **Falso positivo** | El linter detecta el `/` como pattern de componente. Acepta y documenta. |
| `wcag-contrast` real (no alpha) | **Real** | Propón al usuario el color más cercano que cumple ratio. |
| `touch-target` < 44×44 | Real | Sugiere padding adicional o ignora si es desktop-only. |

### 12d. Validación visual

`figma_capture_screenshot` con `nodeId` del frame de screen, `scale: 1`. Si timeout, omite — no es bloqueante.

---

## 13. Heurísticas clave

### Cuándo crear variant vs property

| Caso | Variant o Property |
|---|---|
| Cambio **visual estructural** (otro layout, otros colores) | Variant |
| Cambio solo en **texto** | Property `text` |
| Cambio de **mostrar/ocultar** sub-elemento | Property `boolean` |
| **Swap de icono** | Property `instance swap` |
| Estados (`hover`, `active`, `disabled`) | Variant `state=...` |

### Cuándo token vs hardcoded

| Caso | Decisión |
|---|---|
| Valor en `:root` como `--variable` | Token, sí o sí (aunque sin uso en código) |
| Valor aparece ≥2 veces | Token |
| Valor único pero **pertenece a familia semántica** (tints, escala) | Token |
| Valor único y arbitrario (`top: 47px`) | Hardcoded |

### Cuándo crear nuevos tokens encima de los declarados

Cuando el CSS aplica `rgba(...)` o color compuesto que no está en `:root` y tiene **rol semántico claro** (text sobre dark surface, bg de nav item activo), créalo como token nuevo con nombre semántico antes de la Fase 7. Documéntalo en el blueprint con flag `proposed: true`.

### Detección de modes (light/dark)

Busca `[data-theme="dark"]`, `[data-mode="dark"]`, `.dark`, `@media (prefers-color-scheme: dark)`. Si encuentras, Collection "Colors" con dos modes. Si en `dark` un color no se redefine, hereda del default.

### Detección de breakpoints responsive

Busca `@media (min-width: ...)`, `(max-width: ...)`. Múltiples breakpoints → un frame por breakpoint × pantalla.

---

## 14. Anti-patrones

🚫 **No** invoques tools que no existen (`figma_set_fills`, `figma_set_text`, `figma_resize_node`, `figma_clone_node` y similares). Usa `figma_execute` con Plugin API.

🚫 **No** uses la API síncrona (`getNodeById`, `getVariableById`) — siempre los `Async` con `await`.

🚫 **No** olvides `await figma.currentPage.loadAsync()` al inicio de cada `figma_execute`. Sin eso, las búsquedas de nodos por ID fallan silenciosamente.

🚫 **No** olvides `await figma.loadFontAsync(...)` antes de crear/editar texto. Sin eso, `characters = '...'` arroja error.

🚫 **No** llames a `combineAsVariants` con componentes que no están añadidos a la página.

🚫 **No** intentes shadows o blurs como variables. Effect Styles, siempre.

🚫 **No** dejes textos sin Text Style si el archivo tiene Text Styles definidos. El linter lo marca.

🚫 **No** uses un Frame con auto-layout como contenedor de Component Sets. Usa Section.

🚫 **No** crees Component Sets para elementos que aparecen una sola vez. Frames directos.

🚫 **No** dupliques tokens que ya existen. Si Fase 1 detecta un design system, **respétalo y úsalo**.

🚫 **No** avances de fase sin confirmación del usuario en el Checkpoint.

🚫 **No** reportes findings del lint sin filtrar falsos positivos conocidos (alpha contrast, `/` naming).

🚫 **No** uses contenido de relleno inventado. Texto real del HTML; placeholders explícitos (`[User name]`) para contenido dinámico.

---

## 15. Naming conventions

| Elemento Figma | Convención |
|---|---|
| Variables Collection | `Colors`, `Typography`, `Spacing`, `Radius` |
| Variable | `category/subcategory/name` (ej. `color/text/primary`, `spacing/300`) |
| Effect Style | `shadow/sm`, `shadow/md`, `blur/lg` |
| Text Style | `<role>/<weight>` (ej. `body/regular`, `heading/bold`) |
| Component | `PascalCase` simple (`Button`, `Card`, `NavItem`) |
| Variant property | `lowercase` (`kind`, `size`, `state`) |
| Variant value | `lowercase` (`primary`, `secondary`, `default`, `hover`) |
| Component property (text/bool/swap) | `camelCase` (`label`, `hasIcon`, `iconStart`) |
| Screen frame | `Screen / <Name>` o `<Name> / <Breakpoint>` |
| Section frame | `Tokens`, `Components`, `Screens` |

Si el archivo destino ya tiene convención distinta (detectada en Fase 1), **adáptate a la existente**.

---

## 16. Edge cases

| Situación | Manejo |
|---|---|
| Plugin desconectado al inicio | Avanza Fases 2-5 igual. Pide reconexión antes de Fase 6. Carga blueprint JSON al reconectar. |
| Plugin se cae a mitad | Lee `phase_completed` del blueprint, reanuda desde la siguiente fase. |
| `figma_get_design_system_kit` falla (sin REST token) | Fallback a `figma_get_design_system_summary` o `figma_execute` con `getLocalVariableCollectionsAsync`. |
| `figma_capture_screenshot` timeout | Skip — no es bloqueante. Continúa con lint. |
| `figma_set_annotations` falla con `Unknown method` | Fallback a `figma_execute` con `node.annotations = [...]`. |
| CSS usa Tailwind | Las clases son utilities, no semánticas. Detecta valores computados después del build, o resuelve `tailwind.config.js` si está. |
| CSS-in-JS (styled-components, emotion) | Parsea template literals en `.tsx`/`.ts`. Cada styled component es candidato a Component. |
| `<canvas>` o `<svg>` complejos | SVG: importa como nodo SVG vía `figma.createNodeFromSvg(svgString)`. Canvas: captura como imagen y marca annotation. |
| Animaciones (`@keyframes`, transitions) | No las recrees. Anótalas con `node.annotations`. |
| Fonts no estándar | Si el font-family no está en Figma, usa fallback más cercano (Inter es seguro). Avisa al usuario. |
| Más de 50 pantallas | Pregunta al usuario por subset. Procesa en batches de 10 con resumen entre batches. |
| Usuario interrumpe a mitad | Resume al cierre lo hecho y lo que falta. Permite continuar con `use_skill html-to-figma-handoff` + referencia al blueprint. |
| Linter da `wcag-contrast 1.0:1` con fg=bg iguales | Falso positivo de alpha compositing. Filtra del reporte. |

---

## 17. Resumen final al usuario

Al terminar todas las fases:

```
✅ Handoff listo

📐 Tokens
  Variables: 41 en 4 collections (Colors, Typography, Spacing, Radius)
  Effect Styles: 2 (shadow/sm, shadow/md)
  Text Styles: 7 (display/bold, heading/semibold, body/regular, ...)

🧩 Components: 5 component sets, 14 variants totales
  Badge (4 variants) · Button (6 variants) · NavItem (3 variants)
  StatCard · TableRow (anidan Badge)

📱 Screens: 1 frame
  Dashboard / Desktop (1440×900)

🔗 Estructura del archivo Figma:
  • Section "Tokens" — escalas visuales documentadas
  • Section "Components" — listos para usar (con properties + annotations)
  • Section "Screens" — todas las pantallas con instances

⚠️ Findings del lint (filtrando falsos positivos):
  • [reales únicamente — alpha contrast y `/` naming omitidos]

📂 Blueprint guardado en /home/claude/figma-handoff-blueprint.json
   (Permite reanudar si necesitas volver a ejecutar.)

Próximos pasos:
  • Revisar findings reales del lint
  • Conectar este archivo a tu librería de marca si aplica
  • Compartir con el equipo de dev — specs en annotations + descriptions
```

---

## 18. Changelog

- **v2.1** — Incorpora 13 findings de la prueba E2E con Pulse Dashboard: tools reales vs inexistentes, patrón async obligatorio (`loadAsync`, `getByIdAsync`), Effect Styles + Text Styles separados de Variables, política para tokens declarados-sin-uso, detección de familias semánticas, detección estructural de componentes sin clase, Sections vs Frames, blueprint JSON persistente, fallback de annotations vía `figma_execute`, interpretación de falsos positivos del lint, patrón correcto de `combineAsVariants`, regex BEM+pseudo-states.
- **v2** — Análisis semántico + diagrama de arquitectura (Claude lee el HTML completo antes de tocar Figma).
- **v1** — Versión inicial, estructura 9 fases.
