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
            } else if (message.type === 'runCompile') {
                vscode.commands.executeCommand('dbt.compile');
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
        #container { width: 100%; height: 100%; position: relative; }

        #empty-state {
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 12px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px;
        }
        #empty-state h2 { font-size: 14px; font-weight: 500; }
        #empty-state p   { font-size: 12px; line-height: 1.5; }

        svg { width: 100%; height: 100%; cursor: grab; }
        svg.panning { cursor: grabbing; }

        /* ---- Node base ---- */
        .dag-node { cursor: pointer; }
        .dag-node rect { stroke-width: 1.5; transition: opacity 0.2s, filter 0.2s; }
        .dag-node text { pointer-events: none; user-select: none; }
        .dag-node .node-label {
            font-size: 11px;
            font-weight: 500;
            dominant-baseline: central;
            text-anchor: middle;
            fill: var(--vscode-editor-foreground);
        }
        .dag-node .node-badge {
            font-size: 9px;
            dominant-baseline: central;
            text-anchor: middle;
            fill: var(--vscode-descriptionForeground);
            opacity: 0.75;
        }

        /* ---- Materialization colors ---- */
        .dag-node.mat-table        rect { fill: rgba(79,193,255,0.10); stroke: #4fc1ff; }
        .dag-node.mat-view         rect { fill: rgba(137,209,133,0.10); stroke: #89d185; }
        .dag-node.mat-ephemeral    rect { fill: rgba(204,167,0,0.10);   stroke: #cca700; }
        .dag-node.mat-incremental  rect { fill: rgba(177,128,215,0.10); stroke: #b180d7; }
        .dag-node.mat-snapshot     rect { fill: rgba(255,152,0,0.10);   stroke: #ff9800; }
        .dag-node.mat-unknown      rect { fill: rgba(128,128,128,0.08); stroke: #808080; }

        /* ---- Highlighted (selected) ---- */
        .dag-node.highlighted rect { stroke-width: 2.5; }
        .dag-node.mat-table.highlighted        rect { fill: rgba(79,193,255,0.28);  filter: drop-shadow(0 0 5px rgba(79,193,255,0.55)); }
        .dag-node.mat-view.highlighted         rect { fill: rgba(137,209,133,0.28); filter: drop-shadow(0 0 5px rgba(137,209,133,0.55)); }
        .dag-node.mat-ephemeral.highlighted    rect { fill: rgba(204,167,0,0.28);   filter: drop-shadow(0 0 5px rgba(204,167,0,0.55)); }
        .dag-node.mat-incremental.highlighted  rect { fill: rgba(177,128,215,0.28); filter: drop-shadow(0 0 5px rgba(177,128,215,0.55)); }
        .dag-node.mat-snapshot.highlighted     rect { fill: rgba(255,152,0,0.28);   filter: drop-shadow(0 0 5px rgba(255,152,0,0.55)); }
        .dag-node.mat-unknown.highlighted      rect { fill: rgba(128,128,128,0.22); filter: drop-shadow(0 0 5px rgba(128,128,128,0.55)); }

        /* ---- Neighbor ---- */
        .dag-node.mat-table.neighbor        rect { fill: rgba(79,193,255,0.16); }
        .dag-node.mat-view.neighbor         rect { fill: rgba(137,209,133,0.16); }
        .dag-node.mat-ephemeral.neighbor    rect { fill: rgba(204,167,0,0.16); }
        .dag-node.mat-incremental.neighbor  rect { fill: rgba(177,128,215,0.16); }
        .dag-node.mat-snapshot.neighbor     rect { fill: rgba(255,152,0,0.16); }
        .dag-node.mat-unknown.neighbor      rect { fill: rgba(128,128,128,0.14); }

        /* ---- Dimmed (non-neighbor when something is selected) ---- */
        .dag-node.dimmed { opacity: 0.15; }

        /* ---- Edges ---- */
        .dag-edge {
            fill: none;
            stroke: var(--vscode-editorWidget-border, #555);
            stroke-width: 1.5;
            transition: opacity 0.2s, stroke-width 0.2s;
        }
        .dag-edge.edge-dimmed      { opacity: 0.06; }
        .dag-edge.edge-highlighted { stroke: var(--vscode-focusBorder, #007fd4); stroke-width: 2; opacity: 1; }

        #arrowhead    path { fill: var(--vscode-editorWidget-border, #555); }
        #arrowhead-hl path { fill: var(--vscode-focusBorder, #007fd4); }

        /* ---- Controls ---- */
        #controls {
            position: absolute; bottom: 12px; right: 12px;
            display: none; flex-direction: column; gap: 4px; z-index: 10;
        }
        .ctrl-btn {
            width: 26px; height: 26px;
            border: 1px solid var(--vscode-widget-border, #555);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border-radius: 4px; cursor: pointer; font-size: 15px;
            display: flex; align-items: center; justify-content: center;
            line-height: 1;
        }
        .ctrl-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(90,90,90,0.31)); }

        /* ---- Legend ---- */
        #legend {
            position: absolute; bottom: 12px; left: 12px;
            display: none; flex-wrap: wrap; gap: 8px; z-index: 10; max-width: 220px;
        }
        .legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--vscode-descriptionForeground); }
        .legend-swatch { width: 10px; height: 10px; border-radius: 2px; border: 1px solid; opacity: 0.85; }

        /* ---- Tooltip ---- */
        #tooltip {
            position: fixed;
            background: var(--vscode-editorHoverWidget-background, #252526);
            border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
            color: var(--vscode-editorHoverWidget-foreground, #cccccc);
            border-radius: 4px; padding: 4px 8px;
            font-size: 11px; pointer-events: none; z-index: 100;
            display: none; white-space: nowrap;
        }
    </style>
</head>
<body>
<div id="container">
    <div id="empty-state">
        <h2 id="empty-title">No DAG Available</h2>
        <p id="empty-message">Run <code>dbt compile</code> to generate the manifest.</p>
        <button id="compile-btn" style="display:none;margin-top:8px;padding:6px 14px;
            background:var(--vscode-button-background);color:var(--vscode-button-foreground);
            border:none;border-radius:3px;cursor:pointer;
            font-family:var(--vscode-font-family);font-size:12px;">
            Run dbt compile
        </button>
    </div>

    <svg id="dag-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <marker id="arrowhead" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="6" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 3.5 L 0 7 z"/>
            </marker>
            <marker id="arrowhead-hl" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="6" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 3.5 L 0 7 z"/>
            </marker>
        </defs>
        <g id="dag-root"></g>
    </svg>

    <div id="controls">
        <button class="ctrl-btn" id="btn-zi" title="Zoom in">+</button>
        <button class="ctrl-btn" id="btn-zo" title="Zoom out">&#8722;</button>
        <button class="ctrl-btn" id="btn-fit" title="Fit all (double-click canvas)">&#8862;</button>
    </div>

    <div id="legend">
        <div class="legend-item"><div class="legend-swatch" style="background:rgba(79,193,255,0.2);border-color:#4fc1ff"></div>table</div>
        <div class="legend-item"><div class="legend-swatch" style="background:rgba(137,209,133,0.2);border-color:#89d185"></div>view</div>
        <div class="legend-item"><div class="legend-swatch" style="background:rgba(204,167,0,0.2);border-color:#cca700"></div>ephemeral</div>
        <div class="legend-item"><div class="legend-swatch" style="background:rgba(177,128,215,0.2);border-color:#b180d7"></div>incremental</div>
        <div class="legend-item"><div class="legend-swatch" style="background:rgba(255,152,0,0.2);border-color:#ff9800"></div>snapshot</div>
    </div>

    <div id="tooltip"></div>
</div>

<script>
    var vscode     = acquireVsCodeApi();
    var svgEl      = document.getElementById('dag-svg');
    var rootGroup  = document.getElementById('dag-root');
    var emptyState = document.getElementById('empty-state');
    var emptyTitle = document.getElementById('empty-title');
    var emptyMsg   = document.getElementById('empty-message');
    var tooltipEl  = document.getElementById('tooltip');
    var controlsEl = document.getElementById('controls');
    var legendEl   = document.getElementById('legend');

    document.getElementById('compile-btn').addEventListener('click', function() {
        vscode.postMessage({ type: 'runCompile' });
    });
    document.getElementById('btn-zi').addEventListener('click',  function() { zoomStep(0.75); });
    document.getElementById('btn-zo').addEventListener('click',  function() { zoomStep(1.33); });
    document.getElementById('btn-fit').addEventListener('click', fitView);

    svgEl.addEventListener('dblclick', function(e) {
        if (e.target === svgEl || e.target === rootGroup) { fitView(); }
    });

    // ---- State ----
    var currentNodes = [];
    var currentEdges = [];
    var layoutData   = null;
    var fullVB       = null;
    var activeNodeId = null;

    // Layout constants
    var NODE_W    = 150;
    var NODE_H    = 34;
    var LAYER_GAP = 100;
    var NODE_GAP  = 16;
    var PADDING   = 40;

    // ---- ViewBox ----
    var vb        = { x: 0, y: 0, w: 800, h: 600 };
    var isPanning = false;
    var panStart  = { x: 0, y: 0 };
    var animReq   = null;

    svgEl.addEventListener('mousedown', function(e) {
        if (e.button !== 0) { return; }
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        svgEl.classList.add('panning');
    });
    window.addEventListener('mousemove', function(e) {
        if (!isPanning) { return; }
        var dx = (e.clientX - panStart.x) * (vb.w / svgEl.clientWidth);
        var dy = (e.clientY - panStart.y) * (vb.h / svgEl.clientHeight);
        vb.x -= dx; vb.y -= dy;
        panStart = { x: e.clientX, y: e.clientY };
        applyVB();
    });
    window.addEventListener('mouseup', function() {
        isPanning = false;
        svgEl.classList.remove('panning');
    });

    svgEl.addEventListener('wheel', function(e) {
        e.preventDefault();
        var factor = e.deltaY > 0 ? 1.12 : 0.89;
        var rect = svgEl.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width;
        var py = (e.clientY - rect.top)  / rect.height;
        var nw = vb.w * factor, nh = vb.h * factor;
        vb.x += (vb.w - nw) * px;
        vb.y += (vb.h - nh) * py;
        vb.w = nw; vb.h = nh;
        applyVB();
    }, { passive: false });

    function applyVB() {
        svgEl.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
    }

    function animateVB(target, duration) {
        if (!duration) { duration = 420; }
        if (animReq) { cancelAnimationFrame(animReq); }
        var sx = vb.x, sy = vb.y, sw = vb.w, sh = vb.h;
        var t0 = performance.now();
        function step(now) {
            var p = Math.min((now - t0) / duration, 1);
            var ease = 1 - Math.pow(1 - p, 3); // cubic ease-out
            vb.x = sx + (target.x - sx) * ease;
            vb.y = sy + (target.y - sy) * ease;
            vb.w = sw + (target.w - sw) * ease;
            vb.h = sh + (target.h - sh) * ease;
            applyVB();
            if (p < 1) { animReq = requestAnimationFrame(step); }
        }
        animReq = requestAnimationFrame(step);
    }

    function zoomStep(factor) {
        var cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
        vb.w *= factor; vb.h *= factor;
        vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
        applyVB();
    }

    function fitView() {
        if (fullVB) { animateVB(fullVB); }
    }

    // ---- Messages ----
    window.addEventListener('message', function(event) {
        var msg = event.data;
        if      (msg.type === 'graphData')  { showGraph(msg.data); }
        else if (msg.type === 'highlight')  { highlightNode(msg.nodeId); }
        else if (msg.type === 'noManifest') { showEmpty(msg.projectName); }
    });

    function showEmpty(projectName) {
        svgEl.style.display = 'none';
        emptyState.style.display = 'flex';
        controlsEl.style.display = 'none';
        legendEl.style.display = 'none';
        var btn = document.getElementById('compile-btn');
        if (projectName) {
            emptyTitle.textContent = 'No DAG Available for ' + projectName;
            emptyMsg.textContent = 'Run dbt compile to generate the manifest.';
            btn.style.display = 'inline-block';
        } else {
            emptyTitle.textContent = 'No dbt Project Selected';
            emptyMsg.textContent = 'Open a file in a dbt project or use the project picker.';
            btn.style.display = 'none';
        }
    }

    function showGraph(data) {
        emptyState.style.display = 'none';
        svgEl.style.display = 'block';
        controlsEl.style.display = 'flex';
        legendEl.style.display = 'flex';
        currentNodes = data.nodes;
        currentEdges = data.edges;
        activeNodeId = data.highlightedNodeId;
        layoutAndRender(data.highlightedNodeId);
    }

    // ---- Highlight & focus ----
    function highlightNode(nodeId) {
        activeNodeId = nodeId;
        var allNodes = document.querySelectorAll('.dag-node');
        var allEdges = document.querySelectorAll('.dag-edge');

        if (!nodeId) {
            allNodes.forEach(function(el) {
                el.classList.remove('highlighted', 'neighbor', 'dimmed');
            });
            allEdges.forEach(function(el) {
                el.classList.remove('edge-highlighted', 'edge-dimmed');
                el.setAttribute('marker-end', 'url(#arrowhead)');
            });
            if (fullVB) { animateVB(fullVB); }
            return;
        }

        // Build neighbor sets
        var parents  = new Set();
        var children = new Set();
        currentEdges.forEach(function(e) {
            if (e.target === nodeId) { parents.add(e.source); }
            if (e.source === nodeId) { children.add(e.target); }
        });
        var neighbors = new Set();
        parents.forEach(function(id)  { neighbors.add(id); });
        children.forEach(function(id) { neighbors.add(id); });

        allNodes.forEach(function(el) {
            var id = el.dataset.nodeId;
            el.classList.remove('highlighted', 'neighbor', 'dimmed');
            if      (id === nodeId)      { el.classList.add('highlighted'); }
            else if (neighbors.has(id))  { el.classList.add('neighbor'); }
            else                         { el.classList.add('dimmed'); }
        });

        allEdges.forEach(function(el) {
            var src = el.dataset.source;
            var tgt = el.dataset.target;
            el.classList.remove('edge-highlighted', 'edge-dimmed');
            if (src === nodeId || tgt === nodeId) {
                el.classList.add('edge-highlighted');
                el.setAttribute('marker-end', 'url(#arrowhead-hl)');
            } else {
                el.classList.add('edge-dimmed');
                el.setAttribute('marker-end', 'url(#arrowhead)');
            }
        });

        zoomToNeighborhood(nodeId, neighbors);
    }

    function zoomToNeighborhood(nodeId, neighbors) {
        if (!layoutData) { return; }
        var focus = [nodeId];
        neighbors.forEach(function(id) { focus.push(id); });

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        focus.forEach(function(id) {
            var pos = layoutData.get(id);
            if (!pos) { return; }
            if (pos.x - NODE_W / 2 < minX) { minX = pos.x - NODE_W / 2; }
            if (pos.y - NODE_H / 2 < minY) { minY = pos.y - NODE_H / 2; }
            if (pos.x + NODE_W / 2 > maxX) { maxX = pos.x + NODE_W / 2; }
            if (pos.y + NODE_H / 2 > maxY) { maxY = pos.y + NODE_H / 2; }
        });
        if (!isFinite(minX)) { return; }

        var pad = 80;
        var tw = maxX - minX + pad * 2;
        var th = maxY - minY + pad * 2;
        var tx = minX - pad;
        var ty = minY - pad;

        // Preserve SVG aspect ratio
        var svgAspect = svgEl.clientWidth / (svgEl.clientHeight || 1);
        if (tw / th < svgAspect) {
            var nw = th * svgAspect;
            tx -= (nw - tw) / 2;
            tw = nw;
        } else {
            var nh = tw / svgAspect;
            ty -= (nh - th) / 2;
            th = nh;
        }
        animateVB({ x: tx, y: ty, w: tw, h: th });
    }

    // ---- Layout & render ----
    function layoutAndRender(highlightedNodeId) {
        if (!currentNodes.length) { return; }

        // Build forward + backward adjacency
        var adj  = new Map();
        var radj = new Map();
        currentNodes.forEach(function(n) { adj.set(n.id, []); radj.set(n.id, []); });
        currentEdges.forEach(function(e) {
            if (adj.has(e.source) && adj.has(e.target)) {
                adj.get(e.source).push(e.target);
                radj.get(e.target).push(e.source);
            }
        });

        // Longest-path layer assignment via Kahn's algorithm
        var layers = new Map();
        var inDeg  = new Map();
        currentNodes.forEach(function(n) { inDeg.set(n.id, 0); });
        currentEdges.forEach(function(e) {
            if (inDeg.has(e.target)) { inDeg.set(e.target, inDeg.get(e.target) + 1); }
        });
        var queue = [];
        inDeg.forEach(function(d, id) { if (d === 0) { queue.push(id); } });
        while (queue.length) {
            var cur = queue.shift();
            if (!layers.has(cur)) { layers.set(cur, 0); }
            var curLayer = layers.get(cur);
            var kids = adj.get(cur) || [];
            for (var i = 0; i < kids.length; i++) {
                var child = kids[i];
                var nl = curLayer + 1;
                if (!layers.has(child) || layers.get(child) < nl) { layers.set(child, nl); }
                inDeg.set(child, inDeg.get(child) - 1);
                if (inDeg.get(child) === 0) { queue.push(child); }
            }
        }
        // Fallback for disconnected nodes
        currentNodes.forEach(function(n) { if (!layers.has(n.id)) { layers.set(n.id, 0); } });

        // Group by layer
        var layerGroups = new Map();
        layers.forEach(function(layer, id) {
            if (!layerGroups.has(layer)) { layerGroups.set(layer, []); }
            layerGroups.get(layer).push(id);
        });

        // Sort within each layer using barycentric heuristic to reduce edge crossings
        var sortedLayerNums = [];
        layerGroups.forEach(function(_, k) { sortedLayerNums.push(k); });
        sortedLayerNums.sort(function(a, b) { return a - b; });

        for (var li = 1; li < sortedLayerNums.length; li++) {
            var layNum     = sortedLayerNums[li];
            var prevLayNum = sortedLayerNums[li - 1];
            var prevIds    = layerGroups.get(prevLayNum) || [];
            var prevPos    = new Map();
            prevIds.forEach(function(id, idx) { prevPos.set(id, idx); });

            layerGroups.get(layNum).sort(function(a, b) {
                var parA = (radj.get(a) || []).filter(function(p) { return prevPos.has(p); });
                var parB = (radj.get(b) || []).filter(function(p) { return prevPos.has(p); });
                var avgA = parA.length ? parA.reduce(function(s, p) { return s + prevPos.get(p); }, 0) / parA.length : -1;
                var avgB = parB.length ? parB.reduce(function(s, p) { return s + prevPos.get(p); }, 0) / parB.length : -1;
                return avgA - avgB;
            });
        }

        // Assign pixel positions
        layoutData = new Map();
        layerGroups.forEach(function(ids, layer) {
            ids.forEach(function(id, idx) {
                var x = PADDING + layer * (NODE_W + LAYER_GAP) + NODE_W / 2;
                var y = PADDING + idx   * (NODE_H + NODE_GAP)  + NODE_H / 2;
                layoutData.set(id, { x: x, y: y });
            });
        });

        // Compute full bounding box and initial viewBox (fit-all)
        var maxLayerNum = sortedLayerNums[sortedLayerNums.length - 1] || 0;
        var maxNodes = 0;
        layerGroups.forEach(function(ids) { if (ids.length > maxNodes) { maxNodes = ids.length; } });
        var totalW = PADDING * 2 + (maxLayerNum + 1) * NODE_W + maxLayerNum * LAYER_GAP;
        var totalH = PADDING * 2 + maxNodes * NODE_H + (maxNodes > 0 ? maxNodes - 1 : 0) * NODE_GAP;

        var svgW = svgEl.clientWidth  || 400;
        var svgH = svgEl.clientHeight || 400;
        var svgAspect = svgW / svgH;
        var fw = totalW, fh = totalH;
        if (fw / fh < svgAspect) { fw = fh * svgAspect; }
        else                      { fh = fw / svgAspect; }
        fw *= 1.08; fh *= 1.08; // small margin
        fullVB = { x: (totalW - fw) / 2, y: (totalH - fh) / 2, w: fw, h: fh };
        vb = { x: fullVB.x, y: fullVB.y, w: fullVB.w, h: fullVB.h };
        applyVB();

        // ---- Render ----
        rootGroup.innerHTML = '';

        // Edges (drawn first, below nodes)
        var edgesEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        currentEdges.forEach(function(e) {
            var from = layoutData.get(e.source);
            var to   = layoutData.get(e.target);
            if (!from || !to) { return; }

            var x1 = from.x + NODE_W / 2, y1 = from.y;
            var x2 = to.x   - NODE_W / 2, y2 = to.y;
            var cx = (x1 + x2) / 2;

            var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d',
                'M ' + x1 + ' ' + y1 +
                ' C ' + cx + ' ' + y1 + ',' + cx + ' ' + y2 + ',' + x2 + ' ' + y2
            );
            pathEl.classList.add('dag-edge');
            pathEl.setAttribute('marker-end', 'url(#arrowhead)');
            pathEl.dataset.source = e.source;
            pathEl.dataset.target = e.target;
            edgesEl.appendChild(pathEl);
        });
        rootGroup.appendChild(edgesEl);

        // Nodes
        var nodesEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        currentNodes.forEach(function(n) {
            var pos = layoutData.get(n.id);
            if (!pos) { return; }
            var mat = n.materialized || 'unknown';

            var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.classList.add('dag-node', 'mat-' + mat);
            g.dataset.nodeId = n.id;
            if (n.id === highlightedNodeId) { g.classList.add('highlighted'); }

            var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x',      pos.x - NODE_W / 2);
            rect.setAttribute('y',      pos.y - NODE_H / 2);
            rect.setAttribute('width',  NODE_W);
            rect.setAttribute('height', NODE_H);
            rect.setAttribute('rx', '5');
            rect.setAttribute('ry', '5');
            g.appendChild(rect);

            // Model name (truncated with ellipsis)
            var maxChars = 19;
            var label = n.name.length > maxChars ? n.name.slice(0, maxChars - 1) + '\u2026' : n.name;
            var nameEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            nameEl.setAttribute('x', pos.x);
            nameEl.setAttribute('y', pos.y - 5);
            nameEl.classList.add('node-label');
            nameEl.textContent = label;
            g.appendChild(nameEl);

            // Materialization type badge
            var badgeEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badgeEl.setAttribute('x', pos.x);
            badgeEl.setAttribute('y', pos.y + 9);
            badgeEl.classList.add('node-badge');
            badgeEl.textContent = mat;
            g.appendChild(badgeEl);

            // Click to open file
            g.addEventListener('click', function() {
                vscode.postMessage({ type: 'openFile', filePath: n.filePath });
            });

            // Hover tooltip
            g.addEventListener('mouseenter', function() {
                tooltipEl.textContent = n.name + ' \u00b7 ' + mat;
                tooltipEl.style.display = 'block';
            });
            g.addEventListener('mousemove', function(ev) {
                tooltipEl.style.left = (ev.clientX + 14) + 'px';
                tooltipEl.style.top  = (ev.clientY - 32) + 'px';
            });
            g.addEventListener('mouseleave', function() {
                tooltipEl.style.display = 'none';
            });

            nodesEl.appendChild(g);
        });
        rootGroup.appendChild(nodesEl);

        // Apply highlight if a node is already active
        if (highlightedNodeId) {
            highlightNode(highlightedNodeId);
        }
    }
</script>
</body>
</html>`;
    }
}
