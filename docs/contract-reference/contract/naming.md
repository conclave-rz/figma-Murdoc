# Nomenclatura · category/role/variant

Todo componente del contrato tiene un `id` de tres segmentos, en minúsculas y kebab-case por segmento:

```
category / role / variant
```

- **category** — el dominio de la pieza. Qué clase de trabajo hace.
  `action`, `form`, `data`, `overlay`, `layout`, `feedback`, `navigation`.
- **role** — el componente concreto dentro de esa categoría.
  `button`, `field`, `table`, `dialog`, `card`, `list`, `menu`.
- **variant** — la variación de ese componente.
  `primary`, `secondary`, `text`, `modal`, `inline`, `default`.

Ejemplos:

| id | qué es |
|----|--------|
| `action/button/primary` | botón de acción principal |
| `form/field/text` | campo de texto de una línea |
| `overlay/dialog/modal` | diálogo que bloquea la pantalla |
| `data/table/default` | tabla de registros comparables |

## Por qué importa

Esta convención es lo que hace que el `code-to-Figma` de Murdoc deje de fallar: los nombres planos y predecibles se mapean directo a instancias con Auto-Layout, en lugar de a markup arbitrario. Es también el índice que `rz-dash` produce y por el que la IA elige una pieza (vía el campo `when` del contrato) en vez de inventar una nueva.

## Reglas

1. Los tres segmentos son obligatorios. Nada de `button` suelto.
2. Un `id` es único en todo el contrato.
3. Si dudas entre dos categorías, gana la que describe **el trabajo del usuario**, no la implementación.
4. Una variante nueva no se inventa al vuelo: se agrega su `.contract.json` y su item en `registry.json`, o no existe.
