# reuse-first

Preflight de **buscar-antes-de-generar**: antes de crear cualquier pieza, consulta el registry del contrato y la librería/DS del archivo; si la pieza ya existe, la **reutiliza** en vez de recrearla. Las tools de búsqueda ya existen — este skill añade el paso, no la capacidad.

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Regla de oro
No recrees lo que ya existe. Una instancia reutilizada del contrato/DS siempre gana a un elemento nuevo construido desde cero: mantiene nomenclatura, tokens y Code Connect intactos.

## Cuando usar este skill
- Como **Paso 0** de `generate-screen`, `generate-library` y `generate-industry` (enganchado ahí; no rompe su flujo).
- Cuando el usuario pide una pantalla/componente y podría existir ya en el registry o en la librería.
- Standalone: "¿ya existe un botón primario que pueda usar?"

## Insumos que consulta
- `docs/contract-reference/registry.json` → `items[].meta.contract` (ids `category/role/variant`) y `when` (cuándo usar cada pieza).
- La librería/DS del archivo activo de Figma.

---

## Pasos de ejecución

### Paso 1 — Construir la lista de piezas requeridas
A partir de lo que el skill llamador va a generar (botón, input, card, nav, modal…), lista las piezas necesarias. Cuando exista contrato, exprésalas como ids `category/role/variant` usando el campo `when` del registry para elegir la variante correcta (ej. "acción principal única" → `action/button/primary`).

### Paso 2 — Buscar antes de generar
Para cada pieza, en este orden (de más autoritativo a menos):
```
1. Registry del contrato (docs/contract-reference/registry.json)
   - ¿Existe un item cuyo meta.contract corresponda? Guardar el id y su .contract.json.
2. figma_search_components → ¿existe ya una instancia/componente con ese nombre o equivalente en el archivo?
3. figma_get_library_components → ¿existe en una librería publicada vinculada?
4. figma_get_design_system_summary → panorama del DS del archivo para descartar duplicados.
```
Registrar por cada pieza: `{ pieza, encontrada: si|no, fuente: registry|archivo|libreria|ninguna, ref }`.

### Paso 3 — Decidir reusar vs. generar
```
- encontrada=si  → REUSAR: figma_instantiate_component (o importComponentByKeyAsync para librería)
                    y bindear props/tokens de la instancia. No reconstruir.
- encontrada=no  → marcar la pieza como "a generar" y devolver el control al skill llamador,
                    que la crea siguiendo sus reglas (Auto Layout, tokens del DS/contrato).
```
Si el registry define la pieza pero no hay componente en el archivo, sugerir correr `apply-contract` primero para materializar el stub y reusarlo.

### Paso 4 — Reportar el preflight
Emitir un resumen que el skill llamador incorpora a su flujo:
```
Preflight reuse-first:
- action/button/primary → REUSAR (librería: Button)
- form/field/text       → REUSAR (registry stub 123:45)
- data/table/default    → GENERAR (no existe)
```

## Aceptación (cómo se valida este skill)
La generación registra explícitamente un **paso de búsqueda** y **reutiliza un componente existente** cuando lo hay (aparece una instancia del componente encontrado, no una copia reconstruida desde cero).

## Enganche en los skills de generación
`generate-screen`, `generate-library` y `generate-industry` invocan este skill como Paso 0. El preflight no reemplaza su reconocimiento del DS; lo antecede: primero decide qué reusar, luego el skill solo genera lo que no existe.

## Ejemplos de uso
- "Antes de generar la pantalla, revisa qué componentes ya existen"
- "¿Tengo ya un modal en el sistema o lo tengo que crear?"
- "Reusa lo que haya del contrato antes de construir el flujo"
