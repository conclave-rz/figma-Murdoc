# generate-screen

Skill para generar cualquier tipo de pantalla mobile o desktop en Figma usando el sistema de diseño activo.

## Prerequisito
Carga figma-use antes de ejecutar este skill.

## Cuando usar este skill
- Cuando el usuario pide crear una pantalla, flujo o sección de UI
- Cuando necesitas generar múltiples pantallas conectadas como un flujo
- Cuando el usuario describe una pantalla en lenguaje natural

## Parámetros disponibles
El usuario puede especificar antes de ejecutar:
- `tipo`: onboarding · login · dashboard · empty-states · custom (default: custom)
- `plataforma`: mobile 375x812 · desktop 1440x900 (default: mobile)
- `pantallas`: número de pantallas a generar (default: según tipo)
- `nombre_flujo`: nombre para la sección en el canvas

## Pasos de ejecución

### Paso 1 — Reconocimiento del sistema de diseño
```
- figma_get_variables → guardar colores, tipografías, espaciados disponibles
- figma_search_components → identificar botones, inputs, cards, nav, iconos
- figma_get_design_system_summary → resumen general del DS
- Reportar al usuario qué encontró antes de continuar
- Si no hay variables ni componentes, preguntar al usuario si continúa con valores básicos
```

### Paso 2 — Crear sección contenedora
```
- Crear una Section en el canvas con el nombre del flujo
- Los frames irán dentro, de izquierda a derecha, 80px de separación
- ⚠️ Usar timeout: 10000 si se crean más de 2 frames
```

### Paso 3 — Generar pantallas según tipo

> **⚠️ REGLAS OBLIGATORIAS para figma_execute en este paso:**
>
> **Async:** Siempre usar `await figma.getNodeByIdAsync(id)` y `await figma.setCurrentPageAsync(page)`. Las versiones sync (`figma.getNodeById`, `figma.currentPage = x`) están deprecadas y FALLAN.
>
> **Fonts:** Siempre hacer `await figma.loadFontAsync({family, style})` ANTES de asignar `.characters` a un nodo de texto.
>
> **Timeout:** Usar `timeout: 15000` para crear un frame con contenido. Usar `timeout: 25000` si se crean múltiples frames en una sola llamada. Nunca dejar el default de 5000.
>
> **Effects:** Si aplicas sombras, NO usar `spread` ni `blendMode` dentro del effect. Ver reglas en figma-use.
>
> **Dividir operaciones:** Crear cada frame en una llamada separada a figma_execute. NO intentar crear todo el flujo (4+ pantallas) en una sola llamada — se agotará el timeout y el resultado se truncará.
>
> **Código compacto:** Devolver solo `{ id, name }` de los nodos creados. No devolver el nodo completo.

---

#### TIPO: onboarding (4 pantallas mobile)
Frame `[Flujo]/01 - Bienvenida` (375x812)
- Logo o ilustración centrada (40% superior)
- Título heading principal
- Subtítulo o tagline
- Botón CTA primario ancho completo (bottom)
- Link secundario "Ya tengo cuenta"

Frame `[Flujo]/02 - Propuesta de valor` (375x812)
- Indicador de progreso 1/3
- Título de sección
- 3 items: icono 24x24 + título corto + descripción 2 líneas
- Botón "Continuar" + botón ghost "Saltar"

Frame `[Flujo]/03 - Registro` (375x812)
- Indicador de progreso 2/3
- Título "Crea tu cuenta"
- Input nombre, email, contraseña (con toggle visibilidad)
- Checkbox términos y condiciones
- Botón CTA "Crear cuenta"
- Link "¿Ya tienes cuenta? Inicia sesión"

Frame `[Flujo]/04 - Confirmación` (375x812)
- Icono de éxito centrado (30%)
- Título "¡Listo!"
- Descripción del siguiente paso
- Botón CTA "Ir al inicio"

---

#### TIPO: login (2 pantallas mobile)
Frame `[Flujo]/01 - Inicio de sesión` (375x812)
- Logo centrado (20% superior)
- Input email
- Input contraseña con toggle de visibilidad
- Botón CTA "Iniciar sesión" ancho completo
- Link "¿Olvidaste tu contraseña?"
- Separador "o continúa con"
- Botones social login (Google, Apple)

