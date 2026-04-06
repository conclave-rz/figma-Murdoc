# figma-murdoc

Servidor MCP de diseño para equipos. Conecta Claude con Figma Desktop para generar pantallas, documentar componentes, preparar handoffs y auditar sistemas de diseño.

## Qué es este servidor

Figma Murdoc expone herramientas del canvas de Figma a través del protocolo MCP. Funciona exclusivamente con **Figma Desktop** y el plugin **Figma Desktop Bridge** activo. Sin el plugin abierto, ninguna operación de escritura es posible.

No adivines valores. No inventes componentes. No uses colores hardcodeados. Todo lo que generes debe provenir del sistema de diseño del archivo activo.

---

## Requisitos antes de ejecutar cualquier tarea

Antes de responder cualquier petición relacionada con Figma, verifica estos tres puntos en orden:

1. **Plugin activo** — llama a `figma_get_status`. Si no hay conexión WebSocket, detente y pide al usuario que abra el plugin en Figma Desktop.

2. **Archivo correcto** — confirma con el usuario qué archivo debe estar activo. Llama a `figma_list_open_files` si hay dudas.

3. **Sistema de diseño cargado** — antes de crear cualquier elemento visual, llama siempre a:
   - `figma_get_variables` → colores, tipografías, espaciados, radios
   - `figma_search_components` → botones, inputs, cards, navegación, iconos

---

## Flujo de trabajo estándar

Cada tarea sigue este ciclo:

1. VERIFICAR   → estado del plugin y archivo activo
2. LEER        → variables y componentes disponibles
3. PLANIFICAR  → describir al usuario qué se va a crear antes de hacerlo
4. EJECUTAR    → crear en Figma usando el sistema de diseño
5. VERIFICAR   → screenshot del resultado (figma_capture_screenshot)
6. ITERAR      → corregir si hay problemas (máximo 3 iteraciones)
7. REPORTAR    → resumen de lo creado al usuario

Nunca saltes el paso 2. Nunca saltes el paso 5.

---

## Reglas de diseño obligatorias

### Frames
- Mobile: 375x812px, padding 24px horizontal / 48px top / 32px bottom
- Safe area top: 44px · Safe area bottom: 34px
- Desktop: 1440x900px, max-width contenido 1200px centrado

### Nomenclatura de capas
- Frames de flujo: [Flujo]/[Número] - [Nombre] → Onboarding/01 - Bienvenida
- Grupos funcionales: minúsculas → header, cta-section, form-fields
- Nunca dejar capas con nombres por defecto: "Frame 1", "Rectangle 2", "Group 5"

### Organización en el canvas
- Siempre crear frames dentro de una Section con el nombre del flujo
- Frames de izquierda a derecha con 80px de separación
- Nunca elementos flotando sin contenedor

### Variables y tokens
- Usar siempre las variables del archivo. Nunca hardcodear colores, fuentes, espaciados, radios
- Verificar con figma_get_variables antes de asignar cualquier valor

### Auto Layout
- Usar Auto Layout en todos los frames y contenedores
- Nunca posicionar con coordenadas absolutas dentro de un layout

### Componentes
- Buscar siempre antes de crear con figma_search_components
- Si falta un componente, crear versión temporal prefijada con _temp/ y notificar

---

## Skills disponibles

Llama a list_skills para ver los disponibles. Usa use_skill para cargar uno.

| Quiero... | Skill |
|---|---|
| Generar pantallas de un flujo | generate-screen |
| Documentar un componente o flujo | generate-documentation |
| Preparar diseños para desarrollo | prepare-handoff |
| Detectar problemas de calidad | audit-quality |
| Exportar variables a CSS/Tailwind | sync-tokens |
| Conectar diseños al sistema de diseño | apply-design-system |
| Migrar componentes a slots nativos | migrate-to-slots |
| Patrones de composición con slots | slot-patterns |

---

## Errores comunes — no los cometas

- Crear colores sin verificar variables → llamar figma_get_variables primero
- Crear componentes desde cero → buscar con figma_search_components primero
- Dejar capas sin nombre → siempre nombrar con la convención del equipo
- No verificar el resultado → siempre figma_capture_screenshot después de crear
- Continuar tras error de conexión → detener y pedir verificar el plugin
- Cambios destructivos sin confirmar → siempre pedir confirmación antes de borrar

---


---

## Reglas críticas de la Plugin API

Estas reglas vienen de errores encontrados en producción. Aplícalas siempre.

### APIs async obligatorias
Nunca uses las versiones síncronas — fallan en modo dynamic-page:

- NUNCA: `figma.currentPage = page` → SIEMPRE: `await figma.setCurrentPageAsync(page)`
- NUNCA: `figma.getNodeById(id)` → SIEMPRE: `await figma.getNodeByIdAsync(id)`
- SIEMPRE: `await figma.loadFontAsync({family, style})` antes de asignar `.characters`
- SIEMPRE: `await node.exportAsync(settings)` — nunca sin await

