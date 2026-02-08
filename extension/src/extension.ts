import * as vscode from 'vscode';
import { ProjectManager } from './projects/projectManager';
import { DbtDefinitionProvider } from './providers/definitionProvider';
import { DagPanel } from './dag/dagPanel';

let projectManager: ProjectManager;

export async function activate(context: vscode.ExtensionContext) {
    projectManager = new ProjectManager();
    await projectManager.discoverProjects();

    const definitionProvider = new DbtDefinitionProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            [{ language: 'sql' }, { language: 'jinja-sql' }],
            definitionProvider
        )
    );

    const dagPanel = new DagPanel(context, projectManager);

    context.subscriptions.push(
        vscode.commands.registerCommand('dbt.showDag', () => {
            dagPanel.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbt.switchProject', () => {
            projectManager.showProjectPicker();
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                projectManager.onFileOpened(editor.document.uri);
                dagPanel.onActiveFileChanged(editor.document.uri);
            }
        })
    );

    context.subscriptions.push(projectManager);

    // If a file is already open, trigger initial project detection
    if (vscode.window.activeTextEditor) {
        projectManager.onFileOpened(vscode.window.activeTextEditor.document.uri);
    }
}

export function deactivate() {}
