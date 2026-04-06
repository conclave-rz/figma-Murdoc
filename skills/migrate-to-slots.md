# migrate-to-slots

Skill para auditar una librería de componentes y prepararlos para migrar a slots nativos de Figma. Detecta candidatos, reestructura la jerarquía, y deja el componente listo para que el diseñador haga "Convert to slot" con un click.

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Contexto: Qué son los slots

Los slots son un tipo de component property (open beta desde marzo 2026) que permiten agregar áreas flexibles dentro de componentes donde los diseñadores pueden insertar y reorganizar contenido sin detachar la instancia.

### Estado de la Plugin API

| Operación | Soportado |
|---|---|
| Detectar slots existentes (`node.type === "SLOT"`) | ✅ |
| Leer slot properties en `componentPropertyDefinitions` | ✅ |
| Recorrer hijos dentro de un slot | ✅ |
| **Crear un slot programáticamente** | ❌ No soportado aún |
| **Modificar contenido de slot en instancia** (`setProperties`) | ❌ Lanza `cannotSetSlotProperty` |

**Implicación:** Murdoc puede auditar, reestructurar y preparar — el paso final de "Convert to slot" lo hace el diseñador manualmente.

## Cuando usar este skill
- Cuando el equipo quiere migrar su librería a slots nativos
- Cuando hay componentes con muchas variantes que podrían simplificarse
- Cuando hay muchos detachments y se quiere reducirlos
- Cuando se prepara la librería para escalar

## Pasos de ejecución

### Paso 1 — Auditoría de candidatos a slots

> ⚠️ Usar `timeout: 20000` para escaneos. Devolver solo datos relevantes.

```
- figma_search_components → obtener todos los componentes de la librería
- figma_execute → para cada componente/component set:
  - Contar número de variantes
  - Detectar props INSTANCE_SWAP (candidatos naturales a slots)
  - Detectar componentes con hijos que cambian entre variantes
  - Detectar componentes que se detachan frecuentemente (si hay detachedInfo disponible)
```

**Criterios de priorización** (de mayor a menor impacto):
1. **Componentes con >8 variantes** donde las variantes solo difieren en contenido → candidato fuerte
2. **Componentes con props INSTANCE_SWAP** → el swap se puede reemplazar por un slot
3. **Cards, modals, list items, navs** → patrones clásicos de contenido variable
4. **Componentes con capas ocultas** usadas para simular flexibilidad → slots eliminan esa necesidad

### Paso 2 — Generar reporte de candidatos

Presentar al usuario:
```
## Candidatos a migración de slots

### Prioridad Alta (simplificación inmediata)
- [ComponentName] — X variantes, Y props INSTANCE_SWAP
  Razón: Las variantes solo difieren en contenido del body
  Ahorro estimado: Se reduce de X a 2-3 variantes

### Prioridad Media (mejora de flexibilidad)  
- [ComponentName] — Contenido fijo que los diseñadores detachan
  Razón: El frame interior podría ser un slot

### Prioridad Baja (ya funciona bien)
- [ComponentName] — Pocas variantes, bien estructurado
```

Preguntar al usuario cuáles quiere migrar.

### Paso 3 — Reestructurar componente para slots

Para cada componente seleccionado:

```
- figma_execute (timeout: 15000) → por cada componente:
  1. Identificar el frame/grupo que contendrá el slot
  2. Si no existe un frame contenedor claro:
     - Crear un frame con Auto Layout dentro del componente
     - Mover los hijos que serán contenido variable al nuevo frame
     - Nombrar el frame: "slot-[propósito]" (ej: "slot-content", "slot-actions")
  3. Asegurar que el frame tiene Auto Layout configurado
  4. Asegurar que el frame tiene dimensiones apropiadas (fill/hug)
  5. Devolver: { componentId, componentName, slotFrameId, slotFrameName }
```

> ⚠️ NO intentar crear el slot property — la Plugin API no lo soporta.
> Solo preparar la estructura para que el diseñador haga "Convert to slot".

### Paso 4 — Limpiar variantes redundantes

Si el componente tenía variantes que solo diferían en contenido:
```
- Identificar variantes que se pueden eliminar post-migración
- NO eliminar automáticamente — reportar al usuario cuáles sobran
- El usuario decide qué variantes mantener después de probar los slots
```

### Paso 5 — Documentar instrucciones de finalización

Para cada componente preparado, generar instrucciones:
```
## [ComponentName] — Listo para slots

### Lo que hizo Murdoc:
- ✅ Creó frame contenedor "slot-content" con Auto Layout
- ✅ Reorganizó hijos dentro del frame
- ✅ Configuró dimensiones (fill container)

### Lo que falta (manual, 1 click):
1. Selecciona el frame "slot-content" dentro del componente
2. Click derecho → "Convert to slot" (o ⌘⇧S)
3. Opcional: Configura "Preferred instances" para guiar a los diseñadores

### Variantes que podrían eliminarse después:
- Variant "Content=Image" → ya no necesaria con slot
- Variant "Content=List" → ya no necesaria con slot
```

### Paso 6 — Verificar componentes que ya tienen slots

Si el archivo ya tiene componentes con slots:
```
- figma_execute → buscar nodos con type === "SLOT"
- Reportar cuáles ya tienen slots nativos
- Verificar que los slots tienen preferred instances configuradas
```

## Patrón de código para detectar candidatos

```javascript
// ✅ timeout: 20000, devolver solo lo necesario
const components = figma.currentPage.findAll(n => 
  n.type === 'COMPONENT' || n.type === 'COMPONENT_SET'
);

const candidates = components.map(c => {
  const props = c.componentPropertyDefinitions || {};
  const propTypes = Object.entries(props).map(([name, def]) => ({
    name, type: def.type
  }));
  const instanceSwaps = propTypes.filter(p => p.type === 'INSTANCE_SWAP');
  const variantCount = c.type === 'COMPONENT_SET' ? c.children.length : 0;
  const hasSlots = c.findAll ? c.findAll(n => n.type === 'SLOT').length : 0;
  
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    variantCount,
    instanceSwapCount: instanceSwaps.length,
    existingSlots: hasSlots,
    score: variantCount * 2 + instanceSwaps.length * 3 + (hasSlots > 0 ? -10 : 0)
  };
}).filter(c => c.score > 5)
  .sort((a, b) => b.score - a.score)
  .slice(0, 20);

return candidates;
```

## Ejemplos de uso
- "Audita mi librería para ver qué componentes deberían usar slots"
- "Prepara el componente Card para migrar a slots"
- "¿Cuáles componentes se detachan más y podrían beneficiarse de slots?"
- "Reestructura el Modal para que pueda usar slots"
