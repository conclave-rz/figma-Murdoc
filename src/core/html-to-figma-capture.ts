/**
 * html-to-figma-capture
 *
 * Captura viva (live capture) para html-to-figma v2: renderiza HTML/URL real en
 * un navegador headless, extrae un snapshot del DOM con estilos computados y lo
 * convierte a un árbol de nodos de Figma con Auto-Layout, conservando los nombres
 * `category/role/variant` del atributo `data-component`.
 *
 * El parser estático (skills/html-to-figma/scripts/html_parser.py) se conserva
 * como fallback; este módulo es la ruta de mayor fidelidad.
 *
 * Diseño:
 *  - `LIVE_CAPTURE_SCRIPT` corre DENTRO del navegador (page.evaluate). Es puro y
 *    autocontenido — no captura variables externas.
 *  - `snapshotToFigmaTree` es una función PURA (sin navegador) → unit-testable.
 *  - `captureLiveHtml` orquesta: navega/inyecta HTML, evalúa el script, convierte.
 */

// ─── Contrato del snapshot (lo que devuelve el navegador) ────────────────────

export interface DomSnapshotNode {
	/** tagName en minúsculas, ej. "div", "button" */
	tag: string;
	/** valor de data-component: "category/role/variant" si existe */
	dataComponent?: string;
	/** aria role o role explícito */
	role?: string;
	/** texto directo del nodo (sin el de los hijos), si es hoja de texto */
	text?: string;
	rect: { x: number; y: number; width: number; height: number };
	styles: {
		display?: string;
		flexDirection?: string;
		gap?: string;
		paddingTop?: string;
		paddingRight?: string;
		paddingBottom?: string;
		paddingLeft?: string;
		backgroundColor?: string;
		color?: string;
		borderRadius?: string;
		fontSize?: string;
		fontWeight?: string;
		fontFamily?: string;
		justifyContent?: string;
		alignItems?: string;
		/** márgenes (Fix 2: derivar itemSpacing cuando no hay gap). */
		marginTop?: string;
		marginRight?: string;
		marginBottom?: string;
		marginLeft?: string;
		/** estilo de caja (Fix 3: no colapsar a TEXT si el contenedor tiene caja). */
		borderTopWidth?: string;
		borderStyle?: string;
		boxShadow?: string;
	};
	children: DomSnapshotNode[];
}

// ─── Contrato del árbol de Figma (lo que consume la fase de creación) ────────

export interface FigmaColor {
	r: number;
	g: number;
	b: number;
	a: number;
}

export interface FigmaTreeNode {
	type: "FRAME" | "TEXT";
	/** nombre de capa: data-component (category/role/variant) o nombre semántico */
	name: string;
	width: number;
	height: number;
	/** solo FRAME: Auto-Layout */
	layoutMode?: "HORIZONTAL" | "VERTICAL" | "NONE";
	itemSpacing?: number;
	paddingTop?: number;
	paddingRight?: number;
	paddingBottom?: number;
	paddingLeft?: number;
	primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
	counterAxisAlignItems?: "MIN" | "CENTER" | "MAX";
	fills?: Array<{ type: "SOLID"; color: FigmaColor }>;
	cornerRadius?: number;
	/** solo TEXT */
	characters?: string;
	fontSize?: number;
	fontWeight?: number;
	fontFamily?: string;
	/** (Fix 4) sugerencia de fuente cargable si `fontFamily` no es estándar; pista para el creador. */
	fontFallback?: string;
	/** marca de que el nombre viene del contrato (category/role/variant) */
	fromContract?: boolean;
	children?: FigmaTreeNode[];
}

export interface CaptureResult {
	source: "live";
	url?: string;
	tree: FigmaTreeNode;
	stats: { nodes: number; contractNamed: number; textNodes: number };
}

/** Request interceptada por puppeteer (estructural: solo lo que usamos para validar/abortar). */
export interface InterceptedRequest {
	url(): string;
	continue(): Promise<unknown>;
	abort(reason?: string): Promise<unknown>;
}

