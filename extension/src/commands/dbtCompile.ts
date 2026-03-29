import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
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

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('dbt Navigator');
    }
    return outputChannel;
}

interface CommandResult {
    success: boolean;
    exitCode: number;
    output: string;
}

function runCommand(
    command: string,
    args: string[],
    cwd: string,
    channel: vscode.OutputChannel
): Promise<CommandResult> {
    return new Promise((resolve) => {
        const outputChunks: string[] = [];

        const proc = spawn(command, args, { cwd, shell: process.platform === 'win32' });

        const handleData = (data: Buffer) => {
            const text = data.toString();
            outputChunks.push(text);
            channel.append(text);
        };

        proc.stdout.on('data', handleData);
        proc.stderr.on('data', handleData);

        proc.on('close', (code) => {
            const exitCode = code ?? 1;
            resolve({
                success: exitCode === 0,
                exitCode,
                output: outputChunks.join(''),
            });
        });

        proc.on('error', (err) => {
            const msg = `Failed to start process: ${err.message}\n`;
            outputChunks.push(msg);
            channel.append(msg);
            resolve({ success: false, exitCode: 1, output: outputChunks.join('') });
        });
    });
}

function isDepsError(output: string): boolean {
    const lower = output.toLowerCase();
    return (
        output.includes('dbt_packages') ||
        lower.includes('run dbt deps') ||
        lower.includes('dbt deps') ||
        (lower.includes('package') && (lower.includes('not found') || lower.includes('not installed')))
    );
}

export async function runDbtCompile(project: DbtProject): Promise<boolean> {
    const dbtCommand = findDbtCommand(project.rootPath);
    const channel = getOutputChannel();

    channel.clear();
    channel.show(true); // show without stealing focus
    channel.appendLine(`Running dbt compile for "${project.name}"...\n`);

    const result = await runCommand(dbtCommand, ['compile'], project.rootPath, channel);

    if (result.success) {
        vscode.window.showInformationMessage(
            `dbt compile succeeded for "${project.name}".`
        );
        return true;
    }

    // Compile failed — check if it looks like a missing-packages error
    if (isDepsError(result.output)) {
        const choice = await vscode.window.showErrorMessage(
            `dbt compile failed for "${project.name}" — it looks like packages may not be installed.`,
            'Run dbt deps & Retry',
            'Cancel'
        );

        if (choice === 'Run dbt deps & Retry') {
            channel.appendLine('\n--- Running dbt deps ---\n');
            const depsResult = await runCommand(dbtCommand, ['deps'], project.rootPath, channel);

            if (depsResult.success) {
                channel.appendLine('\n--- Retrying dbt compile ---\n');
                const retryResult = await runCommand(dbtCommand, ['compile'], project.rootPath, channel);

                if (retryResult.success) {
                    vscode.window.showInformationMessage(
                        `dbt compile succeeded for "${project.name}".`
                    );
                    return true;
                }
            }

            vscode.window.showErrorMessage(
                `dbt compile failed for "${project.name}". Check the dbt Navigator output for details.`
            );
            return false;
        }

        return false;
    }

    vscode.window.showErrorMessage(
        `dbt compile failed for "${project.name}" (exit code ${result.exitCode}). Check the dbt Navigator output for details.`
    );
    return false;
}
