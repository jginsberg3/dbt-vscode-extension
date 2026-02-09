/**
 * Lightweight stubs for the VS Code API types used by our providers.
 * These are aliased in vitest.config.ts so that `import * as vscode from 'vscode'`
 * resolves to this file during tests.
 */

// --- Core types ---

export class Position {
    constructor(public readonly line: number, public readonly character: number) {}

    translate(lineDelta: number = 0, characterDelta: number = 0): Position {
        return new Position(this.line + lineDelta, this.character + characterDelta);
    }

    isEqual(other: Position): boolean {
        return this.line === other.line && this.character === other.character;
    }
}

export class Range {
    constructor(public readonly start: Position, public readonly end: Position) {}
}

export class Uri {
    private constructor(public readonly fsPath: string, public readonly scheme: string = 'file') {}

    static file(path: string): Uri {
        return new Uri(path, 'file');
    }

    toString(): string {
        return this.fsPath;
    }
}

export class Location {
    constructor(public readonly uri: Uri, public readonly range: Position | Range) {}
}

// --- Completion types ---

export enum CompletionItemKind {
    Text = 0,
    Method = 1,
    Function = 2,
    Constructor = 3,
    Field = 4,
    Variable = 5,
    Class = 6,
    Interface = 7,
    Module = 8,
    Property = 9,
    Unit = 10,
    Value = 11,
    Enum = 12,
    Keyword = 13,
    Snippet = 14,
    Color = 15,
    Reference = 17,
    File = 16,
    Folder = 18,
    EnumMember = 19,
    Constant = 20,
    Struct = 21,
    Event = 22,
    Operator = 23,
    TypeParameter = 24,
}

export class CompletionItem {
    public detail?: string;
    public documentation?: MarkdownString | string;
    public insertText?: string | SnippetString;
    public filterText?: string;
    public sortText?: string;
    public range?: Range;
    public command?: { command: string; title: string };

    constructor(public readonly label: string, public readonly kind?: CompletionItemKind) {}
}

export class CompletionList {
    constructor(public readonly items: CompletionItem[] = [], public readonly isIncomplete: boolean = false) {}
}

export class SnippetString {
    constructor(public readonly value: string) {}
}

// --- Hover types ---

export class MarkdownString {
    public value: string = '';

    appendMarkdown(value: string): this {
        this.value += value;
        return this;
    }

    appendText(value: string): this {
        this.value += value;
        return this;
    }
}

export class Hover {
    constructor(public readonly contents: MarkdownString | string) {}
}

// --- StatusBar (needed by ProjectManager) ---

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

// --- Window/workspace stubs (for imports that reference these) ---

export const window = {
    createStatusBarItem: () => ({
        show: () => {},
        hide: () => {},
        dispose: () => {},
        text: '',
        tooltip: '',
        command: '',
    }),
    showInformationMessage: (..._args: any[]) => Promise.resolve(undefined),
    showWarningMessage: (..._args: any[]) => Promise.resolve(undefined),
    showQuickPick: async (..._args: any[]) => undefined,
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    activeTextEditor: undefined,
};

export const workspace = {
    workspaceFolders: [],
    findFiles: async () => [],
    createFileSystemWatcher: () => ({
        onDidChange: () => ({ dispose: () => {} }),
        onDidCreate: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {},
    }),
};

export const commands = {
    executeCommand: async (..._args: any[]) => undefined,
};

export const languages = {
    registerCompletionItemProvider: () => ({ dispose: () => {} }),
    registerDefinitionProvider: () => ({ dispose: () => {} }),
    registerHoverProvider: () => ({ dispose: () => {} }),
};

export class RelativePattern {
    constructor(public readonly base: string, public readonly pattern: string) {}
}

export class EventEmitter {
    private _event: any = () => ({ dispose: () => {} });
    get event() { return this._event; }
    fire(_data?: any) {}
    dispose() {}
}

// --- Test helpers ---

/**
 * Create a mock TextDocument from an array of lines.
 * Each string in the array becomes one line in the document.
 */
export function mockTextDocument(lines: string[], uri?: Uri): any {
    return {
        lineAt(lineOrPosition: number | Position) {
            const lineNumber = typeof lineOrPosition === 'number'
                ? lineOrPosition
                : lineOrPosition.line;
            return { text: lines[lineNumber] ?? '' };
        },
        lineCount: lines.length,
        uri: uri ?? Uri.file('/test/project/models/test.sql'),
    };
}

/**
 * Create a mock ProjectManager that returns the given manifest
 * and optionally an active project.
 */
export function mockProjectManager(manifest: any, project?: any): any {
    return {
        getActiveManifest: () => manifest,
        getActiveProject: () => project ?? {
            name: 'test_project',
            rootPath: '/test/project',
            manifestPath: '/test/project/target/manifest.json',
            parsedManifest: manifest,
            hasManifest: !!manifest,
        },
    };
}