/** Página headless mínima que necesitamos (estructural, evita acoplar puppeteer-core vs @cloudflare/puppeteer). */
export interface CapturePage {
	goto(url: string, opts?: unknown): Promise<unknown>;
	setContent(html: string, opts?: unknown): Promise<unknown>;
	setViewport?(vp: { width: number; height: number; deviceScaleFactor?: number }): Promise<unknown>;
	evaluate<T>(fn: () => T): Promise<T>;
	/** Opcional: activa la interceptación de requests (defensa SSRF sobre subrecursos/redirects). */
	setRequestInterception?(enabled: boolean): Promise<unknown>;
	/** Opcional: registra un listener de eventos de la página (usamos "request"). */
	on?(event: string, handler: (req: InterceptedRequest) => void): unknown;
}

/**
 * Resuelve un hostname a sus IPs (A/AAAA). Se inyecta desde el entry-point que sí
 * tiene DNS (Node/local); en entornos sin resolver (p. ej. Cloudflare Workers) se
 * omite y la validación se apoya solo en el chequeo de esquema + literal de host.
 */
export type HostResolver = (hostname: string) => Promise<string[]>;

export interface CaptureSecurityOptions {
	/** Resolver DNS inyectado para bloquear rebinding (dominio → IP interna). */
	resolveHost?: HostResolver;
}

// ─── Helpers puros ───────────────────────────────────────────────────────────

/** Convierte px CSS ("16px", "16", "1.5px") a número. Devuelve 0 si no parsea. */
export function pxToNumber(value: string | undefined): number {
	if (!value) return 0;
	const m = /(-?\d*\.?\d+)/.exec(value);
	return m ? parseFloat(m[1]) : 0;
}

/**
 * Parsea un color CSS (rgb/rgba/#hex/#hex8) a {r,g,b,a} normalizado 0..1.
 * Devuelve null para transparent / valores no parseables (para no pintar fill).
 */
export function parseColor(css: string | undefined): FigmaColor | null {
	if (!css) return null;
	const s = css.trim().toLowerCase();
	if (s === "transparent" || s === "none") return null;

	const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(s);
	if (rgbMatch) {
		const parts = rgbMatch[1].split(",").map((p) => p.trim());
		if (parts.length < 3) return null;
		const r = parseFloat(parts[0]) / 255;
		const g = parseFloat(parts[1]) / 255;
		const b = parseFloat(parts[2]) / 255;
		const a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
		if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
		if (a === 0) return null; // totalmente transparente → sin fill
		return { r, g, b, a };
	}

	const hex = s.startsWith("#") ? s.slice(1) : null;
	if (hex && (hex.length === 3 || hex.length === 6 || hex.length === 8)) {
		const expand = (h: string) =>
			h.length === 3
				? h
						.split("")
						.map((c) => c + c)
						.join("")
				: h;
		const full = expand(hex.length === 8 ? hex.slice(0, 6) : hex);
		const r = parseInt(full.slice(0, 2), 16) / 255;
		const g = parseInt(full.slice(2, 4), 16) / 255;
		const b = parseInt(full.slice(4, 6), 16) / 255;
		const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
		if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
		if (a === 0) return null;
		return { r, g, b, a };
	}

	return null;
}

/** display + flex-direction → layoutMode de Figma. */
export function resolveLayoutMode(styles: DomSnapshotNode["styles"]): "HORIZONTAL" | "VERTICAL" | "NONE" {
	const display = styles.display || "";
	if (display === "flex" || display === "inline-flex") {
		const dir = styles.flexDirection || "row";
		return dir.startsWith("column") ? "VERTICAL" : "HORIZONTAL";
	}
	if (display === "grid" || display === "inline-grid") {
		// Aproximación: grid → columna (apilado vertical) para conservar orden legible.
		return "VERTICAL";
	}
	return "NONE";
}

function mapJustify(v: string | undefined): FigmaTreeNode["primaryAxisAlignItems"] {
	switch (v) {
		case "center":
			return "CENTER";
		case "flex-end":
		case "end":
			return "MAX";
		case "space-between":
			return "SPACE_BETWEEN";
		default:
			return "MIN";
	}
}