### Effects — estructura correcta
`spread` y `blendMode` **NO son propiedades válidas** de effects en la Plugin API. Usarlos causa errores silenciosos:
```javascript
// ❌ INCORRECTO — spread y blendMode NO existen en effects
node.effects = [{
  type: 'DROP_SHADOW',
  color: { r: 0, g: 0, b: 0, a: 0.1 },
  offset: { x: 0, y: 4 },
  radius: 8,
  spread: 0,           // ← NO EXISTE en Plugin API
  blendMode: 'NORMAL', // ← Es propiedad del NODO, no del effect
  visible: true
}]

// ✅ CORRECTO — solo propiedades válidas
node.effects = [{
  type: 'DROP_SHADOW',
  color: { r: 0, g: 0, b: 0, a: 0.1 },
  offset: { x: 0, y: 4 },
  radius: 8,
  visible: true
}]

// blendMode va en el nodo, no en el effect
node.blendMode = 'NORMAL'
```

Propiedades válidas por tipo de effect:
- `DROP_SHADOW` / `INNER_SHADOW`: type, color, offset, radius, visible
- `LAYER_BLUR` / `BACKGROUND_BLUR`: type, radius, visible

`spread` solo existe en la REST API v1, no en la Plugin API.

Si no estás seguro, usa stroke como alternativa visual:
```javascript
node.strokes = [{ type: 'SOLID', color: { r: 0.89, g: 0.89, b: 0.898 }, opacity: 1 }]
node.strokeWeight = 1
```

### Batching de tokens — límite 100 por llamada
figma_setup_design_tokens acepta máximo 100 tokens por operación.
Si el DS tiene más, divide en múltiples llamadas por categoría:
- Llamada 1: colores
- Llamada 2: tipografía
- Llamada 3: espaciado + radios + sombras

### Código compacto — evita truncamiento de respuesta
Las respuestas del plugin tienen un límite de tamaño. Para evitar truncamiento:
- Devuelve SOLO los datos necesarios: `return { id: node.id, name: node.name }` — nunca devuelvas nodos enteros
- Si necesitas crear muchos nodos, divide en múltiples llamadas a figma_execute
- No incluyas comentarios largos dentro del código
- Filtra propiedades al devolver resultados de búsqueda:
  ```javascript
  // ❌ return figma.currentPage.findAll()
  // ✅ return figma.currentPage.findAll().map(n => ({ id: n.id, name: n.name, type: n.type }))
  ```
- Si un escaneo devuelve muchos resultados, limita: `return findings.slice(0, 30)`

### Timeout de figma_execute
El default de 5000ms es insuficiente para operaciones complejas.

| Operación | Timeout |
|---|---|
| 1-5 nodos simples | 5000ms |
| Frame con auto layout | 10000ms |
| Pantalla completa (10-20 nodos) | 20000ms |
| Flujo completo múltiples pantallas | 25000ms |
| Sistema de tokens completo | 30000ms |

Siempre especifica el timeout explícitamente en operaciones complejas.

## Limitaciones conocidas

- Solo funciona con Figma Desktop, no con Figma en el navegador
- Los nodeIds son específicos de cada sesión — no reutilices IDs de conversaciones anteriores
- Los cambios son reversibles con Cmd+Z en Figma, pero no desde el servidor MCP

### Variables REST API vacía
`figma_get_variables` usa la REST API que requiere plan Enterprise/Organization Y un `FIGMA_ACCESS_TOKEN` configurado.
Si devuelve vacío, usar como alternativa la Plugin API:
```javascript
// En figma_execute con timeout: 15000
const vars = await figma.variables.getLocalVariablesAsync();
return vars.map(v => ({ id: v.id, name: v.name, resolvedType: v.resolvedType }));
```

### Comentarios sin token
`figma_get_comments` y `figma_post_comment` requieren `FIGMA_ACCESS_TOKEN`. Sin él fallarán.
Si no están disponibles, generar el resumen como texto en la conversación.

### Anotaciones
`figma_get_annotations` y `figma_set_annotations` dependen del Desktop Bridge plugin.
Si no funcionan, usar `node.setPluginData(key, value)` en `figma_execute` como alternativa.

### Slots nativos (open beta)
Los slots son un nuevo tipo de component property que permite áreas flexibles dentro de componentes.

**Estado de la Plugin API:**
- `SlotNode` existe como tipo de nodo → se pueden **detectar y leer** slots existentes
- `ComponentPropertyType` solo tiene `BOOLEAN | TEXT | INSTANCE_SWAP | VARIANT` → **NO se pueden crear** slots programáticamente
- `setProperties()` en instancias lanza `cannotSetSlotProperty` → **NO se puede modificar** contenido de slots via API

**Lo que Murdoc puede hacer con slots:**
- Auditar qué componentes son candidatos a slots (skill: `migrate-to-slots`)
- Detectar slots existentes en componentes (`node.type === "SLOT"`)
- Preparar la estructura del componente (crear frame con Auto Layout, nombrar `slot-*`)
- Documentar slots en el handoff con mapeo a código (React children, Vue slot, etc.)
- Aplicar patrones de composición con slots (skill: `slot-patterns`)

**Lo que requiere acción manual del diseñador:**
- Convertir un frame a slot: click derecho → "Convert to slot" (⌘⇧S)
- Configurar preferred instances en el slot
- Insertar contenido en slots de instancias

Cuando Figma agregue `SLOT` a `ComponentPropertyType` y a `addComponentProperty`, Murdoc podrá crear slots completamente de forma programática.
