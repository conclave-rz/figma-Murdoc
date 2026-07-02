# Trampas de connect-codebase

- **code-only ("falta en Figma"):** copia `table-standard.contract.json` a `../contract/examples/`
  y añade `registry.addition.json` al array `items` de `../registry.json`. El id `data/table/standard`
  tendrá código (ver `codebase-fixture/src/components/ui/data-table.tsx`) pero NO nodo en Figma.
- **orphan (nodo huérfano):** corre `figma-scripts/create-ghost-stub.js`. Crea un componente
  `data/table/ghost` cuyo id NO está en el registry → debe salir como `unmapped`, no inventarse.
- **idempotencia:** vuelve a correr la generación del map; entries no deben duplicarse.