function mapAlign(v: string | undefined): FigmaTreeNode["counterAxisAlignItems"] {
	switch (v) {
		case "center":
			return "CENTER";
		case "flex-end":
		case "end":
			return "MAX";
		default:
			return "MIN";
	}
}

/** Nombre de capa semántico cuando no hay data-component. */
export function semanticName(node: DomSnapshotNode): string {
	if (node.dataComponent) return node.dataComponent;
	if (node.role) return node.role;
	const tagNames: Record<string, string> = {
		button: "button",
		a: "link",
		nav: "nav",
		header: "header",
		footer: "footer",
		main: "main",
		section: "section",
		article: "article",
		aside: "aside",
		ul: "list",
		ol: "list",
		li: "list-item",
		h1: "heading",
		h2: "heading",
		h3: "heading",
		h4: "heading",
		img: "image",
		input: "input",
		form: "form",
	};
	return tagNames[node.tag] || node.tag || "frame";
}

// ─── Guardas de seguridad (SSRF / lectura de archivos locales) ───────────────

/** Esquemas de red permitidos. Todo lo demás (file:, data:, ftp:, blob:…) se rechaza. */
export const ALLOWED_URL_SCHEMES = ["http:", "https:"];

/**
 * ¿La IP (v4 o v6) cae en un rango privado / loopback / link-local?
 * Cubre: loopback, RFC1918, link-local (incl. metadatos 169.254.0.0/16 y fe80::/10),
 * ULA IPv6 (fc00::/7), unspecified y IPv4 mapeadas en IPv6 (::ffff:x.x.x.x).
 */
export function isPrivateIp(ip: string): boolean {
	const addr = ip.trim().toLowerCase();
	if (!addr) return false;

	// IPv4 mapeada en IPv6: ::ffff:10.0.0.1 → validar la parte v4 embebida.
	const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(addr);
	if (mapped) return isPrivateIp(mapped[1]);

	// IPv4
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) {
		const o = addr.split(".").map((n) => parseInt(n, 10));
		if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
		const [a, b] = o;
		if (a === 0) return true; // 0.0.0.0/8 (incluye unspecified)
		if (a === 10) return true; // 10.0.0.0/8
		if (a === 127) return true; // 127.0.0.0/8 loopback
		if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadatos
		if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
		if (a === 192 && b === 168) return true; // 192.168.0.0/16
		if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
		return false;
	}

	// IPv6
	if (addr.includes(":")) {
		if (addr === "::" || addr === "::1") return true; // unspecified / loopback
		if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // fc00::/7 ULA
		if (addr.startsWith("fe8") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb"))
			return true; // fe80::/10 link-local
		return false;
	}

	return false;
}

/**
 * ¿El hostname literal debe bloquearse sin resolver DNS?
 * Cubre nombres loopback conocidos e IPs literales privadas (v4/v6). No decide
 * sobre dominios normales — eso lo hace la resolución DNS en `assertUrlAllowed`.
 */
export function isBlockedHostname(hostname: string): boolean {
	let host = hostname.trim().toLowerCase();
	if (!host) return true;
	// Quita corchetes de IPv6 literal: [::1] → ::1
	host = host.replace(/^\[/, "").replace(/\]$/, "");
	if (host === "localhost" || host.endsWith(".localhost")) return true;
	if (host === "0.0.0.0" || host === "::" || host === "::1") return true;
	// Literal IP (v4 o v6): valídalo directo.
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
		return isPrivateIp(host);
	}
	return false;
}

/**
 * Valida una URL antes de navegar/cargar (defensa SSRF + lectura de archivos):
 *  1. Esquema en la allowlist (http/https).
 *  2. Host literal no loopback/privado.
 *  3. Si hay resolver DNS, resolver-entonces-verificar: si el dominio apunta a una
 *     IP interna se rechaza (previene DNS rebinding).
 * Lanza Error con motivo si la URL no pasa. No hace ninguna petición de red por sí sola.
 */
