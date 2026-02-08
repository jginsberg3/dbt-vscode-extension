import * as vscode from 'vscode';
import { ProjectManager } from '../projects/projectManager';

type YamlContext = 'root' | 'model' | 'column' | 'source' | 'source_table' | 'unknown';

export class DbtYamlCompletionProvider implements vscode.CompletionItemProvider {

    constructor(private projectManager: ProjectManager) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] | null {
        // Only activate in dbt project files
        if (!this.isDbtSchemaFile(document)) {
            return null;
        }

        const context = this.detectYamlContext(document, position);
        switch (context) {
            case 'root':
                return this.getRootCompletions();
            case 'model':
                return this.getModelPropertyCompletions();
            case 'column':
                return this.getColumnPropertyCompletions();
            case 'source':
                return this.getSourcePropertyCompletions();
            case 'source_table':
                return this.getSourceTablePropertyCompletions();
            default:
                return null;
        }
    }

    private isDbtSchemaFile(document: vscode.TextDocument): boolean {
        // Check if file is inside a dbt project
        const project = this.projectManager.getActiveProject();
        if (project && document.uri.fsPath.startsWith(project.rootPath)) {
            return true;
        }
        return false;
    }

    private detectYamlContext(document: vscode.TextDocument, position: vscode.Position): YamlContext {
        const currentLine = document.lineAt(position.line).text;
        const currentIndent = currentLine.search(/\S/);

        // If cursor is at indent 0 or on a blank line at the start, it's root
        if (currentIndent <= 0) {
            return 'root';
        }

        // Walk backwards to find the parent context
        for (let i = position.line - 1; i >= 0; i--) {
            const line = document.lineAt(i).text;
            const lineIndent = line.search(/\S/);
            if (lineIndent === -1) { continue; } // skip blank lines

            if (lineIndent < currentIndent) {
                const trimmed = line.trim();

                if (trimmed.startsWith('columns:')) {
                    return 'column';
                }
                if (trimmed.startsWith('models:')) {
                    return 'model';
                }
                if (trimmed.startsWith('sources:')) {
                    return 'source';
                }
                if (trimmed.startsWith('tables:')) {
                    return 'source_table';
                }

                // If we hit a `- name:` list item, figure out what list it's in
                if (trimmed.startsWith('- name:')) {
                    return this.detectListItemContext(document, i, lineIndent);
                }

                // If we hit another property at a lower indent, keep walking up
                continue;
            }
        }

        return 'root';
    }

    private detectListItemContext(document: vscode.TextDocument, nameLineIndex: number, nameIndent: number): YamlContext {
        for (let i = nameLineIndex - 1; i >= 0; i--) {
            const line = document.lineAt(i).text;
            const lineIndent = line.search(/\S/);
            if (lineIndent === -1) { continue; }

            if (lineIndent < nameIndent) {
                const trimmed = line.trim();
                if (trimmed.startsWith('models:')) { return 'model'; }
                if (trimmed.startsWith('columns:')) { return 'column'; }
                if (trimmed.startsWith('sources:')) { return 'source'; }
                if (trimmed.startsWith('tables:')) { return 'source_table'; }
                // Keep walking for nested structures
                continue;
            }
        }
        return 'unknown';
    }

    // --- Completion sets ---

    private getRootCompletions(): vscode.CompletionItem[] {
        const properties = [
            { name: 'version', desc: 'Schema version (typically 2)' },
            { name: 'models', desc: 'List of model definitions' },
            { name: 'sources', desc: 'List of source definitions' },
            { name: 'seeds', desc: 'List of seed definitions' },
            { name: 'macros', desc: 'List of macro definitions' },
            { name: 'exposures', desc: 'List of exposure definitions' },
            { name: 'metrics', desc: 'List of metric definitions' },
            { name: 'semantic_models', desc: 'List of semantic model definitions' },
            { name: 'unit_tests', desc: 'List of unit test definitions' },
        ];
        return this.buildPropertyCompletions(properties);
    }

    private getModelPropertyCompletions(): vscode.CompletionItem[] {
        const properties = [
            { name: 'name', desc: 'Model name (must match filename without .sql)' },
            { name: 'description', desc: 'Model description' },
            { name: 'columns', desc: 'Column definitions' },
            { name: 'config', desc: 'Model configuration overrides' },
            { name: 'data_tests', desc: 'Model-level data tests' },
            { name: 'docs', desc: 'Documentation configuration' },
            { name: 'tags', desc: 'Tags for model selection' },
            { name: 'meta', desc: 'Custom metadata dictionary' },
            { name: 'access', desc: 'Access level (private, protected, public)' },
            { name: 'contract', desc: 'Model contract configuration' },
            { name: 'group', desc: 'Group this model belongs to' },
            { name: 'latest_version', desc: 'Latest version number' },
            { name: 'versions', desc: 'Version definitions' },
            { name: 'deprecation_date', desc: 'Deprecation date for the model' },
        ];
        return this.buildPropertyCompletions(properties);
    }

    private getColumnPropertyCompletions(): vscode.CompletionItem[] {
        const properties = [
            { name: 'name', desc: 'Column name' },
            { name: 'description', desc: 'Column description' },
            { name: 'data_type', desc: 'Column data type' },
            { name: 'data_tests', desc: 'Column-level data tests' },
            { name: 'tags', desc: 'Tags for column' },
            { name: 'meta', desc: 'Custom metadata dictionary' },
            { name: 'quote', desc: 'Whether to quote the column name' },
            { name: 'constraints', desc: 'Column constraints' },
        ];
        return this.buildPropertyCompletions(properties);
    }

    private getSourcePropertyCompletions(): vscode.CompletionItem[] {
        const properties = [
            { name: 'name', desc: 'Source name' },
            { name: 'description', desc: 'Source description' },
            { name: 'database', desc: 'Database name override' },
            { name: 'schema', desc: 'Schema name override' },
            { name: 'tables', desc: 'List of source tables' },
            { name: 'tags', desc: 'Tags for source' },
            { name: 'meta', desc: 'Custom metadata dictionary' },
            { name: 'overrides', desc: 'Package to override source from' },
            { name: 'freshness', desc: 'Default freshness configuration for tables' },
            { name: 'loaded_at_field', desc: 'Default timestamp column for freshness checks' },
        ];
        return this.buildPropertyCompletions(properties);
    }

    private getSourceTablePropertyCompletions(): vscode.CompletionItem[] {
        const properties = [
            { name: 'name', desc: 'Table name in the source database' },
            { name: 'description', desc: 'Table description' },
            { name: 'columns', desc: 'Column definitions' },
            { name: 'identifier', desc: 'Actual table name if different from name' },
            { name: 'data_tests', desc: 'Table-level data tests' },
            { name: 'tags', desc: 'Tags for table' },
            { name: 'meta', desc: 'Custom metadata dictionary' },
            { name: 'loaded_at_field', desc: 'Timestamp column for freshness checks' },
            { name: 'freshness', desc: 'Freshness configuration' },
        ];
        return this.buildPropertyCompletions(properties);
    }

    private buildPropertyCompletions(properties: { name: string; desc: string }[]): vscode.CompletionItem[] {
        return properties.map(p => {
            const item = new vscode.CompletionItem(p.name, vscode.CompletionItemKind.Property);
            item.detail = p.desc;
            item.insertText = `${p.name}: `;
            return item;
        });
    }
}