Frame `[Flujo]/02 - Recuperar contraseña` (375x812)
- Ícono de email centrado
- Título "Recupera tu contraseña"
- Descripción breve del proceso
- Input email
- Botón CTA "Enviar instrucciones"
- Link "Volver al inicio de sesión"

---

#### TIPO: dashboard (1 pantalla desktop)
Frame `[Flujo]/01 - Dashboard` (1440x900)
- Sidebar izquierdo (240px): logo, navegación principal, avatar usuario
- Header (64px): título de sección, buscador, notificaciones, perfil
- Content area: 4 cards de métricas en fila superior, tabla o lista debajo
- Usar variables de color para separar zonas (sidebar más oscuro, content claro)

> ⚠️ Este frame es complejo. Dividir en 3 llamadas:
> 1. `timeout: 15000` — Crear frame base + sidebar
> 2. `timeout: 15000` — Crear header + cards de métricas
> 3. `timeout: 15000` — Crear tabla/lista de contenido

---

#### TIPO: empty-states (3 pantallas mobile)
Frame `[Flujo]/01 - Sin contenido` (375x812)
- Ilustración o icono centrado (40%)
- Título descriptivo del estado vacío
- Descripción de qué hacer a continuación
- Botón CTA principal

Frame `[Flujo]/02 - Error` (375x812)
- Icono de error o alerta centrado
- Título "Algo salió mal"
- Descripción del error en lenguaje amigable
- Botón "Reintentar" + link de soporte

Frame `[Flujo]/03 - Sin conexión` (375x812)
- Icono de conexión cortada
- Título "Sin conexión"
- Descripción breve
- Botón "Reintentar"

---

#### TIPO: custom (pantallas libres)
- El usuario describe la pantalla en lenguaje natural
- Inferir la estructura más apropiada basándose en la descripción
- Preguntar si hay dudas sobre contenido o estructura antes de generar
- Aplicar las mismas reglas de layout, nomenclatura y DS que los tipos anteriores

---

### Paso 4 — Verificación
```
- figma_capture_screenshot de cada frame creado
- Verificar que todos los elementos usan variables del DS
- Verificar que los nombres de capas siguen la convención
- Reportar resumen al usuario: frames creados, componentes usados, pendientes
```

## Si falta un componente
1. Notificar al usuario qué componente falta
2. Crear versión básica con formas nativas y variables disponibles
3. Nombrar con prefijo _temp/ para identificación fácil
4. Añadir comentario en Figma indicando qué componente debería usarse

## Componentes slot-ready

Cuando generes componentes nuevos (cards, modals, list items), estructura los frames internos para que puedan convertirse en slots nativos:

- Nombrar frames de contenido variable con prefijo `slot-` (ej: `slot-body`, `slot-actions`)
- Usar Auto Layout en esos frames (VERTICAL u HORIZONTAL según el caso)
- Configurar `fill container` en la dirección principal
- No hardcodear hijos fijos en frames que deberían ser flexibles

Esto permite que el diseñador convierta esos frames a slots nativos con un click ("Convert to slot"), sin reestructurar después. Ver skill `slot-patterns` para patrones detallados por tipo de componente.

> ⚠️ La Plugin API no puede crear slots programáticamente aún — solo preparar la estructura.

## Patrón de código recomendado para crear un frame

```javascript
// ✅ Patrón correcto — una pantalla por llamada, timeout: 15000
const page = figma.currentPage;

// Cargar fuentes ANTES de crear textos
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Bold" });

// Obtener sección padre
const section = await figma.getNodeByIdAsync("SECTION_ID");

// Crear frame
const frame = figma.createFrame();
frame.name = "Onboarding/01 - Bienvenida";
frame.resize(375, 812);
frame.x = 0;
frame.y = 0;
section.appendChild(frame);

// Crear elementos hijos...
const title = figma.createText();
title.characters = "Bienvenido";
// ...

// Devolver SOLO lo necesario
return { id: frame.id, name: frame.name };
```

## Ejemplos de uso
- "Genera un flujo de onboarding para mi app de finanzas"
- "Crea la pantalla de login con autenticación social"
- "Necesito un dashboard para métricas de ventas en desktop"
- "Genera los empty states para la sección de notificaciones"
- "Crea una pantalla de perfil de usuario con foto, nombre y configuración"