export async function assertUrlAllowed(rawUrl: string, resolveHost?: HostResolver): Promise<void> {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new Error(`URL inválida: ${rawUrl}`);
	}
	if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
		throw new Error(`Esquema no permitido: "${parsed.protocol}" (solo se admiten http/https).`);
	}
	const host = parsed.hostname;
	if (isBlockedHostname(host)) {
		throw new Error(`Host bloqueado (loopback/interno/metadatos): ${host}`);
	}
	if (resolveHost) {
		let ips: string[] = [];
		try {
			ips = await resolveHost(host.replace(/^\[/, "").replace(/\]$/, ""));
		} catch {
			// Si no resuelve, no fabricamos un veredicto: dejamos que la navegación falle
			// naturalmente. El chequeo literal ya cubrió las IPs privadas explícitas.
			ips = [];
		}
		const internal = ips.find((ip) => isPrivateIp(ip));
		if (internal) {
			throw new Error(`El host "${host}" resuelve a una IP interna (${internal}) — posible SSRF / DNS rebinding.`);
		}
	}
}

// ─── Conversión pura DOM snapshot → árbol de Figma ───────────────────────────

export interface ConvertOptions {
	/** ignora nodos con área < minArea px² (ruido). Default 4. */
	minArea?: number;
}

/**
 * Convierte un snapshot del DOM (con estilos computados) a un árbol de nodos de
 * Figma con Auto-Layout. Pura y determinista — no toca el navegador ni Figma.
 */
