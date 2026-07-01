# sync-tokens

Skill para sincronizar tokens entre Figma y el codebase, en **ambas direcciones**. Exporta las variables de Figma como CSS custom properties, Tailwind config, JSON, Sass o **DTCG (W3C)**; e importa DTCG (`design.tokens.json`) creando variables en Figma. Mantiene sincronizados el sistema de diseño y el código.

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Cuando usar este skill
- Cuando development necesita los tokens actualizados del DS (export)
- Cuando hay cambios en variables de Figma que deben reflejarse en código (export)
- Cuando el contrato del Pilar 0 (`design.tokens.json` DTCG) debe entrar a Figma (import)
- Para hacer el setup inicial de tokens en un proyecto nuevo
- Para detectar drift entre los tokens de Figma y los del codebase
- Para hacer round-trip DTCG: código → Figma → código sin pérdida

## Dirección
- `export` (default): Figma → código
- `import`: código (DTCG) → Figma

## Parámetros disponibles
- `direccion`: export · import (default: export)
- `formato`: css · tailwind · json · sass · **dtcg** (default: css) — aplica a export
- `archivo`: ruta del `design.tokens.json` a importar (default: `docs/contract-reference/tokens/design.tokens.json`) — aplica a import
- `colecciones`: todas · [nombre-específico] (default: todas)
- `modo`: light · dark · todos (default: todos)

## Pasos de ejecución

### Paso 1 — Leer todas las variables
```
- figma_get_variables con format='full' → obtener todas las colecciones, modos y valores
- Mostrar al usuario un resumen: X variables en Y colecciones con Z modos
- Confirmar qué colecciones y modos exportar
```

### Paso 2 — Transformar según formato

#### CSS custom properties
```css
:root {
  /* Colores - modo light */
  --color-primary: #007AFF;
  --color-primary-hover: #0056CC;

  /* Tipografía */
  --font-size-base: 16px;
  --font-size-lg: 20px;

  /* Espaciado */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
}

[data-theme="dark"] {
  --color-primary: #4DA3FF;
}
```

#### Tailwind config
```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
      },
      fontSize: {
        base: 'var(--font-size-base)',
      },
      spacing: {
        xs: 'var(--spacing-xs)',
      }
    }
  }
}
```

#### JSON (W3C Design Tokens format)
```json
{
  "color": {
    "primary": { "$value": "#007AFF", "$type": "color" },
    "primary-hover": { "$value": "#0056CC", "$type": "color" }
  },
  "fontSize": {
    "base": { "$value": "16px", "$type": "dimension" }
  }
}
```

#### Sass variables
```scss
// Colores
$color-primary: #007AFF;
$color-primary-hover: #0056CC;

// Tipografía
$font-size-base: 16px;
```

#### DTCG (W3C Design Tokens 2025.10) — formato del contrato del Pilar 0
Export fiel al estándar que consume el Pilar 0. Reglas:
- Estructura en tres niveles si las colecciones de Figma lo permiten: `primitive` → `semantic` → `component`. Si el archivo tiene colecciones `Contract / Primitive|Semantic|Component` (creadas por `apply-contract`), mapéalas 1:1 a esos niveles.
- **Dimensiones como objeto** `{ "value": 16, "unit": "px" }`, nunca `"16px"`.
- **Alias de variable de Figma → referencia DTCG** `{ruta.con.puntos}`. Ej: una var `color/bg/base` que aliasa a `color/neutral/0` de la colección Primitive se exporta como `"$value": "{primitive.color.neutral.0}"`.
- `$type` por token (`color`, `dimension`, `fontFamily`, `fontWeight`), heredable por grupo.
```json
{
  "primitive": {
    "color": { "$type": "color", "neutral": { "0": { "$value": "#FFFFFF" } } },
    "space": { "$type": "dimension", "4": { "$value": { "value": 16, "unit": "px" } } }
  },
  "semantic": {
    "color": { "$type": "color", "bg": { "base": { "$value": "{primitive.color.neutral.0}" } } }
  },
  "component": {
    "button": { "primary": { "bg": { "$type": "color", "$value": "{semantic.color.accent}" } } }
  }
}
```
> Los componentes referencian **semántico**, nunca primitivo (regla dura del contrato). Si detectas una var de componente aliaseada directo a primitivo, avísalo en el reporte.

### Paso 3 — Detectar drift (opcional)
Si el usuario tiene un archivo de tokens existente:
```
- Comparar variables de Figma con tokens actuales del codebase
- Listar variables nuevas (en Figma, no en código)
- Listar variables eliminadas (en código, no en Figma)
- Listar variables con valores distintos
```

### Paso 4 — Entregar los tokens
- Mostrar el código generado en la conversación
- Indicar qué archivo del proyecto debe actualizarse
- Si hay drift, mostrar primero el diff y pedir confirmación

## Convenciones de naming en la exportación
- Usar kebab-case para todos los nombres
- Prefijo por tipo: color-, font-, spacing-, radius-, shadow-
- Mantener la jerarquía de las colecciones de Figma: color-brand-primary

---

## DIRECCIÓN: import (DTCG → Figma)

Cuando `direccion=import`, lee un `design.tokens.json` (DTCG) y crea las variables en Figma. **Este skill no reimplementa el alta de variables: delega en `apply-contract`**, que ya sabe parsear DTCG de tres niveles, resolver referencias `{...}` como alias entre colecciones y manejar dimensiones `{value, unit}`.

### Paso 1 — Localizar el archivo
```
- Usar `archivo` (default: docs/contract-reference/tokens/design.tokens.json)
- Validar que es DTCG (tiene niveles primitive/semantic/component o al menos tokens con $type/$value)
```

### Paso 2 — Delegar el alta de variables
```
- Invocar apply-contract con alcance=tokens sobre ese archivo:
  crea Contract / Primitive, Contract / Semantic, Contract / Component con los alias correctos.
- No dupliques la lógica aquí; apply-contract es la única ruta de creación de variables desde DTCG.
```

### Paso 3 — Reportar y verificar drift de import
```
- Reportar variables creadas/actualizadas por nivel.
- Si ya existían colecciones Contract/*, mostrar diff (nuevas, cambiadas, eliminadas) y pedir confirmación antes de sobreescribir.
```

## Round-trip (aceptación)
Verifica que al menos un token sobrevive el ciclo **código → Figma → código sin pérdida**:
1. Parte de un token DTCG conocido (ej. `semantic.color.accent = {primitive.color.blue.500}` → `#4F46E5`).
2. `import` → crea la variable en Figma (alias semántico→primitivo).
3. `export formato=dtcg` → vuelve a emitir DTCG.
4. Compara: el valor resuelto y la referencia `{primitive.color.blue.500}` deben conservarse (mismo hex, misma cadena de alias). Reporta cualquier pérdida (alias colapsado a literal, dimensión convertida a string, nivel perdido).

## Ejemplos de uso
- "Exporta todos los tokens como CSS variables"
- "Dame el config de Tailwind con los colores del DS"
- "Genera los tokens en formato JSON para Style Dictionary"
- "Exporta los tokens en formato DTCG para el contrato del Pilar 0"
- "Importa el design.tokens.json del contrato a Figma"
- "Haz el round-trip del token de acento y verifica que no se pierde"
- "¿Hay diferencias entre los tokens de Figma y los de nuestro código?"
