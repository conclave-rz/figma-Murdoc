/**
 * html-to-figma tools
 *
 * Registra la tool MCP `figma_capture_html`: captura viva de una URL/HTML real
 * renderizada en un navegador headless, devuelta como árbol de Figma con
 * Auto-Layout (nombres category/role/variant conservados). El skill html-to-figma
 * consume ese árbol para emitir nodos vía figma_execute.
 *
 * Si no hay navegador disponible (p.ej. modo sin browser), la tool responde con
 * una instrucción para usar el parser estático (fallback) en vez de fallar.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createChildLogger } from "./logger.js";
import { captureLiveHtml, type CapturePage, type CaptureResult } from "./html-to-figma-capture.js";

const logger = createChildLogger({ component: "html-to-figma" });

/** Provee una página headless fresca (aislada de la que maneja Figma). null si no hay browser. */
export type FreshPageProvider = () => Promise<CapturePage | null>;

export function registerHtmlToFigmaTools(server: McpServer, getFreshPage: FreshPageProvider): void {
	server.tool(
		"figma_capture_html",
		"Live capture: renders a real URL or HTML string in a headless browser and returns a Figma node tree with Auto-Layout, preserving layer names from the `data-component` (category/role/variant) attribute. Higher fidelity than the static parser. If no browser is available, returns guidance to use the static parser fallback (html-to-figma skill). Feed the returned tree to figma_execute to create the layers.",
		{
			url: z.string().url().optional().describe("URL en vivo a renderizar y capturar."),
			html: z.string().optional().describe("Cadena HTML a renderizar (alternativa a url)."),
			viewportWidth: z.number().int().positive().optional().describe("Ancho del viewport (default 1440)."),
			viewportHeight: z.number().int().positive().optional().describe("Alto del viewport (default 900)."),
		},
		async ({
			url,
			html,
			viewportWidth,
			viewportHeight,
		}: {
			url?: string;
			html?: string;
			viewportWidth?: number;
			viewportHeight?: number;
		}) => {
			if (!url && !html) {
				return {
					content: [{ type: "text" as const, text: "Debes pasar `url` o `html`." }],
					isError: true,
				};
			}

			let page: CapturePage | null = null;
			try {
				page = await getFreshPage();
			} catch (err) {
				logger.warn({ err }, "No se pudo abrir página headless");
			}

			if (!page) {
				return {
					content: [
						{
							type: "text" as const,
							text:
								"No hay navegador headless disponible para la captura viva. " +
								"Fallback: usa el parser estático del skill html-to-figma " +
								"(scripts/html_parser.py) sobre el HTML/CSS de origen.",
						},
					],
				};
			}

			try {
				const result: CaptureResult = await captureLiveHtml(
					{
						url,
						html,
						viewport: {
							width: viewportWidth ?? 1440,
							height: viewportHeight ?? 900,
						},
					},
					page,
				);
				logger.info({ url, stats: result.stats }, "Captura viva completada");
				return {
					content: [
						{
							type: "text" as const,
							text:
								`Captura viva OK (${result.stats.nodes} nodos, ` +
								`${result.stats.contractNamed} con nombre de contrato, ` +
								`${result.stats.textNodes} de texto).\n\n` +
								`Árbol de Figma (Auto-Layout) — pásalo a figma_execute:\n\n` +
								"```json\n" +
								JSON.stringify(result, null, 2) +
								"\n```",
						},
					],
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				logger.error({ err }, "Captura viva falló");
				return {
					content: [
						{
							type: "text" as const,
							text: `Captura viva falló: ${msg}\nFallback: usa el parser estático (html_parser.py).`,
						},
					],
					isError: true,
				};
			} finally {
				// Cerrar la página aislada si expone close (no rompe la sesión de Figma).
				const maybeClose = (page as unknown as { close?: () => Promise<unknown> }).close;
				if (typeof maybeClose === "function") {
					try {
						await maybeClose.call(page);
					} catch {
						/* noop */
					}
				}
			}
		},
	);
}