export function snapshotToFigmaTree(node: DomSnapshotNode, opts: ConvertOptions = {}): FigmaTreeNode | null {
	const minArea = opts.minArea ?? 4;
	const area = node.rect.width * node.rect.height;
	const isText = typeof node.text === "string" && node.text.trim().length > 0 && node.children.length === 0;

	// Nodos sin área y sin texto no aportan (display:none, colapsados).
	if (area < minArea && !isText) {
		// Aún así puede tener hijos con área (nodo contenedor de tamaño 0 raro): recúrsalos.
		const kids = node.children.map((c) => snapshotToFigmaTree(c, opts)).filter((x): x is FigmaTreeNode => x !== null);
		if (kids.length === 0) return null;
		if (kids.length === 1) return kids[0];
	}

	const name = semanticName(node);
	const fromContract = Boolean(node.dataComponent);

	if (isText) {
		// (Fix 3) Solo colapsar a TEXT puro si el elemento NO tiene estilo de caja.
		// Si lo tiene (chip con fondo/padding/radius/borde/sombra), se conserva como
		// FRAME con el texto de hijo para no perder fill/padding/cornerRadius/stroke.
		if (!hasBoxStyle(node.styles)) {
			return buildTextNode(node, true);
		}
		const boxLayout = resolveLayoutMode(node.styles);
		const boxFrame: FigmaTreeNode = {
			type: "FRAME",
			name, // conserva data-component en el FRAME, no en el texto
			width: Math.round(node.rect.width),
			height: Math.round(node.rect.height),
			// Si el display no era flex/grid, damos Auto-Layout horizontal para que el
			// padding aplique (en Figma el padding requiere Auto-Layout).
			layoutMode: boxLayout === "NONE" ? "HORIZONTAL" : boxLayout,
			fromContract,
		};
		applyPaddingAndAlign(boxFrame, node.styles);
		applyFillAndRadius(boxFrame, node.styles);
		boxFrame.children = [buildTextNode(node, false)];
		return boxFrame;
	}

	const layoutMode = resolveLayoutMode(node.styles);
	const frame: FigmaTreeNode = {
		type: "FRAME",
		name,
		width: Math.round(node.rect.width),
		height: Math.round(node.rect.height),
		layoutMode,
		fromContract,
	};

	if (layoutMode !== "NONE") {
		frame.itemSpacing = pxToNumber(node.styles.gap);
		// (Fix 2) Sin gap pero con margen uniforme entre hijos → deriva itemSpacing.
		// Si los márgenes no son uniformes se conserva 0 (no fabricamos un valor único).
		if (frame.itemSpacing === 0) {
			const fromMargins = deriveItemSpacingFromMargins(node.children, layoutMode);
			if (fromMargins > 0) frame.itemSpacing = fromMargins;
		}
		applyPaddingAndAlign(frame, node.styles);
	}

	applyFillAndRadius(frame, node.styles);

	const children = node.children
		.map((c) => snapshotToFigmaTree(c, opts))
		.filter((x): x is FigmaTreeNode => x !== null);
	if (children.length > 0) frame.children = children;

	return frame;
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Construye un nodo TEXT desde una hoja de texto. `useContractName` conserva el data-component como nombre. */
function buildTextNode(node: DomSnapshotNode, useContractName: boolean): FigmaTreeNode {
	const color = parseColor(node.styles.color);
	const family = firstFontFamily(node.styles.fontFamily);
	const characters = (node.text ?? "").trim();
	const textNode: FigmaTreeNode = {
		type: "TEXT",
		name: useContractName && node.dataComponent ? node.dataComponent : `text: ${truncate(characters, 24)}`,
		width: Math.round(node.rect.width),
		height: Math.round(node.rect.height),
		characters,
		fontSize: pxToNumber(node.styles.fontSize) || 16,
		fontWeight: pxToNumber(node.styles.fontWeight) || 400,
		fontFamily: family,
		fromContract: useContractName && Boolean(node.dataComponent),
	};
	// (Fix 4) Marca fuente no estándar para que el creador aplique fallback.
	if (isNonStandardFont(family)) textNode.fontFallback = FONT_FALLBACK;
	if (color) textNode.fills = [{ type: "SOLID", color }];
	return textNode;
}

/** Aplica padding + alineación de Auto-Layout desde los estilos. */
function applyPaddingAndAlign(frame: FigmaTreeNode, styles: DomSnapshotNode["styles"]): void {
	frame.paddingTop = pxToNumber(styles.paddingTop);
	frame.paddingRight = pxToNumber(styles.paddingRight);
	frame.paddingBottom = pxToNumber(styles.paddingBottom);
	frame.paddingLeft = pxToNumber(styles.paddingLeft);
	frame.primaryAxisAlignItems = mapJustify(styles.justifyContent);
	frame.counterAxisAlignItems = mapAlign(styles.alignItems);
}

/** Aplica fill de fondo + cornerRadius desde los estilos. */
function applyFillAndRadius(frame: FigmaTreeNode, styles: DomSnapshotNode["styles"]): void {
	const bg = parseColor(styles.backgroundColor);
	if (bg) frame.fills = [{ type: "SOLID", color: bg }];
	const radius = pxToNumber(styles.borderRadius);
	if (radius > 0) frame.cornerRadius = radius;
}

function firstFontFamily(family: string | undefined): string {
	if (!family) return "Inter";
	return family.split(",")[0].replace(/["']/g, "").trim() || "Inter";
}

/**
 * (Fix 4) Fuentes que asumimos disponibles/mapeables en Figma sin fallback. Si la
 * fuente capturada no está aquí, marcamos `fontFallback: "Inter"` como pista para
 * la fase de creación (que igual debe envolver loadFontAsync en try/catch).
 */
const SAFE_FONTS = new Set([
	"inter",
	"roboto",
	"arial",
	"helvetica",
	"helvetica neue",
	"sans-serif",
	"serif",
	"system-ui",
	"-apple-system",
	"segoe ui",
	"georgia",
	"times new roman",
	"courier new",
	"monospace",
	"ui-sans-serif",
	"ui-serif",
	"ui-monospace",
]);

/** Fuente por defecto para el fallback de creación. */
export const FONT_FALLBACK = "Inter";

/** ¿La familia (primera del stack) es no estándar y conviene marcar fallback? */
export function isNonStandardFont(family: string): boolean {
	return !SAFE_FONTS.has(family.trim().toLowerCase());
}

/**
 * (Fix 3) ¿El elemento tiene estilo de caja? Si lo tiene, NO debe colapsarse a un
 * TEXT puro aunque su único contenido sea texto: perdería fill/padding/radius/borde.
 */
function hasBoxStyle(styles: DomSnapshotNode["styles"]): boolean {
	if (parseColor(styles.backgroundColor)) return true;
	if (pxToNumber(styles.borderRadius) > 0) return true;
	if (
		pxToNumber(styles.paddingTop) > 0 ||
		pxToNumber(styles.paddingRight) > 0 ||
		pxToNumber(styles.paddingBottom) > 0 ||
		pxToNumber(styles.paddingLeft) > 0
	) {
		return true;
	}
	if (pxToNumber(styles.borderTopWidth) > 0 && styles.borderStyle && styles.borderStyle !== "none") return true;
	if (styles.boxShadow && styles.boxShadow !== "none") return true;
	return false;
}

/**
 * (Fix 2) Cuando `gap` es 0 pero los hijos se separan con un margen uniforme en el
 * eje principal (margin-right en fila, margin-bottom en columna), deriva el
 * itemSpacing de ese margen. El margen colapsado del último hijo no separa nada,
 * así que solo miramos los primeros n-1. Si los márgenes no son uniformes devuelve
 * 0 (no inventamos un único itemSpacing) — ver nota en el sitio de llamada.
 */
export function deriveItemSpacingFromMargins(
	children: DomSnapshotNode[],
	layoutMode: "HORIZONTAL" | "VERTICAL",
): number {
	if (children.length < 2) return 0;
	const trailing = layoutMode === "HORIZONTAL" ? "marginRight" : "marginBottom";
	const leading = layoutMode === "HORIZONTAL" ? "marginLeft" : "marginTop";

	const uniformValue = (values: number[]): number => {
		if (values.length === 0 || values.some((v) => v <= 0)) return 0;
		return values.every((v) => v === values[0]) ? values[0] : 0;
	};

	// Preferimos el margen "trailing" de los primeros n-1 hijos.
	const fromTrailing = uniformValue(children.slice(0, -1).map((c) => pxToNumber(c.styles[trailing])));
	if (fromTrailing > 0) return fromTrailing;

	// Fallback: margen "leading" de los últimos n-1 hijos.
	return uniformValue(children.slice(1).map((c) => pxToNumber(c.styles[leading])));
}

/** Cuenta nodos y cuántos conservan nombre de contrato — para el reporte de aceptación. */
export function treeStats(node: FigmaTreeNode): CaptureResult["stats"] {
	let nodes = 0;
	let contractNamed = 0;
	let textNodes = 0;
	const walk = (n: FigmaTreeNode) => {
		nodes++;
		if (n.fromContract) contractNamed++;
		if (n.type === "TEXT") textNodes++;
		n.children?.forEach(walk);
	};
	walk(node);
	return { nodes, contractNamed, textNodes };
}

// ─── Script de captura in-browser (page.evaluate) ────────────────────────────

/**
 * Corre DENTRO del navegador. Recorre el DOM visible desde <body> y devuelve un
 * DomSnapshotNode. Debe ser autocontenido (sin refs externas): page.evaluate lo
 * serializa. Filtra nodos ocultos y colapsa nodos de texto en su contenedor.
 */
export const LIVE_CAPTURE_SCRIPT = function captureDom(): DomSnapshotNode {
	// Corre en el navegador: document/window vienen de globalThis. Tipos laxos
	// a propósito — la lib DOM no está disponible en el build de Node del server.
	const g = globalThis as any;

	function isHidden(el: any, cs: any): boolean {
		if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return true;
		const r = el.getBoundingClientRect();
		return r.width === 0 && r.height === 0;
	}

	function directText(el: any): string {
		let t = "";
		el.childNodes.forEach((n: any) => {
			if (n.nodeType === 3) t += n.textContent || "";
		});
		return t.trim();
	}

	function walk(el: any): DomSnapshotNode | null {
		const cs = g.getComputedStyle(el);
		if (isHidden(el, cs)) return null;
		const r = el.getBoundingClientRect();
		const childEls = Array.from(el.children) as any[];
		const children: DomSnapshotNode[] = [];
		for (const child of childEls) {
			const c = walk(child);
			if (c) children.push(c);
		}
		const ownText = children.length === 0 ? directText(el) : "";
		const node: DomSnapshotNode = {
			tag: el.tagName.toLowerCase(),
			rect: { x: r.x, y: r.y, width: r.width, height: r.height },
			styles: {
				display: cs.display,
				flexDirection: cs.flexDirection,
				gap: cs.gap || cs.columnGap,
				paddingTop: cs.paddingTop,
				paddingRight: cs.paddingRight,
				paddingBottom: cs.paddingBottom,
				paddingLeft: cs.paddingLeft,
				backgroundColor: cs.backgroundColor,
				color: cs.color,
				borderRadius: cs.borderTopLeftRadius,
				fontSize: cs.fontSize,
				fontWeight: cs.fontWeight,
				fontFamily: cs.fontFamily,
				justifyContent: cs.justifyContent,
				alignItems: cs.alignItems,
				marginTop: cs.marginTop,
				marginRight: cs.marginRight,
				marginBottom: cs.marginBottom,
				marginLeft: cs.marginLeft,
				borderTopWidth: cs.borderTopWidth,
				borderStyle: cs.borderTopStyle,
				boxShadow: cs.boxShadow,
			},
			children,
		};
		const dc = el.getAttribute("data-component");
		if (dc) node.dataComponent = dc;
		const role = el.getAttribute("role");
		if (role) node.role = role;
		if (ownText) node.text = ownText;
		return node;
	}

	const root = walk(g.document.body);
	return (
		root || {
			tag: "body",
			rect: { x: 0, y: 0, width: 0, height: 0 },
			styles: {},
			children: [],
		}
	);
};

// ─── Orquestador ─────────────────────────────────────────────────────────────

export interface CaptureInput {
	url?: string;
	html?: string;
	viewport?: { width: number; height: number };
}

/**
 * Renderiza el input (URL o HTML) en `page`, extrae el snapshot y lo convierte a
 * árbol de Figma. La página se inyecta (DI) para no acoplar el manager concreto.
 */
export async function captureLiveHtml(
	input: CaptureInput,
	page: CapturePage,
	security: CaptureSecurityOptions = {},
): Promise<CaptureResult> {
	if (!input.url && !input.html) {
		throw new Error("captureLiveHtml requiere `url` o `html`.");
	}

	// (Fix 1) Validación SSRF/archivos locales ANTES de cualquier navegación.
	if (input.url) {
		await assertUrlAllowed(input.url, security.resolveHost);
	}

	// (Fix 1) Interceptar TODAS las requests: aplica la misma validación de esquema+host
	// a subrecursos y a redirects (un host permitido puede hacer 302 a uno interno).
	if (typeof page.setRequestInterception === "function" && typeof page.on === "function") {
		await page.setRequestInterception(true);
		page.on("request", (req: InterceptedRequest) => {
			assertUrlAllowed(req.url(), security.resolveHost)
				.then(() => req.continue())
				.catch(() => req.abort("blockedbyclient"))
				// Nunca dejar la request colgada si algo revienta al abortar/continuar.
				.catch(() => {});
		});
	}

	if (page.setViewport && input.viewport) {
		await page.setViewport({ ...input.viewport, deviceScaleFactor: 1 });
	}
	if (input.url) {
		await page.goto(input.url, { waitUntil: "networkidle2", timeout: 30000 });
	} else {
		await page.setContent(input.html as string, { waitUntil: "networkidle2", timeout: 30000 });
	}
	const snapshot = await page.evaluate(LIVE_CAPTURE_SCRIPT);
	const tree = snapshotToFigmaTree(snapshot);
	if (!tree) {
		throw new Error("La captura no produjo nodos visibles.");
	}
	return { source: "live", url: input.url, tree, stats: treeStats(tree) };
}
