# generate-library

Skill para crear una librería de componentes en Figma a partir del análisis de un codebase existente. Lee el código fuente, extrae componentes, props, variantes y tokens, y los recrea como componentes nativos de Figma conectados al sistema de diseño.

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Cuando usar este skill
- Cuando existe un codebase con componentes (React, Vue, Angular, Svelte) y se necesita la librería en Figma
- Cuando la librería de Figma está desactualizada respecto al código
- Cuando se empieza un proyecto Figma desde un producto ya construido
- Cuando se quiere generar un design system desde la fuente de verdad del código

## Parámetros disponibles
El usuario puede especificar:
- `framework`: react · vue · angular · svelte · web-components (default: autodetectar)
- `ruta`: path al directorio de componentes (ej: `src/components`)
- `alcance`: todos · específicos (lista de componentes a generar)
- `tokens`: si incluir tokens/variables del código (default: sí)
- `plataforma`: mobile · desktop · ambos (default: ambos)

## Pasos de ejecución

### Paso 0 — Preflight reuse-first (buscar antes de generar)
> Antes de planificar y crear componentes, ejecuta el skill `reuse-first`: contrasta la lista de componentes del codebase contra el registry del contrato, el archivo y las librerías vinculadas. Los que ya existan se reutilizan/actualizan en vez de duplicarse; solo los ausentes entran al plan de creación de los pasos siguientes.

### Paso 1 — Obtener información del codebase

Pedir al usuario que comparta la estructura de sus componentes. Se puede obtener de varias formas:

**Opción A — El usuario describe los componentes:**
```
Pedir lista de componentes con sus props, variantes y tokens.
Ejemplo: "Tengo un Button con variantes primary/secondary/ghost, 
tamaños sm/md/lg, y props: label (text), icon (optional), disabled (boolean)"
```

**Opción B — El usuario pega código fuente:**
```
Analizar el código para extraer:
- Nombre del componente
- Props y sus tipos (string, boolean, enum, ReactNode/slot)
- Variantes (size, variant, state)
- Tokens CSS/Tailwind usados (colores, spacing, radii, typography)
- Composición (qué componentes hijos usa)
```

**Opción C — El usuario comparte un JSON/spec:**
```
Parsear la spec para obtener la misma información.
Formato esperado por componente:
{
  name: "Button",
  props: { label: "string", disabled: "boolean", icon: "ReactNode" },
  variants: { size: ["sm", "md", "lg"], variant: ["primary", "secondary", "ghost"] },
  tokens: { bg: "color-primary-500", text: "color-white", radius: "radius-md" }
}
```

### Paso 2 — Verificar sistema de diseño existente en Figma

```
- figma_get_variables → ¿hay tokens ya definidos?
- figma_search_components → ¿hay componentes existentes?
- Si hay DS existente → usarlo como base, no duplicar
- Si no hay DS → preguntar si crear tokens base primero (skill: setup-radix-base)
```

### Paso 3 — Planificar la librería

Antes de crear, presentar el plan al usuario:
```
## Plan de librería

### Tokens a crear (si no existen):
- Colores: primary, secondary, neutral, error, success (X variables)
- Tipografía: heading-lg, heading-md, body, caption (X variables)
- Spacing: xs(4), sm(8), md(16), lg(24), xl(32) (X variables)
- Radii: sm(4), md(8), lg(16), full(9999) (X variables)

### Componentes a generar:
1. Button — 3 variantes × 3 tamaños = component set con 9 variantes
   Props: label (TEXT), icon (INSTANCE_SWAP), disabled (BOOLEAN)
2. Input — 2 variantes × 3 tamaños × 3 estados
   Props: placeholder (TEXT), label (TEXT), error (BOOLEAN)
3. Card — slot-ready con slot-body y slot-actions
   Props: title (TEXT), size (VARIANT)
...

### Organización:
- Página: "Component Library"
- Secciones por categoría: Primitives, Forms, Layout, Feedback, Navigation
```

Esperar confirmación del usuario antes de crear.

### Paso 4 — Crear tokens (si no existen)

> ⚠️ Usar `figma_setup_design_tokens` con máximo 100 tokens por llamada.
> Dividir por categoría si hay más.

```
- Crear colección de variables "Design Tokens"
- Modo: Light (y Dark si el usuario lo pide)
- Categorías: color, typography, spacing, radius, elevation
- Mapear tokens del código a variables de Figma
```

### Paso 5 — Crear componentes

> ⚠️ **REGLAS OBLIGATORIAS:**
> - Un componente por llamada a `figma_execute` con `timeout: 15000`
> - Usar `await figma.loadFontAsync()` antes de crear textos
> - Usar `await figma.getNodeByIdAsync()` — nunca la versión sync
> - Devolver solo `{ id, name }` del componente creado
> - Aplicar variables del DS, nunca hardcodear valores

**Orden de creación (de primitivos a compuestos):**
1. **Primitives:** Icon placeholders, Dividers, Badges
2. **Atoms:** Button, Input, Checkbox, Radio, Switch, Avatar
3. **Molecules:** InputField (label + input + error), Card, ListItem, Tag
4. **Organisms:** Modal, Navigation, Form, Table header
5. **Templates:** Page layouts (si aplica)

