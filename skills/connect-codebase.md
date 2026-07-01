# connect-codebase

Skill de **Code Connect**: produce un mapa explícito nodo de Figma ↔ componente de código real, apoyándose en la nomenclatura `category/role/variant` del contrato. Cierra la brecha #1 frente al MCP oficial: hoy `prepare-handoff` solo anota; esto amarra.

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Regla de oro
Usa la nomenclatura del contrato (`registry.json.items[].meta.contract`) como llave de amarre. No inventes nombres nuevos: el `id` `category/role/variant` es el que ata Figma y código.

## Cuando usar este skill
- Después de `apply-contract` (existen stubs/instancias con nombres `category/role/variant`).
- Antes o durante `prepare-handoff`, para que el handoff referencie componentes reales en vez de solo anotar.
- Cuando el código generado debe apuntar a la variable/componente del contrato, no re-buscar en el codebase.

## Insumos que consume
- `docs/contract-reference/registry.json` → `items[].meta.contract` (el `id`) y `files[].path` del `.contract.json`.
- El codebase del proyecto, donde cada componente expone el atributo `data-component="category/role/variant"` (convención del Pilar 1/3). El usuario indica la ruta del codebase (o el mapa `id → import` si ya lo tiene).

## Salida
1. `code-connect.map.json` — el mapa de amarre (se escribe en la raíz del proyecto de diseño o en `docs/`).
2. Anotaciones/pluginData en cada nodo de Figma amarrado.

Formato de `code-connect.map.json`:
```json
{
  "$schema": "code-connect.map",
  "generatedFrom": "docs/contract-reference/registry.json",
  "entries": [
    {
      "contract": "action/button/primary",
      "figmaNodeId": "123:45",
      "figmaNodeName": "action/button/primary",
      "code": {
        "component": "ButtonPrimary",
        "import": "@/components/ui/button-primary",
        "dataComponent": "action/button/primary",
        "source": "src/components/ui/button-primary.tsx"
      },
      "tokensUsed": ["component.button.primary.bg", "component.button.primary.text", "component.button.primary.radius"],
      "status": "linked"
    }
  ]
}
```
`status`: `linked` (amarrado end-to-end) · `figma-only` (existe nodo, falta código) · `code-only` (existe código, falta nodo).

---

## Pasos de ejecución

### Paso 1 — Cargar el índice del contrato
```
- Leer registry.json → construir tabla { contract-id → {registryItem, contractFile} }
- Leer cada contract/examples/*.contract.json → { id, tokensUsed, slots, props }
- Resultado: catálogo de ids esperados (category/role/variant)
```

### Paso 2 — Descubrir nodos en Figma por nombre de contrato
```
- figma_search_components → buscar componentes/instancias cuyo nombre sea un id del catálogo
- figma_get_design_system_summary → complementar con el DS del archivo
- figma_execute (timeout: 20000) → recorrer la página y recolectar nodos cuyo name coincida con un id
  del catálogo o cuyo pluginData "contract" tenga ese id (los stubs de apply-contract lo escriben).
  Devolver compacto: [{ id, name }]
```

### Paso 3 — Resolver el componente de código
Para cada `id` del catálogo:
```
- Buscar en el codebase el componente con data-component="<id>"
  (grep del atributo; el usuario puede pasar la ruta o un mapa id→import ya resuelto)
- Extraer: nombre del componente, ruta de import, archivo fuente
- Si el registry item trae behavior (zag:field, ark:dialog), anotarlo también
```
Si el usuario no da acceso al codebase, aceptar un mapa manual `id → { component, import }` y marcar el resto como `figma-only`.

### Paso 4 — Escribir el amarre
Para cada entrada con nodo Figma **y** componente de código:

> **⚠️ Limitación conocida (ver figma-use):** `figma_set_annotations` depende del Desktop Bridge. Si falla, usar `figma_execute` con `node.setPluginData(...)` (timeout: 10000).

```
- figma_set_annotations (o setPluginData "codeConnect") en el nodo:
    { component, import, dataComponent: "<id>", source }
- figma_set_description → añadir la línea "Code: <import>" al componente
- Acumular la entrada en code-connect.map.json con status "linked"
```
Nodos sin código → `figma-only`. Ids del catálogo sin nodo → `code-only`.

### Paso 5 — Emitir el mapa y reportar
```
- Escribir code-connect.map.json (mostrar diff si ya existía)
- Reportar: X linked / Y figma-only / Z code-only
- Recomendar: usar el mapa en generate-* para que el código referencie el import en vez de re-buscar
```

## Aceptación (cómo se valida este skill)
Al menos un componente queda **linked end-to-end**: su nodo de Figma tiene la anotación `codeConnect`, aparece en `code-connect.map.json` con `status: "linked"`, y el código generado a partir de ese nodo referencia el `import`/componente del mapa en vez de re-buscar en el codebase.

## Relación con otros skills
- **apply-contract** crea los nodos con nombre `category/role/variant` y pluginData de contrato — este skill los consume.
- **prepare-handoff** puede invocar este mapa para documentar el amarre en el handoff.
- **sync-tokens** y este skill comparten la misma llave (`tokensUsed` / contract id).

## Ejemplos de uso
- "Conecta los componentes de este archivo con nuestro código vía Code Connect"
- "Genera el code-connect.map.json a partir del registry y el codebase"
- "Amarra el botón primario de Figma con su componente de React"
