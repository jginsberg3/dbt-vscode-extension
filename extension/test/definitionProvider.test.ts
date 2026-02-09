import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { Position, mockTextDocument, mockProjectManager } from './helpers/vscodeStubs';
import { parseManifest } from '../src/manifest/manifestParser';
import { DbtDefinitionProvider } from '../src/providers/definitionProvider';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'manifest.json');
const manifest = parseManifest(FIXTURE_PATH);

function getDefinition(line: string, cursorColumn: number, manifestOverride?: any) {
    const m = arguments.length >= 3 ? manifestOverride : manifest;
    const provider = new DbtDefinitionProvider(mockProjectManager(m));
    const doc = mockTextDocument([line]);
    const pos = new Position(0, cursorColumn);
    return provider.provideDefinition(doc as any, pos as any);
}

describe('DbtDefinitionProvider', () => {
    describe('ref() go-to-definition', () => {
        it('returns a location for a known model', () => {
            const result = getDefinition("{{ ref('customers') }}", 12);
            expect(result).not.toBeNull();
        });

        it('resolves to the correct file path', () => {
            const result = getDefinition("{{ ref('customers') }}", 12) as any;
            expect(result.uri.fsPath).toBe(
                path.join('/test/project', 'models/customers.sql')
            );
        });

        it('works with different models', () => {
            const result = getDefinition("{{ ref('stg_orders') }}", 12) as any;
            expect(result.uri.fsPath).toBe(
                path.join('/test/project', 'models/staging/stg_orders.sql')
            );
        });

        it('works with double quotes', () => {
            const result = getDefinition('{{ ref("customers") }}', 12);
            expect(result).not.toBeNull();
        });

        it('returns null when cursor is outside ref()', () => {
            const result = getDefinition("select * from {{ ref('customers') }}", 5);
            expect(result).toBeNull();
        });

        it('returns null for unknown model', () => {
            const result = getDefinition("{{ ref('nonexistent') }}", 12);
            expect(result).toBeNull();
        });

        it('returns null when no manifest is loaded', () => {
            const result = getDefinition("{{ ref('customers') }}", 12, null);
            expect(result).toBeNull();
        });

        it('returns null when no active project', () => {
            const pm = {
                getActiveManifest: () => manifest,
                getActiveProject: () => null,
            };
            const provider = new DbtDefinitionProvider(pm as any);
            const doc = mockTextDocument(["{{ ref('customers') }}"]);
            const pos = new Position(0, 12);
            const result = provider.provideDefinition(doc as any, pos as any);
            expect(result).toBeNull();
        });

        it('handles multiple refs on the same line', () => {
            const line = "{{ ref('customers') }} and {{ ref('stg_orders') }}";
            const result1 = getDefinition(line, 12) as any;
            const result2 = getDefinition(line, 38) as any;
            expect(result1.uri.fsPath).toContain('customers.sql');
            expect(result2.uri.fsPath).toContain('stg_orders.sql');
        });
    });
});
