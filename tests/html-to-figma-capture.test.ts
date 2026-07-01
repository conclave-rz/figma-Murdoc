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
