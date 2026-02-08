import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectManager } from '../projects/projectManager';

export class DbtDefinitionProvider implements vscode.DefinitionProvider {
    private static readonly REF_PATTERN = /ref\(\s*['"](\w+)['"]\s*\)/g;

    constructor(private projectManager: ProjectManager) {}

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Definition | null {
        const line = document.lineAt(position.line).text;
        const modelName = this.getRefAtPosition(line, position.character);
        if (!modelName) {
            return null;
        }

        const project = this.projectManager.getActiveProject();
        if (!project) {
            return null;
        }

        const manifest = this.projectManager.getActiveManifest();
        if (!manifest) {
            vscode.window.showInformationMessage(
                `No manifest found for "${project.name}". Run dbt compile to enable go-to-definition.`,
                'Run dbt compile'
            ).then(action => {
                if (action === 'Run dbt compile') {
                    vscode.commands.executeCommand('dbt.compile');
                }
            });
            return null;
        }

        const node = manifest.modelsByName.get(modelName);
        if (!node) {
            vscode.window.showWarningMessage(
                `Model "${modelName}" not found in manifest. Try running dbt compile to update.`,
                'Run dbt compile'
            ).then(action => {
                if (action === 'Run dbt compile') {
                    vscode.commands.executeCommand('dbt.compile');
                }
            });
            return null;
        }

        const targetPath = path.join(project.rootPath, node.original_file_path);
        return new vscode.Location(
            vscode.Uri.file(targetPath),
            new vscode.Position(0, 0)
        );
    }

    private getRefAtPosition(line: string, character: number): string | null {
        DbtDefinitionProvider.REF_PATTERN.lastIndex = 0;
        let match;
        while ((match = DbtDefinitionProvider.REF_PATTERN.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (character >= start && character <= end) {
                return match[1];
            }
        }
        return null;
    }
}
