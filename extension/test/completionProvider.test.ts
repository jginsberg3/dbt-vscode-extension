import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { Position, mockTextDocument, mockProjectManager } from './helpers/vscodeStubs';
import { parseManifest } from '../src/manifest/manifestParser';
import { DbtCompletionProvider } from '../src/providers/completionProvider';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'manifest.json');
const manifest = parseManifest(FIXTURE_PATH);

function getCompletions(line: string, cursorColumn: number) {
    const provider = new DbtCompletionProvider(mockProjectManager(manifest));
    const doc = mockTextDocument([line]);
    const pos = new Position(0, cursorColumn);
    return provider.provideCompletionItems(doc as any, pos as any);
}

describe('DbtCompletionProvider', () => {
    describe('ref() completions', () => {
        it('returns model names when cursor is inside ref(\'', () => {
            const result = getCompletions("{{ ref('", 8);
            expect(result).not.toBeNull();
            const labels = result!.items.map(i => i.label).sort();
            expect(labels).toEqual(['customers', 'revenue', 'stg_orders']);
        });

        it('returns model names with double quotes', () => {
            const result = getCompletions('{{ ref("', 8);
            expect(result).not.toBeNull();
            expect(result!.items.length).toBe(3);
        });

        it('returns model names when partially typed', () => {
            const result = getCompletions("{{ ref('cust", 12);
            expect(result).not.toBeNull();
            expect(result!.items.length).toBe(3); // all returned, VS Code filters
        });

        it('includes model details in completion items', () => {
            const result = getCompletions("{{ ref('", 8);
            const customers = result!.items.find(i => i.label === 'customers')!;
            expect(customers.detail).toBe('table model');
            expect(customers.filterText).toBe('customers');
            expect(customers.insertText).toBe('customers');
        });

        it('includes documentation with columns for models that have them', () => {
            const result = getCompletions("{{ ref('", 8);
            const customers = result!.items.find(i => i.label === 'customers')!;
            const docValue = (customers.documentation as any)?.value ?? '';
            expect(docValue).toContain('customer_id');
            expect(docValue).toContain('The primary key');
        });

        it('works without Jinja braces', () => {
            const result = getCompletions("select * from ref('", 19);
            expect(result).not.toBeNull();
            expect(result!.items.length).toBe(3);
        });

        it('works with spaces around the parenthesis', () => {
            const result = getCompletions("{{ ref( '", 9);
            expect(result).not.toBeNull();
            expect(result!.items.length).toBe(3);
        });

        it('sets replacement range covering only typed text', () => {
            const result = getCompletions("{{ ref('stg", 11);
            const item = result!.items[0];
            // Range should cover 'stg' (positions 8-11)
            expect((item.range as any).start.character).toBe(8);
            expect((item.range as any).end.character).toBe(11);
        });
    });

    describe('source() completions', () => {
        it('returns source names for first argument', () => {
            const result = getCompletions("{{ source('", 11);
            expect(result).not.toBeNull();
            const labels = result!.items.map(i => i.label).sort();
            expect(labels).toEqual(['hubspot', 'stripe']);
        });

        it('returns table names for second argument', () => {
            const result = getCompletions("{{ source('stripe', '", 21);
            expect(result).not.toBeNull();
            const labels = result!.items.map(i => i.label).sort();
            expect(labels).toEqual(['customers', 'payments']);
        });

        it('returns table names with double quotes', () => {
            const result = getCompletions('{{ source("stripe", "', 21);
            expect(result).not.toBeNull();
            expect(result!.items.length).toBe(2);
        });

        it('returns empty list for unknown source name', () => {
            const result = getCompletions("{{ source('unknown', '", 22);
            expect(result).not.toBeNull();
            expect(result!.items.length).toBe(0);
        });

        it('includes table description in detail', () => {
            const result = getCompletions("{{ source('stripe', '", 21);
            const payments = result!.items.find(i => i.label === 'payments')!;
            expect(payments.detail).toBe('Raw payment events from Stripe');
        });
    });

    describe('Jinja function completions', () => {
        it('returns function snippets inside {{ }}', () => {
            const result = getCompletions('{{ ', 3);
            expect(result).not.toBeNull();
            const labels = result!.items.map(i => i.label);
            expect(labels).toContain('ref');
            expect(labels).toContain('source');
            expect(labels).toContain('config');
            expect(labels).toContain('var');
            expect(labels).toContain('is_incremental');
        });

        it('ref snippet has retrigger command', () => {
            const result = getCompletions('{{ ', 3);
            const ref = result!.items.find(i => i.label === 'ref')!;
            expect(ref.command).toBeDefined();
            expect(ref.command!.command).toBe('editor.action.triggerSuggest');
        });

        it('source snippet has retrigger command', () => {
            const result = getCompletions('{{ ', 3);
            const source = result!.items.find(i => i.label === 'source')!;
            expect(source.command).toBeDefined();
            expect(source.command!.command).toBe('editor.action.triggerSuggest');
        });

        it('config snippet does not have retrigger command', () => {
            const result = getCompletions('{{ ', 3);
            const config = result!.items.find(i => i.label === 'config')!;
            expect(config.command).toBeUndefined();
        });
    });

    describe('no-match cases', () => {
        it('returns null for plain SQL', () => {
            const result = getCompletions('select * from customers', 23);
            expect(result).toBeNull();
        });

        it('returns null outside Jinja braces', () => {
            const result = getCompletions('some text }} more text', 20);
            expect(result).toBeNull();
        });

        it('returns Jinja completions (not ref completions) after closing ref()', () => {
            // Cursor is after ref('customers') but still inside {{ }}, so
            // it should return Jinja function completions, not ref model completions
            const result = getCompletions("{{ ref('customers') }}", 20);
            expect(result).not.toBeNull();
            const labels = result!.items.map(i => i.label);
            expect(labels).toContain('ref');
            expect(labels).toContain('source');
            // Should NOT contain model names (those only appear inside ref quotes)
            expect(labels).not.toContain('customers');
        });
    });

    describe('no manifest', () => {
        it('returns empty completion list when no manifest is loaded', () => {
            const provider = new DbtCompletionProvider(mockProjectManager(null));
            const doc = mockTextDocument(["{{ ref('"]);
            const pos = new Position(0, 8);
            const result = provider.provideCompletionItems(doc as any, pos as any);
            expect(result).not.toBeNull();
            expect(result!.items.length).toBe(0);
        });
    });
});
