# generate-industry

Skill para generar un sistema de diseño completo orientado a una industria específica, extendiendo el sistema base de Radix con paleta, componentes y flujos propios del sector.

## Prerequisito
- Carga figma-use antes de ejecutar este skill
- setup-radix-base debe haberse ejecutado primero

## Cuando usar este skill
- Al empezar un proyecto para un cliente de una industria específica
- Cuando el cliente pide "genera los componentes para una app de X"

## Industrias disponibles
- travel — apps de viajes, vuelos, hoteles
- fintech — banca, pagos, inversiones
- ecommerce — tiendas, catálogos, checkout
- health — salud, citas médicas, seguimiento
- saas — dashboards, herramientas B2B

## Parámetros
- industria: travel · fintech · ecommerce · health · saas (requerido)
- nombre_cliente: nombre del proyecto (default: "Proyecto")
- flujo: nombre del flujo a generar (default: según industria)

## Paletas por industria

### travel
- brand/primary #0EA5E9 · brand/secondary #F97316 · surface/hero #0C1445

### fintech
- brand/primary #6366F1 · brand/positive #10B981 · brand/negative #EF4444

### ecommerce
- brand/primary #EC4899 · brand/secondary #F59E0B · sale #EF4444

### health
- brand/primary #0D9488 · brand/secondary #6EE7B7 · urgent #EF4444

### saas
- brand/primary #6366F1 · brand/secondary #8B5CF6 · surface/sidebar #0F172A

## Componentes específicos por industria

### travel
DateRangePicker, PassengerSelector, FlightCard, HotelCard, PriceSlider, SearchBar, TripSummary, SeatMap

### fintech
BalanceCard, TransactionRow, SpendingChart, TransferForm, PinInput, CardPreview, AccountSelector

### ecommerce
ProductCard, ProductGallery, SizeSelector, CartItem, PriceBreakdown, ReviewStars, AddToCart, FilterSidebar

### health
DoctorCard, AppointmentSlot, HealthMetric, MedicationReminder, SymptomChecker, VitalChart

### saas
StatCard, DataTable, Sidebar, CommandPalette, StatusBadge, NotificationPanel, EmptyState

## Flujos por industria

### travel — Búsqueda de vuelos
01 - Búsqueda · 02 - Resultados · 03 - Detalle vuelo · 04 - Checkout · 05 - Confirmación

### fintech — Transferencia
01 - Inicio · 02 - Transferir · 03 - Confirmar · 04 - PIN · 05 - Éxito

### ecommerce — Compra
01 - Catálogo · 02 - Detalle producto · 03 - Carrito · 04 - Checkout · 05 - Confirmación

### health — Agendar cita
01 - Inicio · 02 - Buscar médico · 03 - Disponibilidad · 04 - Confirmar · 05 - QR de cita

### saas — Dashboard
01 - Dashboard · 02 - Detalle · 03 - Configuración · 04 - Notificaciones

## Pasos de ejecución

### Paso 0 — Preflight reuse-first (buscar antes de generar)
> Antes de crear tokens y componentes de industria, ejecuta el skill `reuse-first`: para cada componente de la industria, busca si ya existe en el registry del contrato, en el archivo o en una librería vinculada. Reusa (instancia) lo que exista; solo genera lo que falte. Evita recrear componentes que el DS ya provee.

### Paso 1 — Verificar base de Radix
- figma_get_variables → verificar colecciones "Radix / Colors" etc.
- Si no existen, detener y pedir ejecutar setup-radix-base primero

### Paso 2 — Crear tokens de industria
- figma_setup_design_tokens "[Cliente] / Brand Colors" con la paleta de industria
- Modos: Light y Dark

### Paso 3 — Generar componentes
Para cada componente de la industria:
- figma_search_components → verificar si existe versión base
- Si no existe: crear con figma_execute usando Auto Layout y tokens de industria
- figma_set_description → documentar con nombre y propiedades
- figma_arrange_component_set → organizar variantes en grid

### Paso 4 — Generar el flujo principal
- Crear Section "[Cliente] / [Flujo]" en el canvas
- Generar cada pantalla del flujo usando los componentes creados
- figma_capture_screenshot de cada pantalla para verificar

### Paso 5 — Reportar
- Resumen: componentes creados, pantallas generadas
- Sugerir: generate-documentation para documentarlos, generate-showcase-page para el sitio

## Ejemplos de uso
- "Genera el sistema de diseño para una app de travel llamada Wanderly"
- "Crea los componentes de fintech y el flujo de transferencia"
- "Necesito un DS de ecommerce para el cliente con flujo de compra completo"
