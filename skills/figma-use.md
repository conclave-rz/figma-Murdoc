# figma-use

Skill base para trabajar en el canvas de Figma.

## Principios de trabajo

1. Lee antes de escribir — llama figma_get_variables y figma_search_components primero. Nunca inventes valores.
2. Usa el sistema de diseño — aplica siempre variables del archivo activo.
3. Nombra capas con criterio — Frames: [Flujo]/[Número] - [Nombre]. Grupos: minúsculas.
4. Organiza en el canvas — frames izquierda a derecha, 80px separación, agrupados en sección.
5. Auto Layout primero — nunca posiciones absolutas en layouts.
6. Itera con capturas — screenshot después de cada frame antes de continuar.
7. Comunica lo que haces — explica cada acción antes de ejecutarla.

## Frame mobile
- 375x812px
- Padding: 24px horizontal, 48px top, 32px bottom
- Safe area top: 44px, bottom: 34px

## Frame desktop
- 1440x900px
- Max-width contenido: 1200px centrado

---

## ⚠️ Reglas críticas para figma_execute

### 1. APIs Async obligatorias (Figma Plugin API moderna)

Las siguientes APIs son **async** y DEBEN usarse con `await`. Las versiones sync están deprecadas y **fallan silenciosamente** o lanzan errores:

```javascript
// ❌ INCORRECTO — sync, deprecado, FALLA
figma.currentPage = somePage;
const node = figma.getNodeById("123:456");

// ✅ CORRECTO — async, obligatorio
await figma.setCurrentPageAsync(somePage);
const node = await figma.getNodeByIdAsync("123:456");
```

**Lista completa de APIs async obligatorias:**

| Deprecado (NO usar)         | Correcto (SIEMPRE usar)                  |
|------------------------------|------------------------------------------|
| `figma.currentPage = x`     | `await figma.setCurrentPageAsync(x)`     |
| `figma.getNodeById(id)`     | `await figma.getNodeByIdAsync(id)`       |
| `figma.root.children` (set) | `await figma.setCurrentPageAsync(page)`  |
| `node.exportAsync()` (sin await) | `await node.exportAsync(settings)`  |
| `figma.loadFontAsync()` (sin await) | `await figma.loadFontAsync({family, style})` |

**Regla:** Si el método termina en `Async` o devuelve una `Promise`, SIEMPRE usa `await`.

### 2. Sintaxis correcta de Effects

Los effects en Figma tienen una estructura específica. Los errores más comunes:

```javascript
// ❌ INCORRECTO — blendMode NO existe en effects, spread NO existe en DROP_SHADOW
node.effects = [{
  type: "DROP_SHADOW",
  color: { r: 0, g: 0, b: 0, a: 0.25 },
  offset: { x: 0, y: 4 },
  radius: 8,
  spread: 0,           // ← NO EXISTE en DROP_SHADOW
  blendMode: "NORMAL", // ← NO ES propiedad de effects
  visible: true
}];

// ✅ CORRECTO — estructura válida de DROP_SHADOW
node.effects = [{
  type: "DROP_SHADOW",
  color: { r: 0, g: 0, b: 0, a: 0.25 },
  offset: { x: 0, y: 4 },
  radius: 8,
  visible: true
}];
```

**Propiedades válidas por tipo de effect:**

| Tipo               | Propiedades válidas                                         |
|--------------------|------------------------------------------------------------|
| `DROP_SHADOW`      | `type`, `color`, `offset`, `radius`, `visible`             |
| `INNER_SHADOW`     | `type`, `color`, `offset`, `radius`, `visible`             |
| `LAYER_BLUR`       | `type`, `radius`, `visible`                                |
| `BACKGROUND_BLUR`  | `type`, `radius`, `visible`                                |

**`spread` SOLO existe en la REST API v1**, no en la Plugin API. No lo uses en `figma_execute`.

**`blendMode`** es una propiedad del **nodo**, no del effect:
```javascript
// ✅ blendMode va en el nodo, no en el effect
node.blendMode = "NORMAL"; // o "MULTIPLY", "SCREEN", etc.
```

### 3. Timeout: usa tiempos adecuados

El timeout por defecto de `figma_execute` es **5000ms (5s)**, que es insuficiente para operaciones complejas.

**Guía de timeouts:**

| Operación                              | Timeout recomendado |
|----------------------------------------|---------------------|
| Leer/modificar un nodo simple          | `5000` (default)    |
| Crear 2-5 nodos con propiedades        | `10000`             |
| Crear frame complejo con hijos         | `15000`             |
| Cargar fuentes + crear textos          | `15000`             |
| Operaciones con exportAsync            | `20000`             |
| Crear múltiples frames/pantallas       | `25000`             |
| Operaciones masivas (>10 nodos)        | `30000` (máximo)    |

**Siempre especifica timeout explícitamente** cuando la operación involucra:
- `loadFontAsync` (carga de fuentes)
- `exportAsync` (exportar imágenes)
- Creación de múltiples nodos
- Iteración sobre hijos de un componente
- Cualquier bucle

```javascript
// ✅ Ejemplo con timeout adecuado
// En la llamada: timeout: 15000
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
const text = figma.createText();
text.characters = "Hello World";
```

### 4. Código compacto: evita el límite de respuesta

Las respuestas del plugin tienen un límite de tamaño. Para evitar truncamiento:

**Reglas para código en figma_execute:**
- Devuelve SOLO los datos necesarios — no devuelvas nodos enteros, solo `{ id, name }`.
- Usa nombres de variables cortos en código largo.
- No incluyas comentarios largos dentro del código.
- Si necesitas crear muchos nodos, divide en múltiples llamadas.
- Filtra propiedades al devolver resultados: `return { id: node.id, name: node.name }` en vez de `return node`.

```javascript
// ❌ INCORRECTO — devuelve demasiados datos
const nodes = figma.currentPage.findAll();
return nodes; // Puede exceder el límite

// ✅ CORRECTO — devuelve solo lo necesario
const nodes = figma.currentPage.findAll();
return nodes.map(n => ({ id: n.id, name: n.name, type: n.type }));
```

**Si una operación es demasiado grande para una sola llamada**, divídela:
1. Primera llamada: crear la estructura (frames, secciones)
2. Segunda llamada: agregar contenido (textos, fills)
3. Tercera llamada: aplicar estilos y effects

---

## Limitaciones conocidas (requieren configuración externa)

### Variables REST API (Problema conocido)
`figma_get_variables` usa la REST API que requiere un plan Enterprise/Organization de Figma Y un `FIGMA_ACCESS_TOKEN` configurado en el servidor MCP. Si devuelve vacío:
- Usa `figma_execute` con `figma.variables.getLocalVariablesAsync()` como alternativa vía Plugin API.
- O pide al usuario que configure el token.

### Comentarios vía REST API
`figma_get_comments` y `figma_post_comment` requieren `FIGMA_ACCESS_TOKEN`. Sin él, fallarán. Informa al usuario si no funcionan.

### Anotaciones
`figma_get_annotations` y `figma_set_annotations` dependen del Desktop Bridge plugin. Si no están disponibles, usa `figma_execute` para escribir metadata en `node.setPluginData()` como alternativa.

---

## Errores a evitar

- No hardcodear colores si existe variable
- No usar fuentes fuera del archivo
- No crear componentes si ya existen en el sistema de diseño
- No dejar capas sin nombre
- **No usar APIs sync cuando existe versión async**
- **No poner `spread` ni `blendMode` dentro de effects**
- **No dejar timeout en 5000 para operaciones complejas**
- **No devolver objetos completos de nodos — solo los campos necesarios**