**Para cada componente:**
```javascript
// ✅ Patrón probado en producción — timeout: 15000
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Medium" });
await figma.loadFontAsync({ family: "Inter", style: "Bold" });

const section = await figma.getNodeByIdAsync("SECTION_ID");

// Crear componente base
const component = figma.createComponent();
component.name = "Button";
component.resize(120, 44);  // ⚠️ Mínimo 44px para touch target
component.layoutMode = "HORIZONTAL";
component.primaryAxisAlignItems = "CENTER";
component.counterAxisAlignItems = "CENTER";
component.itemSpacing = 8;
component.paddingLeft = 16;
component.paddingRight = 16;
component.paddingTop = 10;
component.paddingBottom = 10;
component.cornerRadius = 8;

// ⚠️ Bindear variable con boundVariables, NO setBoundVariable
const vars = await figma.variables.getLocalVariablesAsync();
const bgVar = vars.find(v => v.name.includes('primary'));
if (bgVar) {
  component.fills = [{
    type: "SOLID",
    color: { r: 0.2, g: 0.4, b: 1 },
    boundVariables: { color: { type: "VARIABLE_ALIAS", id: bgVar.id } }
  }];
} else {
  component.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 1 } }];
}

// ⚠️ Sombra con blendMode obligatorio
component.effects = [{
  type: "DROP_SHADOW",
  color: { r: 0, g: 0, b: 0, a: 0.1 },
  offset: { x: 0, y: 2 },
  radius: 4,
  blendMode: "NORMAL",
  visible: true
}];

// Agregar texto
const label = figma.createText();
label.characters = "Button";
label.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
component.appendChild(label);
// ⚠️ layoutSizing DESPUÉS de appendChild
label.layoutSizingHorizontal = "HUG";

// Agregar text property
component.addComponentProperty("Label", "TEXT", "Button");

section.appendChild(component);
return { id: component.id, name: component.name };
```

### Errores comunes al crear componentes (descubiertos en testing)

| Error | Fix |
|---|---|
| Input colapsa a 10px de alto | Usar `resize(width, 44)` con `primaryAxisSizingMode: "FIXED"` |
| `layoutSizingHorizontal = "FILL"` no funciona | Setear DESPUÉS de `appendChild`, no antes |
| `primaryAxisSizingMode: "HUG"` falla | El valor correcto es `"AUTO"` |
| `layoutSizingVertical: "AUTO"` falla | El valor correcto es `"HUG"` |
| Variables no se bindean | Usar `boundVariables` dentro del paint object |
| Sombra no aparece | Agregar `blendMode: "NORMAL"` obligatoriamente |

### Paso 6 — Crear component sets (variantes)

Para componentes con variantes:
```
- Crear cada variante como componente individual
- Combinar con figma.combineAsVariants([...], parent)
- Nombrar variantes: "Size=md, Variant=primary, State=default"
- Aplicar properties compartidas: TEXT, BOOLEAN, INSTANCE_SWAP
```

> ⚠️ `combineAsVariants` puede ser lento. Usar `timeout: 20000`.

### Paso 7 — Crear estructura slot-ready (si aplica)

Para componentes que necesitan flexibilidad (cards, modals, list items):
```
- Crear frames internos con prefijo "slot-" y Auto Layout
- Configurar fill/hug según el patrón (ver skill: slot-patterns)
- Documentar que el diseñador puede convertir a slot nativo
```

### Paso 8 — Verificación

```
- figma_capture_screenshot de cada componente creado
- Verificar que usa variables del DS (no valores hardcodeados)
- Verificar nomenclatura de capas
- Verificar que los component properties están configurados
- Reportar resumen al usuario
```

### Paso 9 — Generar documentación

Para cada componente creado, documentar:
```
## [Component Name]
- Props: label (TEXT), disabled (BOOLEAN), icon (INSTANCE_SWAP)
- Variantes: Size (sm/md/lg), Variant (primary/secondary/ghost)
- Tokens usados: bg → color-primary-500, text → color-white
- Slots: slot-body (si aplica)
- Equivalente en código: <Button variant="primary" size="md">Label</Button>
```

## Mapeo de tipos código → Figma

| Tipo en código | Tipo en Figma | Notas |
|---|---|---|
| `string` (label, placeholder) | TEXT property | Editable en instancias |
| `boolean` (disabled, visible) | BOOLEAN property | Controla visibilidad o estado |
| `enum` (size, variant) | VARIANT | Cada valor = una variante |
| `ReactNode` / `children` / `slot` | Frame slot-ready | Nombrar `slot-*`, convertir manualmente |
| `() => void` (onClick) | No aplica en Figma | Documentar en anotaciones |
| `IconType` / componente | INSTANCE_SWAP | Con preferred instances |

## Ejemplos de uso
- "Genera la librería de componentes de mi app React en Figma"
- "Tengo estos componentes en Vue, créalos en Figma con sus variantes"
- "Crea un Button, Input y Card en Figma basándote en este código"
- "Importa los tokens de mi Tailwind config como variables de Figma y genera los componentes"
