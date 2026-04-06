# audit-quality

Skill para auditar la calidad de diseños en Figma: detecta drift del sistema de diseño, problemas de accesibilidad WCAG, nomenclatura incorrecta y valores hardcodeados.

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Cuando usar este skill
- Cuando se quiere verificar la consistencia del diseño con el DS
- Antes de un handoff importante
- Para auditar archivos de diseño heredados o de terceros
- Para detectar deuda técnica de diseño

## Parámetros disponibles
- `alcance`: página-actual · sección · componente · archivo-completo (default: página-actual)
- `tipo`: todo · design-system · accesibilidad · nomenclatura (default: todo)

## Pasos de ejecución

### Paso 1 — Configurar alcance
Preguntar al usuario qué quiere auditar y con qué profundidad.
Si el archivo es grande, recomendar empezar por página-actual.

### Paso 2 — Auditoría del sistema de diseño
```
- figma_get_variables → cargar todas las variables disponibles
- figma_get_design_system_summary → componentes disponibles
- figma_execute → escanear en busca de:
  - Colores hardcodeados con variable equivalente disponible
  - Componentes desconectados (detached) del DS
  - Fuentes no conectadas al sistema tipográfico
  - Espaciados que no usan variables
- Clasificar findings por severidad: crítico / advertencia / info
```

### Paso 3 — Auditoría de accesibilidad WCAG
```
- figma_lint_design con reglas ['wcag'] → detectar:
  - Contraste de color insuficiente (AA: 4.5:1 texto normal, 3:1 texto grande)
  - Textos menores a 12px
  - Touch targets menores a 44x44px en mobile
  - Falta de estados de focus visibles
  - Jerarquía de encabezados incorrecta
```

### Paso 4 — Auditoría de nomenclatura
```
- figma_get_file_data → árbol de capas
- Detectar:
  - Capas con nombres por defecto (Frame N, Rectangle N, Group N)
  - Capas sin nombre descriptivo
  - Inconsistencias en la convención de nombres del equipo
- Cuantificar: X de Y capas tienen nombres incorrectos
```

### Paso 5 — Auditoría de oportunidades de slots

> ⚠️ Requiere Figma Desktop con slots en open beta habilitado.

```
- figma_execute (timeout: 20000) → escanear componentes:
  - Componentes con >8 variantes donde variantes solo difieren en contenido → candidato a slots
  - Componentes con props INSTANCE_SWAP → posible reemplazo por slot nativo
  - Componentes que ya tienen slots (node.type === "SLOT") → verificar preferred instances
  - Componentes con muchas capas ocultas para simular flexibilidad → slots los eliminan
- Clasificar: "Migrar a slots" / "Ya usa slots" / "No aplica"
- Nota: La Plugin API puede DETECTAR slots pero NO crearlos. Usar skill migrate-to-slots para preparar la migración.
```

### Paso 6 — Generar reporte

Estructura del reporte:
```
## Resumen de auditoría
- Fecha: [fecha]
- Alcance: [página/sección auditada]
- Puntuación general: [X/100]

## Sistema de diseño
- Componentes desconectados: X
- Colores hardcodeados: X
- Fuentes fuera del DS: X

## Accesibilidad
- Críticos (bloquean): X issues
- Advertencias (mejoras): X issues
- Detalles por issue con nodeId y descripción

## Nomenclatura
- Capas con nombres incorrectos: X de Y total
- Lista de capas a renombrar

## Oportunidades de slots
- Componentes candidatos a migrar: X
- Componentes que ya usan slots: X
- Variantes que se podrían eliminar post-migración: X

## Recomendaciones
Lista priorizada de qué corregir primero.
```

### Paso 7 — Preguntar si corregir automáticamente
Para cada categoría de issues, preguntar al usuario si quiere que se corrijan automáticamente los que se puedan resolver sin ambigüedad.

## Ejemplos de uso
- "Audita la calidad de la página actual"
- "Revisa si mi diseño cumple WCAG AA"
- "Encuentra todos los colores hardcodeados de este archivo"
- "¿Qué componentes están desconectados del sistema de diseño?"
