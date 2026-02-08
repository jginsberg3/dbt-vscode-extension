import * as vscode from 'vscode';
import { ProjectManager } from '../projects/projectManager';
import { ManifestNode, ManifestSource } from '../manifest/types';

export class DbtHoverProvider implements vscode.HoverProvider {
    private static readonly REF_PATTERN = /ref\(\s*['"](\w+)['"]\s*\)/g;
    private static readonly SOURCE_PATTERN = /source\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*\)/g;

    constructor(private projectManager: ProjectManager) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | null {
        const line = document.lineAt(position.line).text;

        // Check for ref() hover
        const modelName = this.getRefAtPosition(line, position.character);
        if (modelName) {
            return this.getModelHover(modelName);
        }

        // Check for source() hover
        const sourceInfo = this.getSourceAtPosition(line, position.character);
        if (sourceInfo) {
            return this.getSourceHover(sourceInfo.sourceName, sourceInfo.tableName);
        }

        return null;
    }

    private getModelHover(modelName: string): vscode.Hover | null {
        const manifest = this.projectManager.getActiveManifest();
        if (!manifest) { return null; }

        const node = manifest.modelsByName.get(modelName);
        if (!node) { return null; }

        return new vscode.Hover(this.buildModelMarkdown(node));
    }

    private getSourceHover(sourceName: string, tableName: string): vscode.Hover | null {
        const manifest = this.projectManager.getActiveManifest();
        if (!manifest) { return null; }

        const tables = manifest.sourcesByName.get(sourceName);
        if (!tables) { return null; }

        const table = tables.find(t => t.name === tableName);
        if (!table) { return null; }

        return new vscode.Hover(this.buildSourceMarkdown(table));
    }

    private buildModelMarkdown(node: ManifestNode): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${node.name}\n\n`);
        if (node.description) {
            md.appendMarkdown(`${node.description}\n\n`);
        }
        const materialized = node.config.materialized ?? 'unknown';
        md.appendMarkdown(`**Type:** ${materialized} | **Package:** ${node.package_name}\n\n`);
        if (node.database && node.schema) {
            md.appendMarkdown(`**Location:** \`${node.database}.${node.schema}.${node.name}\`\n\n`);
        }
        const columns = Object.values(node.columns ?? {});
        if (columns.length > 0) {
            md.appendMarkdown('**Columns:**\n\n');
            md.appendMarkdown('| Column | Type | Description |\n');
            md.appendMarkdown('|--------|------|-------------|\n');
            for (const col of columns) {
                md.appendMarkdown(`| \`${col.name}\` | ${col.data_type ?? '-'} | ${col.description || '-'} |\n`);
            }
        }
        return md;
    }

    private buildSourceMarkdown(source: ManifestSource): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${source.source_name}.${source.name}\n\n`);
        if (source.description) {
            md.appendMarkdown(`${source.description}\n\n`);
        }
        if (source.database && source.schema) {
            md.appendMarkdown(`**Location:** \`${source.database}.${source.schema}.${source.name}\`\n\n`);
        }
        const columns = Object.values(source.columns ?? {});
        if (columns.length > 0) {
            md.appendMarkdown('**Columns:**\n\n');
            md.appendMarkdown('| Column | Type | Description |\n');
            md.appendMarkdown('|--------|------|-------------|\n');
            for (const col of columns) {
                md.appendMarkdown(`| \`${col.name}\` | ${col.data_type ?? '-'} | ${col.description || '-'} |\n`);
            }
        }
        return md;
    }

    private getRefAtPosition(line: string, character: number): string | null {
        DbtHoverProvider.REF_PATTERN.lastIndex = 0;
        let match;
        while ((match = DbtHoverProvider.REF_PATTERN.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (character >= start && character <= end) {
                return match[1];
            }
        }
        return null;
    }

    private getSourceAtPosition(line: string, character: number): { sourceName: string; tableName: string } | null {
        DbtHoverProvider.SOURCE_PATTERN.lastIndex = 0;
        let match;
        while ((match = DbtHoverProvider.SOURCE_PATTERN.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (character >= start && character <= end) {
                return { sourceName: match[1], tableName: match[2] };
            }
        }
        return null;
    }
}
