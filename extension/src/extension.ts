import * as vscode from 'vscode';
import { ProjectManager } from './projects/projectManager';
import { DbtDefinitionProvider } from './providers/definitionProvider';
import { DbtCompletionProvider } from './providers/completionProvider';
import { DbtHoverProvider } from './providers/hoverProvider';
import { DbtYamlCompletionProvider } from './providers/yamlCompletionProvider';
import { DagViewProvider } from './dag/dagPanel';
import { runDbtCompile } from './commands/dbtCompile';

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

    const completionProvider = new DbtCompletionProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            [{ language: 'sql' }, { language: 'jinja-sql' }],
            completionProvider,
            "'", '"', '{'
        )
    );

    const hoverProvider = new DbtHoverProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            [{ language: 'sql' }, { language: 'jinja-sql' }],
            hoverProvider
        )
    );

    const yamlCompletionProvider = new DbtYamlCompletionProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            [{ language: 'yaml' }, { language: 'yml' }],
            yamlCompletionProvider
        )
    );

    const dagViewProvider = new DagViewProvider(projectManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            DagViewProvider.viewType,
            dagViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbt.switchProject', () => {
            projectManager.showProjectPicker();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbt.compile', async () => {
            let project = projectManager.getActiveProject();

            if (!project) {
                await projectManager.showProjectPicker();
                project = projectManager.getActiveProject();
            }

            if (project) {
                await runDbtCompile(project);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                projectManager.onFileOpened(editor.document.uri);
                dagViewProvider.onActiveFileChanged(editor.document.uri);
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
