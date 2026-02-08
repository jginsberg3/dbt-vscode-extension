import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DbtProject, ParsedManifest } from '../manifest/types';
import { parseManifest } from '../manifest/manifestParser';

export class ProjectManager implements vscode.Disposable {
    private projects: DbtProject[] = [];
    private activeProject: DbtProject | null = null;
    private statusBarItem: vscode.StatusBarItem;
    private fileWatchers: vscode.FileSystemWatcher[] = [];

    private readonly _onDidChangeActiveProject = new vscode.EventEmitter<DbtProject | null>();
    readonly onDidChangeActiveProject = this._onDidChangeActiveProject.event;

    private readonly _onDidManifestChange = new vscode.EventEmitter<DbtProject>();
    readonly onDidManifestChange = this._onDidManifestChange.event;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'dbt.switchProject';
        this.statusBarItem.tooltip = 'Click to switch dbt project';
        this.updateStatusBar();
        this.statusBarItem.show();
    }

    async discoverProjects(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        // Find all dbt_project.yml files in workspace
        const projectFiles = await vscode.workspace.findFiles(
            '**/dbt_project.yml',
            '{**/node_modules/**,**/dbt_packages/**,**/dbt_internal_packages/**,**/.venv/**}'
        );

        for (const projectFile of projectFiles) {
            const rootPath = path.dirname(projectFile.fsPath);
            const manifestPath = path.join(rootPath, 'target', 'manifest.json');
            const hasManifest = fs.existsSync(manifestPath);

            // Read project name from dbt_project.yml
            let projectName = path.basename(rootPath);
            try {
                const content = fs.readFileSync(projectFile.fsPath, 'utf-8');
                const nameMatch = content.match(/^name:\s*['"]?(\S+?)['"]?\s*$/m);
                if (nameMatch) {
                    projectName = nameMatch[1];
                }
            } catch {
                // Fall back to directory name
            }

            const project: DbtProject = {
                name: projectName,
                rootPath,
                manifestPath,
                parsedManifest: null, // Lazy — don't parse yet
                hasManifest,
            };

            this.projects.push(project);
        }

        // Watch for manifest.json creation/changes across all project locations
        for (const project of this.projects) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(project.rootPath, 'target/manifest.json')
            );

            const handleManifestChange = () => {
                project.hasManifest = fs.existsSync(project.manifestPath);
                // Only re-parse if it was already loaded (lazy loading)
                if (project.parsedManifest) {
                    this.loadManifest(project);
                    this._onDidManifestChange.fire(project);
                }
                this.updateStatusBar();
            };

            watcher.onDidChange(handleManifestChange);
            watcher.onDidCreate(handleManifestChange);
            watcher.onDidDelete(() => {
                project.hasManifest = false;
                project.parsedManifest = null;
                this._onDidManifestChange.fire(project);
                this.updateStatusBar();
            });

            this.fileWatchers.push(watcher);
        }

        // Auto-select if only one project
        if (this.projects.length === 1) {
            this.setActiveProject(this.projects[0]);
        }
    }

    getActiveProject(): DbtProject | null {
        return this.activeProject;
    }

    getActiveManifest(): ParsedManifest | null {
        if (!this.activeProject) {
            return null;
        }
        return this.ensureManifestLoaded(this.activeProject);
    }

    onFileOpened(fileUri: vscode.Uri): void {
        const filePath = fileUri.fsPath;
        const matchingProject = this.projects.find(p =>
            filePath.startsWith(p.rootPath + path.sep)
        );

        if (matchingProject && matchingProject !== this.activeProject) {
            this.setActiveProject(matchingProject);
        }
    }

    async showProjectPicker(): Promise<void> {
        if (this.projects.length === 0) {
            vscode.window.showInformationMessage(
                'No dbt projects found in this workspace.'
            );
            return;
        }

        const items = this.projects.map(p => ({
            label: p.name,
            description: p.hasManifest ? '' : '(no manifest — run dbt compile)',
            detail: p.rootPath,
            project: p,
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a dbt project',
        });

        if (selected) {
            this.setActiveProject(selected.project);
        }
    }

    private setActiveProject(project: DbtProject): void {
        if (this.activeProject === project) {
            return;
        }
        this.activeProject = project;
        this.ensureManifestLoaded(project);
        this.updateStatusBar();
        this._onDidChangeActiveProject.fire(project);
    }

    private ensureManifestLoaded(project: DbtProject): ParsedManifest | null {
        if (project.parsedManifest) {
            return project.parsedManifest;
        }

        if (!project.hasManifest) {
            return null;
        }

        return this.loadManifest(project);
    }

    private loadManifest(project: DbtProject): ParsedManifest | null {
        try {
            project.parsedManifest = parseManifest(project.manifestPath);
            return project.parsedManifest;
        } catch (err) {
            vscode.window.showWarningMessage(
                `Failed to parse manifest for "${project.name}": ${err}`
            );
            project.parsedManifest = null;
            return null;
        }
    }

    private updateStatusBar(): void {
        if (this.activeProject) {
            this.statusBarItem.text = `$(database) dbt: ${this.activeProject.name}`;
            if (!this.activeProject.hasManifest) {
                this.statusBarItem.text += ' (no manifest)';
            }
        } else if (this.projects.length > 0) {
            this.statusBarItem.text = '$(database) dbt: (no project selected)';
        } else {
            this.statusBarItem.text = '$(database) dbt: (no projects found)';
        }
    }

    dispose(): void {
        this.statusBarItem.dispose();
        this._onDidChangeActiveProject.dispose();
        this._onDidManifestChange.dispose();
        for (const watcher of this.fileWatchers) {
            watcher.dispose();
        }
    }
}
