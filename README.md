# Figma Murdoc

Fork del [Figma Console MCP](https://github.com/southleft/figma-console-mcp) extendido con un sistema de **Skills** para equipos de diseño. Conecta Claude con Figma Desktop para generar pantallas, documentar componentes, preparar handoffs y auditar sistemas de diseño — todo desde lenguaje natural.

## Qué añade este fork

- **Sistema de Skills** — instrucciones en markdown que definen flujos de trabajo completos para diseñadores
- **Loader dinámico** — los skills se leen en tiempo real sin recompilar ni reiniciar el servidor
- **Instrucciones de arranque** — el servidor carga `figma-murdoc.md` al iniciar
- **19 skills listos para usar** — cubre los workflows más comunes de un equipo de diseño
- **Orquestación inteligente** — mission planner con personas, pipelines con dependencias, review gates y auto-mejora (Nen)
- **Integración con Radix UI** — sistema de diseño base accesible con skills por industria
- **Soporte para Slots nativos** — auditoría, migración y patrones de composición con la nueva feature de Figma
- **Specs de accesibilidad** — generación de specs para VoiceOver, TalkBack y ARIA
- **Reglas de Plugin API** — documentación de errores comunes y mejores prácticas integrada en los skills

## Skills disponibles (19)

### Orquestación
| Skill | Qué hace |
|---|---|
| `mission-planner` | Personas (UX, Visual, A11y, Dev, PM) que hacen preguntas preflight para completar el brief antes de diseñar |
| `run-mission` | Ejecuta pipelines de skills con dependencias automáticas y review gates. Pipelines: ds-completo, pantallas, libreria, audit-completo |
| `review-gates` | Verificación automática entre fases: tokens, componentes, pantallas, a11y, handoff. Con lógica de retry |
| `nen-analyze` | Auto-mejora: analiza métricas de misiones, detecta errores recurrentes, identifica cuellos de botella, genera recomendaciones |

### Base
| Skill | Qué hace |
|---|---|
| `figma-use` | Skill base obligatorio. Define cómo trabajar en el canvas, reglas de Plugin API (async, effects, timeouts, código compacto) y limitaciones conocidas |

### Generación
| Skill | Qué hace |
|---|---|
| `generate-screen` | Genera cualquier pantalla: onboarding, login, dashboard, empty states o custom. Incluye estructura slot-ready |
| `generate-onboarding` | Flujo de onboarding mobile de 4 pantallas con sistema de diseño |
| `generate-library` | Crea librería de componentes en Figma desde un codebase (React, Vue, Angular, Svelte). Extrae props, variantes, tokens y los recrea como componentes nativos |

### Documentación
| Skill | Qué hace |
|---|---|
| `generate-documentation` | Documenta componentes listos para Notion, Confluence o Storybook |
| `generate-showcase-page` | Genera una página web con componentes documentados, tokens y flujos |

### Handoff a desarrollo
| Skill | Qué hace |
|---|---|
| `prepare-handoff` | Prepara diseños para desarrollo: anotaciones, nomenclatura, mapeo de slots a código (React/Vue/Angular) y "Ready for dev" |
| `sync-tokens` | Exporta variables de Figma a CSS, Tailwind, JSON o Sass |

### Auditoría y calidad
| Skill | Qué hace |
|---|---|
| `audit-quality` | Detecta drift del DS, problemas WCAG, valores hardcodeados y candidatos a migración de slots |
| `create-voice` | Genera specs de screen reader (VoiceOver, TalkBack, ARIA) desde diseños UI. Roles, labels, hints y orden de lectura |

### Slots nativos de Figma
| Skill | Qué hace |
|---|---|
| `migrate-to-slots` | Audita librería para detectar candidatos a slots, reestructura componentes y prepara frames para "Convert to slot" |
| `slot-patterns` | Patrones de composición con slots para Card, Modal, ListItem, NavBar y FormSection |

### Sistema de diseño con Radix UI
| Skill | Qué hace |
|---|---|
| `setup-radix-base` | Importa tokens de Radix UI como variables en Figma |
| `generate-industry` | Genera DS completo por industria: travel, fintech, ecommerce, health, saas |
| `apply-design-system` | Conecta diseños existentes al sistema de diseño activo |

## Reglas de Plugin API integradas

Los skills incluyen documentación de errores comunes encontrados en producción:

### APIs async obligatorias
```javascript
// ❌ NUNCA — falla silenciosamente
figma.getNodeById(id);
figma.currentPage = page;

// ✅ SIEMPRE — async obligatorio
await figma.getNodeByIdAsync(id);
await figma.setCurrentPageAsync(page);
await figma.loadFontAsync({ family, style });
```

### Effects — blendMode obligatorio, spread prohibido
```javascript
// ❌ spread no existe, falta blendMode
node.effects = [{ type: 'DROP_SHADOW', spread: 0, ... }];

// ✅ Con blendMode, sin spread
node.effects = [{ type: 'DROP_SHADOW', color, offset, radius, blendMode: 'NORMAL', visible: true }];
```

### Timeouts adecuados
| Operación | Timeout |
|---|---|
| Nodo simple | 5000ms |
| Frame con Auto Layout | 10000ms |
| Pantalla completa | 20000ms |
| Flujo múltiple | 25000ms |
| Sistema de tokens | 30000ms |

### Código compacto
Devolver solo `{ id, name }` — nunca nodos completos. Dividir operaciones grandes en múltiples llamadas.

## Soporte de Slots nativos

Los slots son la nueva feature de Figma (open beta marzo 2026) que permite áreas flexibles dentro de componentes.

**Estado de la Plugin API:**
| Operación | Soportado |
|---|---|
| Detectar slots (`node.type === "SLOT"`) | ✅ |
| Leer slot properties | ✅ |
| Crear slots programáticamente | ❌ |
| Modificar slots en instancias | ❌ |

Murdoc puede auditar, reestructurar y preparar componentes para slots. El paso final "Convert to slot" lo hace el diseñador con un click.

## Flujo Radix UI → Figma → Showcase

```
1. setup-radix-base
   └── Crea variables en Figma: Colors, Typography, Spacing, Radius, Shadow

2. generate-industry  (travel | fintech | ecommerce | health | saas)
   ├── Extiende los tokens base con paleta de la industria
   ├── Genera los componentes específicos del sector
   └── Arma el flujo principal de pantallas

3. generate-documentation
   └── Documenta cada componente con variantes, props y notas ARIA

4. generate-showcase-page
   └── Produce index.html con tokens, componentes y flujos listos para desplegar
```

## Flujo Código → Figma

```
1. generate-library
   ├── Analiza codebase (React/Vue/Angular/Svelte)
   ├── Extrae props, variantes, tokens
   └── Crea componentes nativos en Figma con component properties

2. migrate-to-slots (opcional)
   ├── Detecta componentes con muchas variantes
   └── Reestructura para usar slots nativos

3. create-voice
   ├── Analiza pantallas terminadas
   └── Genera specs de VoiceOver, TalkBack y ARIA

4. prepare-handoff
   ├── Audita nomenclatura y tokens
   ├── Mapea slots a código (React children, Vue slot)
   └── Genera resumen de handoff
```

## Industrias disponibles

| Industria | Componentes | Flujo principal |
|---|---|---|
| `travel` | DateRangePicker, FlightCard, SeatMap, SearchBar | Búsqueda → Resultados → Detalle → Checkout |
| `fintech` | BalanceCard, TransactionRow, TransferForm, PinInput | Inicio → Transferir → Confirmar → PIN → Éxito |
| `ecommerce` | ProductCard, CartItem, SizeSelector, FilterSidebar | Catálogo → Detalle → Carrito → Checkout |
| `health` | DoctorCard, AppointmentSlot, HealthMetric, VitalChart | Buscar médico → Disponibilidad → Confirmar cita |
| `saas` | StatCard, DataTable, Sidebar, CommandPalette | Dashboard → Detalle → Configuración |

## Requisitos

- [Figma Desktop](https://www.figma.com/downloads/) — obligatorio, no funciona con Figma en navegador
- Node.js 18 o superior
- Claude Desktop con soporte MCP
- Plugin **Figma Desktop Bridge** instalado en Figma
- (Opcional) `FIGMA_ACCESS_TOKEN` para REST API features (variables, comentarios)

## Instalación

### 1. Clonar el repo
```bash
git clone https://github.com/Razyel-Soma/figma-Murdoc.git
cd figma-Murdoc
npm install
```

### 2. Instalar el plugin en Figma Desktop

1. Abre Figma Desktop
2. Ve a `Plugins → Development → Import plugin from manifest...`
3. Selecciona el archivo:
```
figma-Murdoc/figma-desktop-bridge/manifest.json
```
4. El plugin aparecerá como **"Figma Desktop Bridge"**

### 3. Compilar el servidor
```bash
npm run build:local
```

### 4. Conectar con Claude Desktop

Edita `~/.claude.json` y añade:
```json
{
  "mcpServers": {
    "figma-console": {
      "command": "node",
      "args": ["/ruta/a/figma-Murdoc/dist/local.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "figd_TU_TOKEN_AQUI",
        "ENABLE_MCP_APPS": "true"
      }
    }
  }
}
```

Reemplaza `/ruta/a/` con la ruta real. El token es opcional pero habilita REST API features. Reinicia Claude Desktop.

### 5. Verificar la instalación

En Claude Desktop escribe:
```
list_skills
```

Deberías ver los 19 skills disponibles.

## Flujo de misión (orquestación)

```
Usuario: "Necesito una app de fintech"
        ↓
mission-planner
  🔍 UX Researcher: ¿Flujo de cuántos pasos? ¿Guest checkout?
  🎨 Visual Designer: ¿Marca existente o empezamos con Radix?
  ♿ A11y Specialist: ¿Screen readers? ¿Modo oscuro?
  ⚙️ Developer: ¿React? ¿Componentes existentes?
  📊 Product Manager: ¿Pantallas MVP?
        ↓
run-mission (pipeline: ds-completo)
  Phase 1: setup-radix-base        → 🚦 verify-variables
  Phase 2: generate-industry       → 🚦 verify-components
  Phase 3: generate-library        → 🚦 review-quality ← retry si falla
  Phase 4: generate-screen         → 🚦 review-quality ← retry si falla
  Phase 5: create-voice            
  Phase 6: prepare-handoff         
  Phase 7: generate-showcase-page  
        ↓
nen-analyze
  📊 Métricas guardadas → patrones detectados → recomendaciones
  → Siguiente misión es más rápida y con menos errores
```

## Uso

### Activar el plugin en Figma

Antes de usar cualquier skill, abre el plugin en Figma Desktop:
`Plugins → Development → Figma Desktop Bridge`

Espera a ver **"✓ Desktop Bridge active"** en el panel del plugin.

### Usar un skill

Describe lo que quieres en lenguaje natural:
```
Configura el sistema de diseño base con Radix
Genera los componentes de fintech para el cliente BancoX
Crea la librería de componentes desde mi codebase React
Prepara el flujo de checkout para entregarlo a los devs
Genera las specs de VoiceOver para la pantalla de login
Audita mi librería para ver qué componentes migrar a slots
```

### Invocar un skill manualmente
```
use_skill generate-library
use_skill create-voice
use_skill migrate-to-slots
```

## Añadir skills propios

Los skills son archivos `.md` en `/skills/`. No necesitas recompilar — se leen en tiempo real.
```bash
cat > skills/mi-skill.md << 'SKILL'
# mi-skill

Descripción de qué hace.

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Cuando usar este skill
- Situación A

## Pasos de ejecución
### Paso 1 — ...
SKILL
```

## Estructura del proyecto
```
figma-Murdoc/
├── skills/                          ← Skills en markdown (19 archivos)
│   ├── figma-use.md                 ← Base + reglas de Plugin API
│   ├── mission-planner.md           ← Personas preflight
│   ├── run-mission.md               ← Pipelines con dependencias
│   ├── review-gates.md              ← QA automático entre fases
│   ├── nen-analyze.md               ← Auto-mejora con métricas
│   ├── generate-screen.md           ← Pantallas con estructura slot-ready
│   ├── generate-onboarding.md       ← Flujos onboarding mobile
│   ├── generate-library.md          ← Librería desde codebase
│   ├── generate-documentation.md    ← Documentación de componentes
│   ├── generate-showcase-page.md    ← Web del DS
│   ├── prepare-handoff.md           ← Handoff con mapeo de slots
│   ├── sync-tokens.md               ← Exportar tokens a código
│   ├── audit-quality.md             ← QA + detección de candidatos a slots
│   ├── create-voice.md              ← Specs screen reader (a11y)
│   ├── migrate-to-slots.md          ← Migración a slots nativos
│   ├── slot-patterns.md             ← Patrones de composición con slots
│   ├── apply-design-system.md       ← Conectar al DS
│   ├── setup-radix-base.md          ← Tokens Radix UI
│   └── generate-industry.md         ← DS por industria
├── src/
│   ├── skills/loader.ts             ← Lee los .md en tiempo real
│   ├── tools/skills.ts              ← Tools list_skills y use_skill
│   └── local.ts                     ← Servidor MCP
├── figma-desktop-bridge/            ← Plugin de Figma
├── figma-murdoc.md                  ← Instrucciones de arranque + reglas Plugin API
└── dist/local.js                    ← Entry point compilado
```

## Documentación adicional

- [FAQ para el equipo](docs/FAQ.md) — preguntas frecuentes, diferencias con el MCP oficial y guía de personalización

## Créditos

Basado en [figma-console-mcp](https://github.com/southleft/figma-console-mcp) por Southleft. Licencia MIT.

Desarrollado y extendido por Rz Inc.

---

## html-to-figma

**Migra prototipos HTML/React generados en Claude a Figma como un design system completo.**

Convierte artefactos de Claude Desktop o Claude Code (HTML, React/JSX, Tailwind CSS) en un archivo Figma editabl con tokens, componentes nativos y pantallas listas para que el equipo de diseño itere.

### Flujo de migración

```
HTML/React/CSS (input)
       │
       ▼
  1. ANÁLISIS     → Parser extrae estructura (html_parser.py → spec JSON)
       │
       ▼
  2. TOKENS       → CSS vars / Tailwind → Figma Variables (Light/Dark)
       │
       ▼
  3. COMPONENTES  → Elementos reutilizables → Figma Components con variantes
       │
       ▼
  4. PANTALLAS    → Layouts completos → Figma Frames (mobile/desktop)
       │
       ▼
  5. HANDOFF      → Documentar, anotar, entregar al equipo de diseño
```

### Qué detecta automáticamente

| Fuente | Extrae |
|---|---|
| **Tailwind CSS** | Colores, tipografía, spacing, border-radius, sombras |
| **CSS Custom Properties** | Variables con soporte Light/Dark mode |
| **React/JSX** | Componentes, props tipados, variantes (TypeScript interfaces) |
| **HTML semántico** | Patrones repetidos como componentes, secciones como pantallas |

### Herramientas incluidas

- `scripts/html_parser.py` — Parser standalone que analiza código y genera un spec JSON intermedio
- `SKILL.md` — Instrucciones completas del flujo de migración con patrones de código probados

### Ejemplo de uso

```
"Migra este HTML que generamos a Figma con su design system"
"Convierte este artifact React en componentes de Figma"
"Toma este prototipo y pásalo a Figma para que diseño lo retome"
"Genera el DS en Figma a partir de este código Tailwind"
```

### Uso del parser standalone

```bash
python scripts/html_parser.py mi-app.tsx --output spec.json
```

Genera un JSON con tokens, componentes y pantallas detectados que el skill usa para crear todo en Figma.

