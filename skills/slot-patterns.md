# slot-patterns

Patrones de composición con slots nativos de Figma. Define cómo estructurar componentes comunes (card, modal, list, nav, form) para aprovechar slots al máximo.

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Cuando usar este skill
- Cuando se crea un componente nuevo que necesita ser flexible
- Cuando se quiere seguir mejores prácticas de composición con slots
- Cuando se documenta cómo usar slots en la librería del equipo

## Principio fundamental

**Las variantes manejan la lógica (estado, tamaño, tipo). Los slots manejan el contenido.**

No reemplaces variantes con slots. Complementa variantes con slots para reducir la explosión combinatoria.

---

## Patrones por tipo de componente

### 1. Card — Slot de contenido principal

**Estructura recomendada:**
```
Card (Component)
├── card-header (Frame, Auto Layout horizontal)
│   ├── title (Text, prop TEXT)
│   └── badge (Instance, prop INSTANCE_SWAP)
├── slot-body (Frame, Auto Layout vertical) ← SLOT
│   └── [contenido default o vacío]
├── card-footer (Frame, Auto Layout horizontal)
│   └── slot-actions (Frame) ← SLOT
```

**Variantes que mantener:** Size (S/M/L), State (default/selected/disabled)
**Variantes que eliminar:** Content=Image, Content=List, Content=Stats → el slot las reemplaza

**Default content:** Incluir un placeholder con texto "Add content" para dar contexto.
**Preferred instances:** Image block, Stats row, Description text, List group.

### 2. Modal / Dialog — Slots de header, body, footer

**Estructura recomendada:**
```
Modal (Component)
├── overlay (Rectangle, fill semi-transparente)
├── modal-container (Frame, Auto Layout vertical)
│   ├── modal-header (Frame, Auto Layout horizontal)
│   │   ├── title (Text, prop TEXT)
│   │   └── close-button (Instance)
│   ├── slot-body (Frame, Auto Layout vertical, fill container) ← SLOT
│   │   └── [contenido default o vacío]
│   └── slot-footer (Frame, Auto Layout horizontal) ← SLOT
│       └── [botones default: Cancel + Confirm]
```

**Variantes que mantener:** Size (S/M/L/fullscreen)
**Variantes que eliminar:** Type=confirmation, Type=form, Type=info → los slots las reemplazan
**Default content footer:** Dos botones (Cancel + Primary action) como contenido por defecto.

### 3. List Item — Slot de contenido leading/trailing

**Estructura recomendada:**
```
ListItem (Component)
├── slot-leading (Frame, hug, min 24x24) ← SLOT
│   └── [icon default]
├── content (Frame, Auto Layout vertical, fill)
│   ├── title (Text, prop TEXT)
│   └── subtitle (Text, prop TEXT, visible prop BOOLEAN)
└── slot-trailing (Frame, hug) ← SLOT
    └── [chevron default o vacío]
```

**Variantes que mantener:** Size (compact/default/large), State (default/hover/selected/disabled)
**Preferred instances leading:** Avatar, Icon, Checkbox, Radio, Thumbnail
**Preferred instances trailing:** Chevron, Switch, Badge, IconButton

### 4. Navigation Bar — Slots de items

**Estructura recomendada:**
```
NavBar (Component)
├── nav-header (Frame)
│   └── logo (Instance, prop INSTANCE_SWAP)
├── slot-nav-items (Frame, Auto Layout vertical, fill) ← SLOT
│   └── [nav items default]
├── nav-divider (Line)
└── slot-nav-footer (Frame, Auto Layout vertical, hug) ← SLOT
    └── [settings + profile default]
```

**El slot permite:** Agregar/quitar items de navegación sin detachar.

### 5. Form Section — Slot de campos

**Estructura recomendada:**
```
FormSection (Component)
├── section-header (Frame)
│   ├── title (Text, prop TEXT)
│   └── description (Text, prop TEXT, visible prop BOOLEAN)
├── slot-fields (Frame, Auto Layout vertical, gap 16) ← SLOT
│   └── [2 inputs default como ejemplo]
└── section-divider (Line, visible prop BOOLEAN)
```

**El slot permite:** Agregar cualquier combinación de inputs, selects, checkboxes sin crear variantes por cada formulario.

---

## Reglas de implementación para Murdoc

### Al crear componentes con estructura slot-ready:

1. **Siempre usar Auto Layout** en el frame que será slot
2. **Configurar fill container** en la dirección principal del slot
3. **Hug contents** en la dirección secundaria
4. **Nombrar con prefijo `slot-`** para claridad: `slot-body`, `slot-actions`, `slot-leading`
5. **Incluir contenido default** cuando el uso más común es predecible
6. **Dejar vacío** cuando el contenido es siempre único
7. **Min width/height** para que el slot no colapse a 0 cuando está vacío

### Código para crear frame slot-ready:

```javascript
// ✅ Crear frame preparado para convertir a slot — timeout: 15000
const parent = await figma.getNodeByIdAsync("COMPONENT_ID");
const slotFrame = figma.createFrame();
slotFrame.name = "slot-body";
slotFrame.layoutMode = "VERTICAL";
slotFrame.primaryAxisAlignItems = "MIN";
slotFrame.counterAxisAlignItems = "MIN";
slotFrame.primaryAxisSizingMode = "AUTO"; // hug
slotFrame.counterAxisSizingMode = "FILL"; // fill container
slotFrame.itemSpacing = 8;
slotFrame.fills = []; // transparente
slotFrame.clipsContent = true;
slotFrame.minWidth = 100;
slotFrame.minHeight = 40;
parent.appendChild(slotFrame);

return { id: slotFrame.id, name: slotFrame.name };
// El diseñador luego hace: click derecho → "Convert to slot"
```

### Lo que NO hacer:
- No intentar `addComponentProperty("slot", "SLOT", ...)` — no existe en la API
- No intentar `instance.setProperties()` con slot properties — lanza error
- No crear slots en el top-level del componente — solo en frames anidados
- No crear un slot para cada pequeña variación — los slots son para contenido variable, no para estados

---

## Cómo documentar slots en el handoff

Cuando `prepare-handoff` encuentra componentes con slots, documentar:

```
## Button Card
Props de código:
- size: "sm" | "md" | "lg" (variante)
- disabled: boolean (prop BOOLEAN)
- children: ReactNode (SLOT → slot-body)
- actions: ReactNode (SLOT → slot-actions)

Ejemplo React:
<ButtonCard size="md">
  <p>Custom content here</p>
  <ButtonCard.Actions>
    <Button>Cancel</Button>
    <Button variant="primary">Confirm</Button>
  </ButtonCard.Actions>
</ButtonCard>
```

## Ejemplos de uso
- "Crea un componente Card con slots para body y actions"
- "¿Cómo debería estructurar mi Modal para usar slots?"
- "Dame el patrón de slots para un List Item con leading y trailing"
- "Estructura un FormSection con slot para campos dinámicos"
