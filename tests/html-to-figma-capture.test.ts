/**
 * Tests para la captura viva de html-to-figma (módulo puro, sin navegador).
 * Cubre parseo de color/px, mapeo de layout, conservación de nombres de contrato
 * (category/role/variant) y la conversión DOM snapshot → árbol de Figma.
 */

import {
	parseColor,
	pxToNumber,
	resolveLayoutMode,
	semanticName,
	snapshotToFigmaTree,
	treeStats,
	captureLiveHtml,
	isPrivateIp,
	isBlockedHostname,
	assertUrlAllowed,
	isNonStandardFont,
	deriveItemSpacingFromMargins,
	FONT_FALLBACK,
	type DomSnapshotNode,
	type CapturePage,
} from '../src/core/html-to-figma-capture';

function node(partial: Partial<DomSnapshotNode>): DomSnapshotNode {
	return {
		tag: partial.tag ?? 'div',
		rect: partial.rect ?? { x: 0, y: 0, width: 100, height: 40 },
		styles: partial.styles ?? {},
		children: partial.children ?? [],
		...partial,
	};
}

describe('pxToNumber', () => {
	it('parsea px, números y decimales', () => {
		expect(pxToNumber('16px')).toBe(16);
		expect(pxToNumber('1.5px')).toBe(1.5);
		expect(pxToNumber('24')).toBe(24);
		expect(pxToNumber(undefined)).toBe(0);
		expect(pxToNumber('auto')).toBe(0);
	});
});

describe('parseColor', () => {
	it('parsea rgb y rgba normalizando 0..1', () => {
		expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
		const c = parseColor('rgba(0, 0, 0, 0.5)')!;
		expect(c.a).toBeCloseTo(0.5);
	});
	it('parsea hex de 3, 6 y 8 dígitos', () => {
		expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
		expect(parseColor('#4F46E5')).toEqual({
			r: 0x4f / 255,
			g: 0x46 / 255,
			b: 0xe5 / 255,
			a: 1,
		});
	});
	it('devuelve null para transparente o no parseable', () => {
		expect(parseColor('transparent')).toBeNull();
		expect(parseColor('rgba(0,0,0,0)')).toBeNull();
		expect(parseColor(undefined)).toBeNull();
		expect(parseColor('blueish')).toBeNull();
	});
});

describe('resolveLayoutMode', () => {
	it('flex row → HORIZONTAL, flex column → VERTICAL', () => {
		expect(resolveLayoutMode({ display: 'flex', flexDirection: 'row' })).toBe('HORIZONTAL');
		expect(resolveLayoutMode({ display: 'flex', flexDirection: 'column' })).toBe('VERTICAL');
		expect(resolveLayoutMode({ display: 'block' })).toBe('NONE');
	});
});

describe('semanticName', () => {
	it('prioriza data-component (category/role/variant)', () => {
		expect(semanticName(node({ dataComponent: 'action/button/primary', tag: 'button' }))).toBe(
			'action/button/primary',
		);
	});
	it('cae a nombre semántico por tag cuando no hay contrato', () => {
		expect(semanticName(node({ tag: 'button' }))).toBe('button');
		expect(semanticName(node({ tag: 'h1' }))).toBe('heading');
	});
});

