import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectManager } from '../projects/projectManager';
import { ManifestNode, ParsedManifest } from '../manifest/types';

interface DagNode {
    id: string;
    name: string;
    materialized: string;
    filePath: string;
}

interface DagEdge {
    source: string;
    target: string;
}

interface DagGraphData {
    nodes: DagNode[];
    edges: DagEdge[];
    highlightedNodeId: string | null;
}

export class DagViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'dbtNavigator.dagView';

    private view: vscode.WebviewView | undefined;
    private currentHighlightId: string | null = null;

    constructor(private projectManager: ProjectManager) {
        projectManager.onDidChangeActiveProject(() => {
            this.refresh();
        });
        projectManager.onDidManifestChange(() => {
            this.refresh();
        });
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this.getWebviewHtml();

        webviewView.webview.onDidReceiveMessage((message) => {
            if (message.type === 'openFile') {
                const project = this.projectManager.getActiveProject();
                if (project) {
                    const filePath = path.join(project.rootPath, message.filePath);
                    vscode.window.showTextDocument(vscode.Uri.file(filePath));
                }
            }
        });

        webviewView.onDidDispose(() => {
            this.view = undefined;
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.refresh();
            }
        });

        this.refresh();
    }

    onActiveFileChanged(fileUri: vscode.Uri): void {
        if (!this.view || !this.view.visible) {
            return;
        }

        const manifest = this.projectManager.getActiveManifest();
        if (!manifest) {
            return;
        }

        const project = this.projectManager.getActiveProject();
        if (!project) {
            return;
        }

        const relativePath = path.relative(project.rootPath, fileUri.fsPath);
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const node = manifest.modelsByFilePath.get(normalizedPath);

        const nodeId = node ? node.unique_id : null;
        if (nodeId !== this.currentHighlightId) {
            this.currentHighlightId = nodeId;
            this.view.webview.postMessage({
                type: 'highlight',
                nodeId,
            });
        }
    }

    private refresh(): void {
        if (!this.view || !this.view.visible) {
            return;
        }

        const manifest = this.projectManager.getActiveManifest();
        const project = this.projectManager.getActiveProject();

        if (!manifest || !project) {
            this.view.webview.postMessage({
                type: 'noManifest',
                projectName: project?.name ?? null,
            });
            return;
        }

        const graphData = this.buildGraphData(manifest);
        this.view.webview.postMessage({
            type: 'graphData',
            data: graphData,
        });
    }

    private buildGraphData(manifest: ParsedManifest): DagGraphData {
        const nodes: DagNode[] = manifest.allModels.map((model: ManifestNode) => ({
            id: model.unique_id,
            name: model.name,
            materialized: model.config.materialized ?? 'unknown',
            filePath: model.original_file_path,
        }));

        const edges: DagEdge[] = [];
        for (const [nodeId, children] of manifest.childMap) {
            for (const childId of children) {
                edges.push({ source: nodeId, target: childId });
            }
        }

        return {
            nodes,
            edges,
            highlightedNodeId: this.currentHighlightId,
        };
    }

    private getWebviewHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>dbt DAG</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            overflow: hidden;
            width: 100vw;
            height: 100vh;
        }
        #container {
            width: 100%;
            height: 100%;
        }
        #empty-state {
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 12px;
            color: var(--vscode-descriptionForeground);
        }
        #empty-state h2 { font-size: 14px; font-weight: 500; }
        #empty-state p { font-size: 12px; }

        svg {
            width: 100%;
            height: 100%;
        }
        .dag-node {
            cursor: pointer;
        }
        .dag-node rect {
            rx: 6;
            ry: 6;
            stroke-width: 1.5;
        }
        .dag-node.materialized-table rect {
            fill: var(--vscode-charts-blue, #4fc1ff);
            fill-opacity: 0.15;
            stroke: var(--vscode-charts-blue, #4fc1ff);
        }
        .dag-node.materialized-view rect {
            fill: var(--vscode-charts-green, #89d185);
            fill-opacity: 0.15;
            stroke: var(--vscode-charts-green, #89d185);
        }
        .dag-node.materialized-ephemeral rect {
            fill: var(--vscode-charts-yellow, #cca700);
            fill-opacity: 0.15;
            stroke: var(--vscode-charts-yellow, #cca700);
        }
        .dag-node.materialized-incremental rect {
            fill: var(--vscode-charts-purple, #b180d7);
            fill-opacity: 0.15;
            stroke: var(--vscode-charts-purple, #b180d7);
        }
        .dag-node.materialized-unknown rect {
            fill: var(--vscode-descriptionForeground);
            fill-opacity: 0.1;
            stroke: var(--vscode-descriptionForeground);
        }
        .dag-node.highlighted rect {
            stroke-width: 3;
            fill-opacity: 0.35;
        }
        .dag-node text {
            fill: var(--vscode-editor-foreground);
            font-size: 11px;
            dominant-baseline: central;
            text-anchor: middle;
        }
        .dag-edge {
            fill: none;
            stroke: var(--vscode-editorWidget-border, #555);
            stroke-width: 1.5;
            marker-end: url(#arrowhead);
        }
        #arrowhead path {
            fill: var(--vscode-editorWidget-border, #555);
        }
    </style>
</head>
<body>
    <div id="container">
        <div id="empty-state">
            <h2 id="empty-title">No DAG Available</h2>
            <p id="empty-message">Run <code>dbt compile</code> to generate the manifest.</p>
        </div>
        <svg id="dag-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <marker id="arrowhead" viewBox="0 0 10 7" refX="10" refY="3.5"
                    markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 3.5 L 0 7 z" />
                </marker>
            </defs>
            <g id="dag-root"></g>
        </svg>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const svgEl = document.getElementById('dag-svg');
        const rootGroup = document.getElementById('dag-root');
        const emptyState = document.getElementById('empty-state');
        const emptyTitle = document.getElementById('empty-title');
        const emptyMessage = document.getElementById('empty-message');

        let currentNodes = [];
        let currentEdges = [];
        let layoutData = null;

        // Pan and zoom state
        let viewBox = { x: 0, y: 0, w: 800, h: 600 };
        let isPanning = false;
        let panStart = { x: 0, y: 0 };

        svgEl.addEventListener('mousedown', (e) => {
            if (e.target === svgEl || e.target === rootGroup) {
                isPanning = true;
                panStart = { x: e.clientX, y: e.clientY };
            }
        });

        svgEl.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            const dx = (e.clientX - panStart.x) * (viewBox.w / svgEl.clientWidth);
            const dy = (e.clientY - panStart.y) * (viewBox.h / svgEl.clientHeight);
            viewBox.x -= dx;
            viewBox.y -= dy;
            panStart = { x: e.clientX, y: e.clientY };
            applyViewBox();
        });

        svgEl.addEventListener('mouseup', () => { isPanning = false; });
        svgEl.addEventListener('mouseleave', () => { isPanning = false; });

        svgEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            const scale = e.deltaY > 0 ? 1.1 : 0.9;
            const mouseX = e.offsetX / svgEl.clientWidth;
            const mouseY = e.offsetY / svgEl.clientHeight;
            const newW = viewBox.w * scale;
            const newH = viewBox.h * scale;
            viewBox.x += (viewBox.w - newW) * mouseX;
            viewBox.y += (viewBox.h - newH) * mouseY;
            viewBox.w = newW;
            viewBox.h = newH;
            applyViewBox();
        });

        function applyViewBox() {
            svgEl.setAttribute('viewBox', viewBox.x + ' ' + viewBox.y + ' ' + viewBox.w + ' ' + viewBox.h);
        }

        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'graphData':
                    showGraph(msg.data);
                    break;
                case 'highlight':
                    highlightNode(msg.nodeId);
                    break;
                case 'noManifest':
                    showEmpty(msg.projectName);
                    break;
            }
        });

        function showEmpty(projectName) {
            svgEl.style.display = 'none';
            emptyState.style.display = 'flex';
            if (projectName) {
                emptyTitle.textContent = 'No DAG Available for ' + projectName;
            } else {
                emptyTitle.textContent = 'No dbt Project Selected';
                emptyMessage.textContent = 'Open a file in a dbt project or use the project picker.';
            }
        }

        function showGraph(data) {
            emptyState.style.display = 'none';
            svgEl.style.display = 'block';
            currentNodes = data.nodes;
            currentEdges = data.edges;
            layoutAndRender(data.highlightedNodeId);
        }

        function highlightNode(nodeId) {
            document.querySelectorAll('.dag-node').forEach(el => {
                el.classList.toggle('highlighted', el.dataset.nodeId === nodeId);
            });

            // Scroll highlighted node into view
            if (nodeId && layoutData) {
                const nodeLayout = layoutData.get(nodeId);
                if (nodeLayout) {
                    viewBox.x = nodeLayout.x - viewBox.w / 2;
                    viewBox.y = nodeLayout.y - viewBox.h / 2;
                    applyViewBox();
                }
            }
        }

        function layoutAndRender(highlightedNodeId) {
            // Simple topological layout: assign layers based on longest path from root
            const nodeMap = new Map();
            currentNodes.forEach(n => nodeMap.set(n.id, n));

            const inDegree = new Map();
            const adj = new Map();
            currentNodes.forEach(n => {
                inDegree.set(n.id, 0);
                adj.set(n.id, []);
            });
            currentEdges.forEach(e => {
                if (inDegree.has(e.target)) {
                    inDegree.set(e.target, inDegree.get(e.target) + 1);
                }
                if (adj.has(e.source)) {
                    adj.get(e.source).push(e.target);
                }
            });

            // Assign layers via topological sort
            const layers = new Map();
            const queue = [];
            inDegree.forEach((deg, id) => {
                if (deg === 0) queue.push(id);
            });

            while (queue.length > 0) {
                const id = queue.shift();
                if (!layers.has(id)) layers.set(id, 0);
                const layer = layers.get(id);
                for (const child of (adj.get(id) || [])) {
                    const newLayer = layer + 1;
                    if (!layers.has(child) || layers.get(child) < newLayer) {
                        layers.set(child, newLayer);
                    }
                    inDegree.set(child, inDegree.get(child) - 1);
                    if (inDegree.get(child) === 0) {
                        queue.push(child);
                    }
                }
            }

            // Group nodes by layer
            const layerGroups = new Map();
            layers.forEach((layer, id) => {
                if (!layerGroups.has(layer)) layerGroups.set(layer, []);
                layerGroups.get(layer).push(id);
            });

            // Position nodes
            const nodeWidth = 140;
            const nodeHeight = 30;
            const layerGap = 80;
            const nodeGap = 40;
            const padding = 30;

            layoutData = new Map();
            layerGroups.forEach((ids, layer) => {
                ids.forEach((id, idx) => {
                    const x = padding + layer * (nodeWidth + layerGap) + nodeWidth / 2;
                    const y = padding + idx * (nodeHeight + nodeGap) + nodeHeight / 2;
                    layoutData.set(id, { x, y });
                });
            });

            // Render
            rootGroup.innerHTML = '';

            // Draw edges first (behind nodes)
            currentEdges.forEach(e => {
                const from = layoutData.get(e.source);
                const to = layoutData.get(e.target);
                if (!from || !to) return;

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', from.x + nodeWidth / 2);
                line.setAttribute('y1', from.y);
                line.setAttribute('x2', to.x - nodeWidth / 2);
                line.setAttribute('y2', to.y);
                line.classList.add('dag-edge');
                rootGroup.appendChild(line);
            });

            // Draw nodes
            currentNodes.forEach(n => {
                const pos = layoutData.get(n.id);
                if (!pos) return;

                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.classList.add('dag-node', 'materialized-' + n.materialized);
                g.dataset.nodeId = n.id;
                if (n.id === highlightedNodeId) {
                    g.classList.add('highlighted');
                }

                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', pos.x - nodeWidth / 2);
                rect.setAttribute('y', pos.y - nodeHeight / 2);
                rect.setAttribute('width', nodeWidth);
                rect.setAttribute('height', nodeHeight);
                g.appendChild(rect);

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', pos.x);
                text.setAttribute('y', pos.y);
                text.textContent = n.name;
                g.appendChild(text);

                g.addEventListener('click', () => {
                    vscode.postMessage({ type: 'openFile', filePath: n.filePath });
                });

                rootGroup.appendChild(g);
            });

            // Fit view
            const maxLayer = Math.max(...layerGroups.keys(), 0);
            const maxNodesInLayer = Math.max(...[...layerGroups.values()].map(g => g.length), 1);
            viewBox = {
                x: 0,
                y: 0,
                w: padding * 2 + (maxLayer + 1) * (nodeWidth + layerGap),
                h: padding * 2 + maxNodesInLayer * (nodeHeight + nodeGap),
            };
            applyViewBox();
        }
    </script>
</body>
</html>`;
    }
}
