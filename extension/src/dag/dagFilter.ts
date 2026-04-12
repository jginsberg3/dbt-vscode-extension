/**
 * Pure functions for dbt selection syntax filtering.
 * No DOM, no VS Code API — safe to unit-test with Vitest.
 *
 * Supported syntax:
 *   my_model           – exact match only
 *   +my_model          – model + all ancestors (unlimited depth)
 *   my_model+          – model + all descendants (unlimited depth)
 *   +my_model+         – model + ancestors + descendants
 *   2+my_model         – model + up to 2 levels of ancestors
 *   my_model+3         – model + up to 3 levels of descendants
 *   tag:my_tag         – all models carrying that tag
 *   term1 term2        – space-separated = union of both selectors
 *
 * NOTE: This logic is also inlined as plain JavaScript inside the webview HTML
 * string in dagPanel.ts (search for "dbt selection syntax filter").
 * VS Code webviews cannot import TypeScript modules, so the two copies must be
 * kept in sync manually. If you change logic here, apply the same change there.
 */

export interface FilterNode {
    id: string;
    name: string;
    tags: string[];
}

export interface FilterEdge {
    source: string;
    target: string;
}

export interface ParsedSelector {
    type: 'name' | 'tag';
    value: string;
    upstreamDepth: number;   // 0 = no traversal, Infinity = unlimited
    downstreamDepth: number;
}

/**
 * Parse a single selector token (no spaces) into a structured descriptor.
 */
export function parseSelectorToken(token: string): ParsedSelector {
    token = token.trim();

    if (token.startsWith('tag:')) {
        return { type: 'tag', value: token.slice(4), upstreamDepth: 0, downstreamDepth: 0 };
    }

    let upstreamDepth = 0;
    let downstreamDepth = 0;
    let modelName = token;

    // Leading [N+] — upstream traversal
    const leadMatch = modelName.match(/^(\d*)(\+)/);
    if (leadMatch) {
        upstreamDepth = leadMatch[1] === '' ? Infinity : parseInt(leadMatch[1], 10);
        modelName = modelName.slice(leadMatch[0].length);
    }

    // Trailing [+N] — downstream traversal
    const trailMatch = modelName.match(/(\+)(\d*)$/);
    if (trailMatch) {
        downstreamDepth = trailMatch[2] === '' ? Infinity : parseInt(trailMatch[2], 10);
        modelName = modelName.slice(0, modelName.length - trailMatch[0].length);
    }

    return { type: 'name', value: modelName, upstreamDepth, downstreamDepth };
}

/**
 * BFS from `roots` through `adjMap`, stopping after `maxDepth` hops.
 * Returns the set of all visited node IDs (including the roots themselves).
 */
export function bfsDepthLimited(
    adjMap: Map<string, string[]>,
    roots: string[],
    maxDepth: number,
): Set<string> {
    const visited = new Set<string>();
    if (maxDepth === 0) { return visited; }
    const queue: Array<{ id: string; depth: number }> = roots.map(r => ({ id: r, depth: 0 }));
    while (queue.length) {
        const item = queue.shift()!;
        if (visited.has(item.id)) { continue; }
        visited.add(item.id);
        if (item.depth < maxDepth) {
            for (const neighbor of (adjMap.get(item.id) ?? [])) {
                if (!visited.has(neighbor)) {
                    queue.push({ id: neighbor, depth: item.depth + 1 });
                }
            }
        }
    }
    return visited;
}

/**
 * Build forward (adj) and reverse (radj) adjacency maps from nodes + edges.
 */
export function buildAdjacencyMaps(
    nodes: FilterNode[],
    edges: FilterEdge[],
): { adj: Map<string, string[]>; radj: Map<string, string[]> } {
    const adj = new Map<string, string[]>();
    const radj = new Map<string, string[]>();
    for (const n of nodes) { adj.set(n.id, []); radj.set(n.id, []); }
    for (const e of edges) {
        if (adj.has(e.source) && adj.has(e.target)) {
            adj.get(e.source)!.push(e.target);
            radj.get(e.target)!.push(e.source);
        }
    }
    return { adj, radj };
}

/**
 * Resolve a single parsed selector against the full node list.
 * Returns the set of matching node IDs (seeds + traversal).
 */
export function resolveSingleSelector(
    selector: ParsedSelector,
    nodes: FilterNode[],
    adj: Map<string, string[]>,
    radj: Map<string, string[]>,
): Set<string> {
    const seedIds = new Set<string>();

    if (selector.type === 'tag') {
        for (const n of nodes) {
            if (n.tags.includes(selector.value)) { seedIds.add(n.id); }
        }
    } else {
        const seed = nodes.find(n => n.name === selector.value);
        if (seed) { seedIds.add(seed.id); }
    }

    if (seedIds.size === 0) { return seedIds; }

    const result = new Set<string>(seedIds);
    for (const seedId of seedIds) {
        if (selector.upstreamDepth > 0) {
            for (const id of bfsDepthLimited(radj, [seedId], selector.upstreamDepth)) {
                result.add(id);
            }
        }
        if (selector.downstreamDepth > 0) {
            for (const id of bfsDepthLimited(adj, [seedId], selector.downstreamDepth)) {
                result.add(id);
            }
        }
    }
    return result;
}

/**
 * Apply a full dbt selection query string (space = union of selectors).
 * Returns the matched subset of nodes and the edges connecting them,
 * or null if the query is empty.
 *
 * Throws an Error with a human-readable message if the query is malformed.
 */
export function applyDbtSelection(
    query: string,
    nodes: FilterNode[],
    edges: FilterEdge[],
): { nodes: FilterNode[]; edges: FilterEdge[] } | null {
    const trimmed = query.trim();
    if (!trimmed) { return null; }

    const { adj, radj } = buildAdjacencyMaps(nodes, edges);
    const tokens = trimmed.split(/\s+/).filter(t => t.length > 0);

    const unionIds = new Set<string>();
    for (const token of tokens) {
        const selector = parseSelectorToken(token);
        if (selector.type === 'name' && !selector.value) {
            throw new Error(`Invalid selector: "${token}"`);
        }
        if (selector.type === 'tag' && !selector.value) {
            throw new Error(`Invalid selector: "${token}" — tag: requires a tag name`);
        }
        for (const id of resolveSingleSelector(selector, nodes, adj, radj)) {
            unionIds.add(id);
        }
    }

    const filteredNodes = nodes.filter(n => unionIds.has(n.id));
    const filteredEdges = edges.filter(e => unionIds.has(e.source) && unionIds.has(e.target));
    return { nodes: filteredNodes, edges: filteredEdges };
}
