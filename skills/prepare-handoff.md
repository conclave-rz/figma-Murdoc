# prepare-handoff

Skill para preparar diseños de Figma para entrega al equipo de desarrollo. Verifica calidad, añade anotaciones, nombra capas correctamente y marca frames como "Ready for dev".

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Cuando usar este skill
- Cuando el diseño está listo y se va a entregar a desarrollo
- Cuando se quiere verificar la calidad antes del handoff
- Cuando hay que añadir contexto técnico al diseño

## Pasos de ejecución

### Paso 1 — Identificar qué preparar
Preguntar al usuario qué frames o secciones va a entregar.
Obtener los nodeIds correspondientes.

### Paso 2 — Auditoría de nomenclatura
```
- figma_get_file_data → obtener árbol de capas
- Detectar capas con nombres por defecto: "Frame N", "Rectangle N", "Group N", "Layer N"
- Renombrar automáticamente con figma_rename_node usando nombres semánticos
- Reportar al usuario qué capas se renombraron
```

### Paso 3 — Verificación de tokens

> **⚠️ REGLAS OBLIGATORIAS para figma_execute en este paso:**
>
> **Async:** Siempre usar `await figma.getNodeByIdAsync(id)`. NUNCA `figma.getNodeById(id)`.
>
> **Timeout:** Escanear un árbol de nodos es costoso. Usar `timeout: 20000` mínimo. Si el frame tiene muchos hijos (>50 nodos), usar `timeout: 30000`.
>
> **Código compacto:** Al escanear nodos, devolver solo los hallazgos relevantes, NO el árbol completo. Ejemplo: `return findings` donde `findings` es un array de `{ nodeId, nodeName, issue, value }`.
>
> **Dividir escaneos:** Si hay múltiples frames a escanear, hacer UNA llamada por frame. No intentar escanear todo el archivo en una sola llamada.

```
- figma_get_variables → cargar todas las variables disponibles
  (Si devuelve vacío, puede ser porque falta FIGMA_ACCESS_TOKEN
   o el plan no es Enterprise. Usar como alternativa:
   figma_execute con figma.variables.getLocalVariablesAsync()
   con timeout: 15000)
- figma_execute (timeout: 20000) → escanear los frames seleccionados:
  - Colores hardcodeados que tengan variable equivalente
  - Fuentes no conectadas al sistema de diseño
  - Espaciados hardcodeados con variable equivalente
- Reportar lista de valores hardcodeados encontrados
- Preguntar al usuario si quiere corregirlos automáticamente
```

**Patrón correcto para escaneo de tokens:**
```javascript
// ✅ Correcto — timeout: 20000, async, resultado compacto
const frame = await figma.getNodeByIdAsync("FRAME_ID");
const findings = [];

function scan(node) {
  // Verificar fills hardcodeados
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && !node.boundVariables?.fills) {
      findings.push({
        id: node.id,
        name: node.name,
        issue: "hardcoded-fill",
        value: `rgb(${Math.round(fill.color.r*255)},${Math.round(fill.color.g*255)},${Math.round(fill.color.b*255)})`
      });
    }
  }
  // Recorrer hijos
  if ("children" in node) {
    for (const child of node.children) scan(child);
  }
}

scan(frame);
return { total: findings.length, findings: findings.slice(0, 30) };
// ↑ Limitar a 30 para no exceder el tamaño de respuesta
```

### Paso 4 — Añadir anotaciones clave

> **⚠️ Limitación conocida:** `figma_set_annotations` depende del Desktop Bridge plugin.
> Si no funciona, usar como alternativa `figma_execute` con `node.setPluginData(key, value)`
> para guardar metadata en los nodos (timeout: 10000).

Para cada frame a entregar, añadir anotaciones en elementos críticos:
```
- figma_set_annotations → añadir notas en:
  - Interacciones no obvias (gestos, transiciones)
  - Comportamientos responsivos
  - Contenido dinámico o condicional
  - Restricciones de accesibilidad importantes
```

### Paso 5 — Verificación de accesibilidad básica
```
- figma_lint_design con reglas ['wcag'] → detectar:
  - Contraste insuficiente
  - Textos menores a 12px
  - Touch targets menores a 44x44px
- Reportar findings al usuario con severidad
```

### Paso 5.5 — Mapeo de slots a código

> Si los componentes del handoff tienen slots nativos, documentar el mapeo a código.

```
- figma_execute (timeout: 15000) → para cada componente en el handoff:
  - Detectar nodos con type === "SLOT"
  - Leer componentPropertyDefinitions para props de tipo slot
  - Generar mapeo:
    - SLOT → children (React) / <slot> (Vue) / ng-content (Angular)
    - Slots nombrados → named slots / named children props
  - Documentar preferred instances como "componentes recomendados" en el handoff
```

**Ejemplo de documentación generada:**
```
## Card Component — Slot Mapping

| Slot Figma | Prop código | Tipo |
|---|---|---|
| slot-body | children | ReactNode |
| slot-actions | actions | ReactNode |

Preferred instances para slot-body: ImageBlock, StatsRow, DescriptionText
```

### Paso 6 — Generar resumen de handoff

> **⚠️ Limitación conocida:** `figma_post_comment` requiere `FIGMA_ACCESS_TOKEN` configurado
> en el servidor MCP. Si falla, generar el resumen como texto en la conversación y ofrecer
> al usuario que lo pegue manualmente como comentario en Figma.

Crear un comentario en Figma con el resumen:
```
- figma_post_comment → añadir nota con:
  - Fecha de handoff
  - Lista de frames incluidos
  - Componentes usados del DS
  - Tokens aplicados
  - Issues de accesibilidad pendientes (si los hay)
  - Notas especiales del diseñador
```

### Paso 7 — Captura final
```
- figma_capture_screenshot de cada frame preparado (timeout: 20000 si es frame complejo)
- Confirmar al usuario que el handoff está listo
```

## Resumen que entrega al usuario
Al terminar, generar un documento con:
- Frames listos para desarrollo
- Lista de componentes usados
- Tokens aplicados por frame
- Issues encontrados y si se corrigieron
- Enlace al archivo de Figma

## Ejemplos de uso
- "Prepara el flujo de onboarding para entregarlo a los devs"
- "Haz el handoff de las pantallas de checkout"
- "Verifica y prepara todos los frames de la sección de perfil"
