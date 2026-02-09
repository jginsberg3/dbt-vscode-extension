import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { Position, mockTextDocument, mockProjectManager } from './helpers/vscodeStubs';
import { parseManifest } from '../src/manifest/manifestParser';
import { DbtHoverProvider } from '../src/providers/hoverProvider';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'manifest.json');
const manifest = parseManifest(FIXTURE_PATH);

function getHover(line: string, cursorColumn: number, manifestOverride?: any) {
    const m = arguments.length >= 3 ? manifestOverride : manifest;
    const provider = new DbtHoverProvider(mockProjectManager(m));
    const doc = mockTextDocument([line]);
    const pos = new Position(0, cursorColumn);
    return provider.provideHover(doc as any, pos as any);
}

function hoverMarkdown(hover: any): string {
    return hover?.contents?.value ?? '';
}

describe('DbtHoverProvider', () => {
    describe('ref() hover', () => {
        it('returns hover when cursor is on a ref model name', () => {
            const hover = getHover("select * from {{ ref('customers') }}", 26);
            expect(hover).not.toBeNull();
        });

        it('includes the model name as a header', () => {
            const hover = getHover("{{ ref('customers') }}", 12);
            const md = hoverMarkdown(hover);
            expect(md).toContain('### customers');
        });

        it('includes the model description', () => {
            const hover = getHover("{{ ref('customers') }}", 12);
            const md = hoverMarkdown(hover);
            expect(md).toContain('Final customers table with order summaries');
        });

        it('includes materialization type', () => {
            const hover = getHover("{{ ref('customers') }}", 12);
            const md = hoverMarkdown(hover);
            expect(md).toContain('table');
        });

        it('includes database location', () => {
            const hover = getHover("{{ ref('customers') }}", 12);
            const md = hoverMarkdown(hover);
            expect(md).toContain('analytics');
            expect(md).toContain('public');
        });

        it('includes column table for models with columns', () => {
            const hover = getHover("{{ ref('customers') }}", 12);
            const md = hoverMarkdown(hover);
            expect(md).toContain('customer_id');
            expect(md).toContain('The primary key');
            expect(md).toContain('integer');
        });

        it('works with double quotes', () => {
            const hover = getHover('{{ ref("customers") }}', 12);
            expect(hover).not.toBeNull();
        });

        it('returns null when cursor is before ref()', () => {
            const hover = getHover("select * from {{ ref('customers') }}", 5);
            expect(hover).toBeNull();
        });

        it('returns null when cursor is after ref()', () => {
            const hover = getHover("{{ ref('customers') }} and more", 28);
            expect(hover).toBeNull();
        });

        it('returns null for unknown model', () => {
            const hover = getHover("{{ ref('nonexistent') }}", 14);
            expect(hover).toBeNull();
        });

        it('works with multiple refs on the same line', () => {
            const line = "{{ ref('customers') }} and {{ ref('stg_orders') }}";
            const hover1 = getHover(line, 12);
            const hover2 = getHover(line, 38);
            expect(hoverMarkdown(hover1)).toContain('### customers');
            expect(hoverMarkdown(hover2)).toContain('### stg_orders');
        });
    });

    describe('source() hover', () => {
        it('returns hover when cursor is on a source call', () => {
            const hover = getHover("{{ source('stripe', 'payments') }}", 15);
            expect(hover).not.toBeNull();
        });

        it('includes the source.table name as header', () => {
            const hover = getHover("{{ source('stripe', 'payments') }}", 15);
            const md = hoverMarkdown(hover);
            expect(md).toContain('### stripe.payments');
        });

        it('includes the source description', () => {
            const hover = getHover("{{ source('stripe', 'payments') }}", 15);
            const md = hoverMarkdown(hover);
            expect(md).toContain('Raw payment events from Stripe');
        });

        it('includes source column data', () => {
            const hover = getHover("{{ source('stripe', 'payments') }}", 15);
            const md = hoverMarkdown(hover);
            expect(md).toContain('payment_id');
            expect(md).toContain('Unique payment identifier');
        });

        it('returns null for unknown source', () => {
            const hover = getHover("{{ source('unknown', 'table') }}", 15);
            expect(hover).toBeNull();
        });

        it('returns null for unknown table in known source', () => {
            const hover = getHover("{{ source('stripe', 'nonexistent') }}", 15);
            expect(hover).toBeNull();
        });
    });

    describe('no manifest', () => {
        it('returns null when no manifest is loaded', () => {
            const hover = getHover("{{ ref('customers') }}", 12, null);
            expect(hover).toBeNull();
        });
    });
});
