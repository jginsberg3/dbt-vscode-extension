import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DbtProject } from '../manifest/types';

function findDbtCommand(projectRootPath: string): string {
    const config = vscode.workspace.getConfiguration('dbtNavigator');
    const userSetting: string = config.get('dbtCommand', 'auto');

    if (userSetting !== 'auto') {
        return userSetting;
    }

    // Auto-detect: check common virtual environment locations.
    // Walk up from the project root to the workspace root, checking each
    // directory for .venv/bin/dbt or venv/bin/dbt. This handles the common
    // case where the venv is at the repo/workspace root but dbt projects
    // are in subdirectories.
    const isWindows = process.platform === 'win32';
    const venvDirs = ['.venv', 'venv'];

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(projectRootPath)
    );
    const stopAt = workspaceFolder?.uri.fsPath ?? projectRootPath;

    let searchDir = projectRootPath;
    while (true) {
        for (const venvDir of venvDirs) {
            const dbtPath = isWindows
                ? path.join(searchDir, venvDir, 'Scripts', 'dbt.exe')
                : path.join(searchDir, venvDir, 'bin', 'dbt');

            if (fs.existsSync(dbtPath)) {
                return dbtPath;
            }
        }

        // Stop if we've reached the workspace root (or if we can't go higher)
        if (searchDir === stopAt) {
            break;
        }

        const parent = path.dirname(searchDir);
        if (parent === searchDir) {
            break; // filesystem root, stop
        }
        searchDir = parent;
    }

    // Fall back to bare "dbt" on PATH
    return 'dbt';
}

export async function runDbtCompile(project: DbtProject): Promise<boolean> {
    const dbtCommand = findDbtCommand(project.rootPath);

    const taskDefinition: vscode.TaskDefinition = { type: 'dbtNavigator' };

    const shellExecution = new vscode.ShellExecution(
        `${dbtCommand} compile`,
        { cwd: project.rootPath }
    );

    const task = new vscode.Task(
        taskDefinition,
        vscode.TaskScope.Workspace,
        `dbt compile - ${project.name}`,
        'dbt Navigator',
        shellExecution
    );

    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel: vscode.TaskPanelKind.Shared,
        clear: true,
    };

    return new Promise<boolean>((resolve) => {
        const disposable = vscode.tasks.onDidEndTaskProcess((event) => {
            if (event.execution.task === task) {
                disposable.dispose();
                const success = event.exitCode === 0;

                if (success) {
                    vscode.window.showInformationMessage(
                        `dbt compile succeeded for "${project.name}".`
                    );
                } else {
                    vscode.window.showErrorMessage(
                        `dbt compile failed for "${project.name}" (exit code ${event.exitCode}). Check the terminal for details.`
                    );
                }

                resolve(success);
            }
        });

        vscode.tasks.executeTask(task);
    });
}
