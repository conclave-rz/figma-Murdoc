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

/** Página headless mínima que necesitamos (estructural, evita acoplar puppeteer-core vs @cloudflare/puppeteer). */
export interface CapturePage {
	goto(url: string, opts?: unknown): Promise<unknown>;
	setContent(html: string, opts?: unknown): Promise<unknown>;
	setViewport?(vp: { width: number; height: number; deviceScaleFactor?: number }): Promise<unknown>;
	evaluate<T>(fn: () => T): Promise<T>;
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
		const color = parseColor(node.styles.color);
		const textNode: FigmaTreeNode = {
			type: "TEXT",
			name: node.dataComponent || `text: ${truncate(node.text!.trim(), 24)}`,
			width: Math.round(node.rect.width),
			height: Math.round(node.rect.height),
			characters: node.text!.trim(),
			fontSize: pxToNumber(node.styles.fontSize) || 16,
			fontWeight: pxToNumber(node.styles.fontWeight) || 400,
			fontFamily: firstFontFamily(node.styles.fontFamily),
			fromContract,
		};
		if (color) textNode.fills = [{ type: "SOLID", color }];
		return textNode;
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
		frame.paddingTop = pxToNumber(node.styles.paddingTop);
		frame.paddingRight = pxToNumber(node.styles.paddingRight);
		frame.paddingBottom = pxToNumber(node.styles.paddingBottom);
		frame.paddingLeft = pxToNumber(node.styles.paddingLeft);
		frame.primaryAxisAlignItems = mapJustify(node.styles.justifyContent);
		frame.counterAxisAlignItems = mapAlign(node.styles.alignItems);
	}

	const bg = parseColor(node.styles.backgroundColor);
	if (bg) frame.fills = [{ type: "SOLID", color: bg }];

	const radius = pxToNumber(node.styles.borderRadius);
	if (radius > 0) frame.cornerRadius = radius;

	const children = node.children
		.map((c) => snapshotToFigmaTree(c, opts))
		.filter((x): x is FigmaTreeNode => x !== null);
	if (children.length > 0) frame.children = children;

	return frame;
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n)}…` : s;
}

function firstFontFamily(family: string | undefined): string {
	if (!family) return "Inter";
	return family.split(",")[0].replace(/["']/g, "").trim() || "Inter";
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
export async function captureLiveHtml(input: CaptureInput, page: CapturePage): Promise<CaptureResult> {
	if (!input.url && !input.html) {
		throw new Error("captureLiveHtml requiere `url` o `html`.");
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