describe('snapshotToFigmaTree', () => {
	it('mapea flex a Auto-Layout con gap/padding', () => {
		const tree = snapshotToFigmaTree(
			node({
				tag: 'div',
				styles: {
					display: 'flex',
					flexDirection: 'column',
					gap: '12px',
					paddingTop: '16px',
					paddingRight: '16px',
					paddingBottom: '16px',
					paddingLeft: '16px',
					backgroundColor: 'rgb(255,255,255)',
					borderRadius: '10px',
				},
				children: [node({ tag: 'span', rect: { x: 0, y: 0, width: 50, height: 20 }, text: 'Hola' })],
			}),
		)!;
		expect(tree.type).toBe('FRAME');
		expect(tree.layoutMode).toBe('VERTICAL');
		expect(tree.itemSpacing).toBe(12);
		expect(tree.paddingLeft).toBe(16);
		expect(tree.cornerRadius).toBe(10);
		expect(tree.fills?.[0].color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
		expect(tree.children).toHaveLength(1);
		expect(tree.children![0].type).toBe('TEXT');
		expect(tree.children![0].characters).toBe('Hola');
	});

	it('CONSERVA el nombre category/role/variant del data-component (aceptación)', () => {
		const tree = snapshotToFigmaTree(
			node({
				tag: 'button',
				dataComponent: 'action/button/primary',
				styles: { display: 'flex', backgroundColor: '#4F46E5' },
				children: [node({ tag: 'span', rect: { x: 0, y: 0, width: 40, height: 16 }, text: 'Enviar' })],
			}),
		)!;
		expect(tree.name).toBe('action/button/primary');
		expect(tree.fromContract).toBe(true);
	});

	it('descarta nodos ocultos / de área ~0 sin texto', () => {
		const tree = snapshotToFigmaTree(
			node({
				tag: 'div',
				rect: { x: 0, y: 0, width: 200, height: 100 },
				styles: { display: 'flex' },
				children: [
					node({ tag: 'span', rect: { x: 0, y: 0, width: 0, height: 0 } }),
					node({ tag: 'span', rect: { x: 0, y: 0, width: 30, height: 20 }, text: 'ok' }),
				],
			}),
		)!;
		expect(tree.children).toHaveLength(1);
		expect(tree.children![0].characters).toBe('ok');
	});

	it('treeStats cuenta nodos, contract-named y textos', () => {
		const tree = snapshotToFigmaTree(
			node({
				dataComponent: 'layout/card/default',
				styles: { display: 'flex' },
				children: [node({ tag: 'p', rect: { x: 0, y: 0, width: 80, height: 16 }, text: 'texto' })],
			}),
		)!;
		const stats = treeStats(tree);
		expect(stats.nodes).toBe(2);
		expect(stats.contractNamed).toBe(1);
		expect(stats.textNodes).toBe(1);
	});
});

describe('captureLiveHtml', () => {
	const fakeSnapshot: DomSnapshotNode = {
		tag: 'body',
		dataComponent: 'layout/page/default',
		rect: { x: 0, y: 0, width: 1440, height: 900 },
		styles: { display: 'flex', flexDirection: 'column', gap: '8px' },
		children: [{ tag: 'h1', rect: { x: 0, y: 0, width: 300, height: 40 }, styles: {}, children: [], text: 'Título' }],
	};

	function makePage(): CapturePage & { calls: string[] } {
		const calls: string[] = [];
		return {
			calls,
			async goto(url: string) {
				calls.push(`goto:${url}`);
			},
			async setContent() {
				calls.push('setContent');
			},
			async setViewport() {
				calls.push('setViewport');
			},
			async evaluate<T>(_fn: () => T): Promise<T> {
				calls.push('evaluate');
				return fakeSnapshot as unknown as T;
			},
		};
	}

	it('renderiza una URL y devuelve árbol con nombres conservados', async () => {
		const page = makePage();
		const result = await captureLiveHtml({ url: 'https://example.com', viewport: { width: 1440, height: 900 } }, page);
		expect(result.source).toBe('live');
		expect(page.calls).toContain('goto:https://example.com');
		expect(result.tree.name).toBe('layout/page/default');
		expect(result.tree.layoutMode).toBe('VERTICAL');
		expect(result.stats.contractNamed).toBeGreaterThanOrEqual(1);
	});

	it('renderiza HTML por setContent cuando no hay url', async () => {
		const page = makePage();
		const result = await captureLiveHtml({ html: '<body></body>' }, page);
		expect(page.calls).toContain('setContent');
		expect(result.tree).toBeDefined();
	});

	it('lanza si no hay url ni html', async () => {
		const page = makePage();
		await expect(captureLiveHtml({}, page)).rejects.toThrow(/url.*html/i);
	});
});

// ─── Fix 1 · SSRF / lectura de archivos locales ──────────────────────────────

describe('isPrivateIp', () => {
	it('detecta rangos IPv4 privados / loopback / link-local', () => {
		expect(isPrivateIp('127.0.0.1')).toBe(true);
		expect(isPrivateIp('10.0.0.1')).toBe(true);
		expect(isPrivateIp('192.168.1.1')).toBe(true);
		expect(isPrivateIp('172.16.0.1')).toBe(true);
		expect(isPrivateIp('172.31.255.255')).toBe(true);
		expect(isPrivateIp('169.254.169.254')).toBe(true); // metadatos cloud
		expect(isPrivateIp('0.0.0.0')).toBe(true);
	});
	it('deja pasar IPv4 públicas', () => {
		expect(isPrivateIp('8.8.8.8')).toBe(false);
		expect(isPrivateIp('172.32.0.1')).toBe(false);
		expect(isPrivateIp('93.184.216.34')).toBe(false);
	});
	it('detecta IPv6 loopback / ULA / link-local y IPv4 mapeadas', () => {
		expect(isPrivateIp('::1')).toBe(true);
		expect(isPrivateIp('fc00::1')).toBe(true);
		expect(isPrivateIp('fe80::1')).toBe(true);
		expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
		expect(isPrivateIp('2001:4860:4860::8888')).toBe(false);
	});
});

describe('isBlockedHostname', () => {
	it('bloquea loopback e IPs privadas literales', () => {
		expect(isBlockedHostname('localhost')).toBe(true);
		expect(isBlockedHostname('foo.localhost')).toBe(true);
		expect(isBlockedHostname('127.0.0.1')).toBe(true);
		expect(isBlockedHostname('169.254.169.254')).toBe(true);
		expect(isBlockedHostname('[::1]')).toBe(true);
	});
	it('deja pasar dominios normales y IPs públicas', () => {
		expect(isBlockedHostname('example.com')).toBe(false);
		expect(isBlockedHostname('8.8.8.8')).toBe(false);
	});
});

describe('assertUrlAllowed', () => {
	it('rechaza file:// (lectura de archivos locales)', async () => {
		await expect(assertUrlAllowed('file:///etc/hosts')).rejects.toThrow(/esquema no permitido/i);
	});
	it('rechaza data: y ftp:', async () => {
		await expect(assertUrlAllowed('data:text/html,<h1>x</h1>')).rejects.toThrow(/esquema/i);
		await expect(assertUrlAllowed('ftp://example.com/x')).rejects.toThrow(/esquema/i);
	});
	it('rechaza metadatos, localhost e IPs privadas literales', async () => {
		await expect(assertUrlAllowed('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/bloqueado/i);
		await expect(assertUrlAllowed('http://localhost:3000')).rejects.toThrow(/bloqueado/i);
		await expect(assertUrlAllowed('http://10.0.0.1')).rejects.toThrow(/bloqueado/i);
	});
	it('rechaza un dominio que RESUELVE a IP interna (DNS rebinding)', async () => {
		const resolveHost = async () => ['127.0.0.1'];
		await expect(assertUrlAllowed('http://rebind.example.com', resolveHost)).rejects.toThrow(/rebinding|interna/i);
	});
	it('permite https público (resolviendo a IP pública)', async () => {
		const resolveHost = async () => ['93.184.216.34'];
		await expect(assertUrlAllowed('https://example.com', resolveHost)).resolves.toBeUndefined();
	});
});

describe('captureLiveHtml · guardas SSRF (no navega ante URL bloqueada)', () => {
	function makePage(): CapturePage & { calls: string[] } {
		const calls: string[] = [];
		return {
			calls,
			async goto(url: string) {
				calls.push(`goto:${url}`);
			},
			async setContent() {
				calls.push('setContent');
			},
			async setViewport() {
				calls.push('setViewport');
			},
			async evaluate<T>(_fn: () => T): Promise<T> {
				calls.push('evaluate');
				return {} as unknown as T;
			},
		};
	}

	it('file:///etc/hosts → rechazada SIN intentar navegar', async () => {
		const page = makePage();
		await expect(captureLiveHtml({ url: 'file:///etc/hosts' }, page)).rejects.toThrow(/esquema/i);
		expect(page.calls).toEqual([]);
	});

	it('http://169.254.169.254 → rechazada antes de navegar', async () => {
		const page = makePage();
		await expect(
			captureLiveHtml({ url: 'http://169.254.169.254/latest/meta-data/' }, page),
		).rejects.toThrow(/bloqueado/i);
		expect(page.calls.some((c) => c.startsWith('goto'))).toBe(false);
	});

	it('dominio que resuelve a 127.0.0.1 → rechazado (rebinding), sin navegar', async () => {
		const page = makePage();
		const resolveHost = async () => ['127.0.0.1'];
		await expect(
			captureLiveHtml({ url: 'http://rebind.example.com' }, page, { resolveHost }),
		).rejects.toThrow(/rebinding|interna/i);
		expect(page.calls.some((c) => c.startsWith('goto'))).toBe(false);
	});
});

// ─── Fix 2 · itemSpacing derivado de margin uniforme ─────────────────────────

describe('Fix 2 · gap por margin', () => {
	it('deriva itemSpacing de margin-right uniforme cuando no hay gap (fila)', () => {
		const tree = snapshotToFigmaTree(
			node({
				tag: 'div',
				styles: { display: 'flex', flexDirection: 'row' },
				children: [
					node({ tag: 'span', rect: { x: 0, y: 0, width: 30, height: 20 }, text: 'a', styles: { marginRight: '12px' } }),
					node({ tag: 'span', rect: { x: 0, y: 0, width: 30, height: 20 }, text: 'b', styles: { marginRight: '12px' } }),
					node({ tag: 'span', rect: { x: 0, y: 0, width: 30, height: 20 }, text: 'c', styles: { marginRight: '12px' } }),
				],
			}),
		)!;
		expect(tree.itemSpacing).toBe(12);
	});

	it('no fabrica itemSpacing si los márgenes no son uniformes', () => {
		expect(
			deriveItemSpacingFromMargins(
				[
					node({ styles: { marginRight: '12px' } }),
					node({ styles: { marginRight: '8px' } }),
					node({ styles: { marginRight: '12px' } }),
				],
				'HORIZONTAL',
			),
		).toBe(0);
	});

	it('deriva margin-bottom en columna', () => {
		expect(
			deriveItemSpacingFromMargins(
				[node({ styles: { marginBottom: '16px' } }), node({ styles: { marginBottom: '16px' } })],
				'VERTICAL',
			),
		).toBe(16);
	});
});

// ─── Fix 3 · contenedor con estilo de caja no se colapsa a TEXT ───────────────

describe('Fix 3 · caja con texto → FRAME + TEXT hijo', () => {
	it('un chip con fondo/padding/radius queda FRAME con TEXT hijo, no texto suelto', () => {
		const tree = snapshotToFigmaTree(
			node({
				tag: 'div',
				dataComponent: 'data/stat/kpi',
				rect: { x: 0, y: 0, width: 120, height: 64 },
				text: 'Ventas',
				styles: {
					backgroundColor: '#FFFFFF',
					paddingTop: '16px',
					paddingRight: '16px',
					paddingBottom: '16px',
					paddingLeft: '16px',
					borderRadius: '10px',
				},
			}),
		)!;
		expect(tree.type).toBe('FRAME');
		expect(tree.name).toBe('data/stat/kpi');
		expect(tree.fromContract).toBe(true);
		expect(tree.fills?.[0].color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
		expect(tree.paddingLeft).toBe(16);
		expect(tree.cornerRadius).toBe(10);
		expect(tree.children).toHaveLength(1);
		expect(tree.children![0].type).toBe('TEXT');
		expect(tree.children![0].characters).toBe('Ventas');
	});

	it('texto SIN estilo de caja sigue colapsando a TEXT puro', () => {
		const tree = snapshotToFigmaTree(
			node({ tag: 'span', rect: { x: 0, y: 0, width: 40, height: 16 }, text: 'plano', styles: {} }),
		)!;
		expect(tree.type).toBe('TEXT');
		expect(tree.characters).toBe('plano');
	});
});

// ─── Fix 4 · fallback de fuente inexistente ──────────────────────────────────

describe('Fix 4 · fontFallback', () => {
	it('isNonStandardFont marca fuentes no estándar', () => {
		expect(isNonStandardFont('NonExistentFont123')).toBe(true);
		expect(isNonStandardFont('Inter')).toBe(false);
		expect(isNonStandardFont('roboto')).toBe(false);
	});

	it('un TEXT con fuente inexistente trae fontFallback = Inter', () => {
		const tree = snapshotToFigmaTree(
			node({
				tag: 'span',
				rect: { x: 0, y: 0, width: 60, height: 20 },
				text: 'hola',
				styles: { fontFamily: '"NonExistentFont123", sans-serif' },
			}),
		)!;
		expect(tree.type).toBe('TEXT');
		expect(tree.fontFamily).toBe('NonExistentFont123');
		expect(tree.fontFallback).toBe(FONT_FALLBACK);
	});

	it('un TEXT con fuente estándar no trae fontFallback', () => {
		const tree = snapshotToFigmaTree(
			node({ tag: 'span', rect: { x: 0, y: 0, width: 60, height: 20 }, text: 'hola', styles: { fontFamily: 'Inter' } }),
		)!;
		expect(tree.fontFallback).toBeUndefined();
	});
});
