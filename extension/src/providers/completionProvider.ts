import * as vscode from 'vscode';
import { ProjectManager } from '../projects/projectManager';
import { ManifestNode, ManifestSource } from '../manifest/types';

export class DbtCompletionProvider implements vscode.CompletionItemProvider {

    constructor(private projectManager: ProjectManager) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionList | null {
        const linePrefix = document.lineAt(position).text.substring(0, position.character);

        // Check specific contexts first (cursor is inside a function call)
        const refMatch = linePrefix.match(/ref\(\s*['"]([^'"]*)$/);
        if (refMatch) {
            const typedSoFar = refMatch[1];
            return this.getRefCompletions(position, typedSoFar);
        }

        const sourceContext = this.getSourceContext(linePrefix);
        if (sourceContext) {
            if (sourceContext.argument === 'source_name') {
                return this.getSourceNameCompletions(position, sourceContext.typedSoFar);
            } else {
                return this.getSourceTableCompletions(sourceContext.sourceName, position, sourceContext.typedSoFar);
            }
        }

        // Check if inside a Jinja expression block {{ }}
        if (this.isInsideJinjaExpression(linePrefix)) {
            return new vscode.CompletionList(this.getJinjaFunctionCompletions());
        }

        return null;
    }

    // --- Context detection ---

    private getSourceContext(linePrefix: string): { argument: 'source_name' | 'table_name'; sourceName: string; typedSoFar: string } | null {
        // Second argument: source('name', '|
        const secondArgMatch = linePrefix.match(/source\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]*)$/);
        if (secondArgMatch) {
            return { argument: 'table_name', sourceName: secondArgMatch[1], typedSoFar: secondArgMatch[2] };
        }

        // First argument: source('|
        const firstArgMatch = linePrefix.match(/source\(\s*['"]([^'"]*)$/);
        if (firstArgMatch) {
            return { argument: 'source_name', sourceName: '', typedSoFar: firstArgMatch[1] };
        }

        return null;
    }

    private isInsideJinjaExpression(linePrefix: string): boolean {
        const lastOpen = linePrefix.lastIndexOf('{{');
        const lastClose = linePrefix.lastIndexOf('}}');
        return lastOpen !== -1 && lastOpen > lastClose;
    }

    /**
     * Build a replacement range that covers only the text typed so far
     * (after the opening quote). This tells VS Code to replace just
     * the partial model/source name, not the quote character.
     */
    private getReplacementRange(position: vscode.Position, typedSoFar: string): vscode.Range {
        const start = position.translate(0, -typedSoFar.length);
        return new vscode.Range(start, position);
    }

    // --- Completion generators ---

    private getRefCompletions(position: vscode.Position, typedSoFar: string): vscode.CompletionList {
        const manifest = this.projectManager.getActiveManifest();
        if (!manifest) {
            return new vscode.CompletionList([]);
        }

        const range = this.getReplacementRange(position, typedSoFar);
        const items: vscode.CompletionItem[] = [];
        for (const [name, node] of manifest.modelsByName) {
            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Reference);
            item.detail = node.config.materialized
                ? `${node.config.materialized} model`
                : 'model';
            item.documentation = this.buildModelDocumentation(node);
            item.insertText = name;
            item.filterText = name;
            item.range = range;
            items.push(item);
        }
        return new vscode.CompletionList(items);
    }

    private getSourceNameCompletions(position: vscode.Position, typedSoFar: string): vscode.CompletionList {
        const manifest = this.projectManager.getActiveManifest();
        if (!manifest) { return new vscode.CompletionList([]); }

        const range = this.getReplacementRange(position, typedSoFar);
        const items: vscode.CompletionItem[] = [];
        for (const [sourceName, tables] of manifest.sourcesByName) {
            const item = new vscode.CompletionItem(sourceName, vscode.CompletionItemKind.Module);
            item.detail = `${tables.length} table(s)`;
            item.insertText = sourceName;
            item.filterText = sourceName;
            item.range = range;
            items.push(item);
        }
        return new vscode.CompletionList(items);
    }

    private getSourceTableCompletions(sourceName: string, position: vscode.Position, typedSoFar: string): vscode.CompletionList {
        const manifest = this.projectManager.getActiveManifest();
        if (!manifest) { return new vscode.CompletionList([]); }

        const tables = manifest.sourcesByName.get(sourceName);
        if (!tables) { return new vscode.CompletionList([]); }

        const range = this.getReplacementRange(position, typedSoFar);
        const items = tables.map(table => {
            const item = new vscode.CompletionItem(table.name, vscode.CompletionItemKind.Field);
            item.detail = table.description || `${table.database}.${table.schema}.${table.name}`;
            item.documentation = this.buildSourceDocumentation(table);
            item.insertText = table.name;
            item.filterText = table.name;
            item.range = range;
            return item;
        });
        return new vscode.CompletionList(items);
    }

    private getJinjaFunctionCompletions(): vscode.CompletionItem[] {
        const snippets = [
            { label: 'ref', snippet: "ref('$1')", detail: 'Reference a dbt model', retrigger: true },
            { label: 'source', snippet: "source('$1', '$2')", detail: 'Reference a dbt source', retrigger: true },
            { label: 'config', snippet: "config(${1:materialized='${2|table,view,incremental,ephemeral|}'})", detail: 'Set model configuration', retrigger: false },
            { label: 'var', snippet: "var('${1:variable_name}')", detail: 'Access a project variable', retrigger: false },
            { label: 'env_var', snippet: "env_var('${1:ENV_VARIABLE}')", detail: 'Access an environment variable', retrigger: false },
            { label: 'is_incremental', snippet: 'is_incremental()', detail: 'Check if running incrementally', retrigger: false },
            { label: 'this', snippet: 'this', detail: 'Current model relation', retrigger: false },
            { label: 'log', snippet: "log('${1:message}', info=${2|True,False|})", detail: 'Log a message during execution', retrigger: false },
        ];

        return snippets.map(s => {
            const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Function);
            item.insertText = new vscode.SnippetString(s.snippet);
            item.detail = s.detail;
            if (s.retrigger) {
                item.command = {
                    command: 'editor.action.triggerSuggest',
                    title: 'Re-trigger completions',
                };
            }
            return item;
        });
    }

    // --- Documentation builders ---

    private buildModelDocumentation(node: ManifestNode): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        if (node.description) {
            md.appendMarkdown(node.description + '\n\n');
        }
        if (node.database && node.schema) {
            md.appendMarkdown(`**Location:** \`${node.database}.${node.schema}\`\n\n`);
        }
        const columns = Object.values(node.columns ?? {});
        if (columns.length > 0) {
            md.appendMarkdown('**Columns:**\n');
            for (const col of columns) {
                const dtype = col.data_type ? ` (\`${col.data_type}\`)` : '';
                const desc = col.description ? ` - ${col.description}` : '';
                md.appendMarkdown(`- \`${col.name}\`${dtype}${desc}\n`);
            }
        }
        return md;
    }

    private buildSourceDocumentation(source: ManifestSource): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        if (source.description) {
            md.appendMarkdown(source.description + '\n\n');
        }
        if (source.database && source.schema) {
            md.appendMarkdown(`**Location:** \`${source.database}.${source.schema}.${source.name}\`\n\n`);
        }
        const columns = Object.values(source.columns ?? {});
        if (columns.length > 0) {
            md.appendMarkdown('**Columns:**\n');
            for (const col of columns) {
                const dtype = col.data_type ? ` (\`${col.data_type}\`)` : '';
                const desc = col.description ? ` - ${col.description}` : '';
                md.appendMarkdown(`- \`${col.name}\`${dtype}${desc}\n`);
            }
        }
        return md;
    }
}
