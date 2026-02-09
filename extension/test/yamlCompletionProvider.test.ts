import { describe, it, expect } from 'vitest';
import { Position, Uri, mockTextDocument, mockProjectManager } from './helpers/vscodeStubs';
import { DbtYamlCompletionProvider } from '../src/providers/yamlCompletionProvider';

const PROJECT = {
    name: 'test_project',
    rootPath: '/test/project',
    manifestPath: '/test/project/target/manifest.json',
    parsedManifest: null,
    hasManifest: false,
};

function getYamlCompletions(lines: string[], cursorLine: number, cursorColumn: number) {
    const provider = new DbtYamlCompletionProvider(mockProjectManager(null, PROJECT));
    const uri = Uri.file('/test/project/models/schema.yml');
    const doc = mockTextDocument(lines, uri);
    const pos = new Position(cursorLine, cursorColumn);
    return provider.provideCompletionItems(doc as any, pos as any);
}

function completionNames(result: any): string[] {
    if (!result) { return []; }
    return result.map((i: any) => i.label).sort();
}

describe('DbtYamlCompletionProvider', () => {
    describe('file guard', () => {
        it('returns null for YAML files outside the dbt project', () => {
            const provider = new DbtYamlCompletionProvider(mockProjectManager(null, PROJECT));
            const uri = Uri.file('/other/place/config.yml');
            const doc = mockTextDocument([''], uri);
            const pos = new Position(0, 0);
            const result = provider.provideCompletionItems(doc as any, pos as any);
            expect(result).toBeNull();
        });
    });

    describe('root context', () => {
        it('returns root-level properties at indent 0', () => {
            const lines = [''];
            const result = getYamlCompletions(lines, 0, 0);
            const names = completionNames(result);
            expect(names).toContain('models');
            expect(names).toContain('sources');
            expect(names).toContain('version');
        });
    });

    describe('model context', () => {
        it('returns model properties under models:', () => {
            const lines = [
                'models:',
                '  ',
            ];
            const result = getYamlCompletions(lines, 1, 2);
            const names = completionNames(result);
            expect(names).toContain('name');
            expect(names).toContain('description');
            expect(names).toContain('columns');
            expect(names).toContain('config');
            expect(names).toContain('data_tests');
        });

        it('returns model properties inside a model list item', () => {
            const lines = [
                'models:',
                '  - name: customers',
                '    ',
            ];
            const result = getYamlCompletions(lines, 2, 4);
            const names = completionNames(result);
            expect(names).toContain('description');
            expect(names).toContain('columns');
        });
    });

    describe('column context', () => {
        it('returns column properties under columns:', () => {
            const lines = [
                'models:',
                '  - name: customers',
                '    columns:',
                '      ',
            ];
            const result = getYamlCompletions(lines, 3, 6);
            const names = completionNames(result);
            expect(names).toContain('name');
            expect(names).toContain('description');
            expect(names).toContain('data_type');
            expect(names).toContain('data_tests');
        });

        it('returns column properties inside a column list item', () => {
            const lines = [
                'models:',
                '  - name: customers',
                '    columns:',
                '      - name: customer_id',
                '        ',
            ];
            const result = getYamlCompletions(lines, 4, 8);
            const names = completionNames(result);
            expect(names).toContain('description');
            expect(names).toContain('data_type');
        });
    });

    describe('source context', () => {
        it('returns source properties under sources:', () => {
            const lines = [
                'sources:',
                '  ',
            ];
            const result = getYamlCompletions(lines, 1, 2);
            const names = completionNames(result);
            expect(names).toContain('name');
            expect(names).toContain('database');
            expect(names).toContain('schema');
            expect(names).toContain('tables');
        });

        it('returns source properties inside a source list item', () => {
            const lines = [
                'sources:',
                '  - name: stripe',
                '    ',
            ];
            const result = getYamlCompletions(lines, 2, 4);
            const names = completionNames(result);
            expect(names).toContain('tables');
            expect(names).toContain('database');
            expect(names).toContain('freshness');
        });
    });

    describe('source table context', () => {
        it('returns source table properties under tables:', () => {
            const lines = [
                'sources:',
                '  - name: stripe',
                '    tables:',
                '      ',
            ];
            const result = getYamlCompletions(lines, 3, 6);
            const names = completionNames(result);
            expect(names).toContain('name');
            expect(names).toContain('identifier');
            expect(names).toContain('columns');
            expect(names).toContain('freshness');
        });

        it('returns source table properties inside a table list item', () => {
            const lines = [
                'sources:',
                '  - name: stripe',
                '    tables:',
                '      - name: payments',
                '        ',
            ];
            const result = getYamlCompletions(lines, 4, 8);
            const names = completionNames(result);
            expect(names).toContain('description');
            expect(names).toContain('columns');
            expect(names).toContain('loaded_at_field');
        });
    });

    describe('completion item format', () => {
        it('appends colon and space to insertText', () => {
            const lines = [''];
            const result = getYamlCompletions(lines, 0, 0);
            const models = result!.find((i: any) => i.label === 'models');
            expect(models.insertText).toBe('models: ');
        });

        it('includes a description in detail', () => {
            const lines = [''];
            const result = getYamlCompletions(lines, 0, 0);
            const models = result!.find((i: any) => i.label === 'models');
            expect(models.detail).toBe('List of model definitions');
        });
    });
});
