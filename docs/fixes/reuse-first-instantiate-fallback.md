# Fix handoff — `figma_instantiate_component` cuelga en archivos `dynamic-page`

**Aplica en:** Claude Code (donde el filesystem del skill es alcanzable).
**Contexto:** verificado en aislamiento. La tool dedicada `figma_instantiate_component` (con `componentKey` + `nodeId` válidos) se cuelga y revienta con `INSTANTIATE_COMPONENT timed out after 15000ms`. El control crudo `comp.createInstance()` vía `figma_execute` funciona en ~12ms. La API de Figma está sana; el defecto vive en el handler del bridge.

**Causa raíz (hipótesis fuerte):** el archivo está en `documentAccess: dynamic-page`, donde las APIs síncronas lanzan excepción. El handler de `INSTANTIATE_COMPONENT` usa internamente alguna sync (`getNodeById` / `node.mainComponent`); la excepción no rechaza la promesa del WebSocket, así que queda colgado hasta el timeout en vez de devolver error.

**Impacto:** `reuse-first` y los `generate-*` que reúsan por la tool dedicada cuelgan ~15s por cada instanciación en archivos `dynamic-page` (el default nuevo del manifest de plugin).

---

## 1) Drop-in async (seguro en dynamic-page)

Reemplaza cualquier llamada a `figma_instantiate_component` por este path vía `figma_execute`. Resuelve componentes locales (`nodeId`) y de librería (`componentKey`, usa la **variant key**, no la del `COMPONENT_SET`).

```js
async function reuseComponent({ nodeId, componentKey, parentId, position, variant, overrides }) {
  let comp = null;
  if (nodeId)                comp = await figma.getNodeByIdAsync(nodeId);
  if (!comp && componentKey) comp = await figma.importComponentByKeyAsync(componentKey);
  if (!comp) throw new Error("componente no resuelto: " + (nodeId || componentKey));
  if (comp.type === "COMPONENT_SET") comp = comp.defaultVariant || comp.children[0];

  const inst = comp.createInstance();
  if (parentId) { const p = await figma.getNodeByIdAsync(parentId); if (p) p.appendChild(inst); }
  if (position) { inst.x = position.x; inst.y = position.y; }
  const props = { ...(variant || {}), ...(overrides || {}) };
  if (Object.keys(props).length) inst.setProperties(props); // nombres de prop pueden traer sufijo #nodeId

  const main = await inst.getMainComponentAsync();
  return { instanceId: inst.id, name: inst.name, mainComponentId: main && main.id };
}
```

Reglas que respeta (todas por el modo dynamic-page): `getNodeByIdAsync`, `importComponentByKeyAsync`, `getMainComponentAsync` — nada síncrono.

---

## 2) Edit del Paso 3 en `reuse-first` (SKILL.md)

**Antes:**

```
- encontrada=si  → REUSAR: figma_instantiate_component (o importComponentByKeyAsync para librería)
                    y bindear props/tokens de la instancia. No reconstruir.
```

**Después:**

```
- encontrada=si  → REUSAR vía figma_execute (NO figma_instantiate_component: se cuelga 15s en
                    archivos dynamic-page). Todo async:
                    · local   → await figma.getNodeByIdAsync(nodeId)
                    · librería → await figma.importComponentByKeyAsync(variantKey)
                    → comp.createInstance() → appendChild + x/y → setProperties(variant/overrides).
                    Ver helper reuseComponent(). No reconstruir.
```

Nota: `generate-screen` (Paso 3) ya instruye `importComponentByKeyAsync` directo (async), así que está a salvo mientras NO enrute por la tool dedicada. Mismo cuidado en `generate-library` y `generate-industry`.

---

## 3) Fix real del bridge (para quien lo mantenga)

El workaround de arriba desatasca a los skills, pero el defecto sigue en el handler:

- Migrar el handler de `INSTANTIATE_COMPONENT` a APIs async: `getNodeByIdAsync`, `getMainComponentAsync`, `importComponentByKeyAsync`.
- Envolver el handler en `try/catch` que **rechace la promesa del WebSocket** con el error, para que devuelva fallo en vez de colgarse.
- Añadir un guard de fail-fast (timeout corto interno) para que nunca quede colgado hasta el timeout del cliente.

**Prueba de regresión:** en un archivo con `documentAccess: dynamic-page`, instanciar un componente recién creado debe devolver `{ instanceId, ... }` en < 1s, y con una key inválida debe devolver error inmediato (no timeout).
