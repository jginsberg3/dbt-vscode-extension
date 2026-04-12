import { describe, it, expect } from 'vitest';
import {
    parseSelectorToken,
    bfsDepthLimited,
    applyDbtSelection,
    buildAdjacencyMaps,
    resolveSingleSelector,
    FilterNode,
    FilterEdge,
} from '../src/dag/dagFilter';

// Fixture graph:
//   stg_orders → customers → revenue
//   stg_orders → revenue
//
//   stg_orders: root (no model parents), tagged "staging"
//   customers:  depends on stg_orders
//   revenue:    depends on customers AND stg_orders

const nodes: FilterNode[] = [
    { id: 'model.proj.stg_orders', name: 'stg_orders', tags: ['staging'] },
    { id: 'model.proj.customers',  name: 'customers',  tags: [] },
    { id: 'model.proj.revenue',    name: 'revenue',    tags: [] },
];

const edges: FilterEdge[] = [
    { source: 'model.proj.stg_orders', target: 'model.proj.customers' },
    { source: 'model.proj.stg_orders', target: 'model.proj.revenue' },
    { source: 'model.proj.customers',  target: 'model.proj.revenue' },
];

// Helper to get node names from a result set
function names(result: { nodes: FilterNode[] } | null): string[] {
    return (result?.nodes ?? []).map(n => n.name).sort();
}

// ---- parseSelectorToken ----

describe('parseSelectorToken', () => {
    it('parses a bare model name as exact match (no traversal)', () => {
        const s = parseSelectorToken('customers');
        expect(s).toEqual({ type: 'name', value: 'customers', upstreamDepth: 0, downstreamDepth: 0 });
    });

    it('parses leading + as unlimited upstream', () => {
        const s = parseSelectorToken('+customers');
        expect(s).toEqual({ type: 'name', value: 'customers', upstreamDepth: Infinity, downstreamDepth: 0 });
    });

    it('parses trailing + as unlimited downstream', () => {
        const s = parseSelectorToken('customers+');
        expect(s).toEqual({ type: 'name', value: 'customers', upstreamDepth: 0, downstreamDepth: Infinity });
    });

    it('parses +model+ as unlimited both directions', () => {
        const s = parseSelectorToken('+customers+');
        expect(s).toEqual({ type: 'name', value: 'customers', upstreamDepth: Infinity, downstreamDepth: Infinity });
    });

    it('parses N+ prefix as depth-limited upstream', () => {
        const s = parseSelectorToken('2+customers');
        expect(s).toEqual({ type: 'name', value: 'customers', upstreamDepth: 2, downstreamDepth: 0 });
    });

    it('parses +N suffix as depth-limited downstream', () => {
        const s = parseSelectorToken('customers+3');
        expect(s).toEqual({ type: 'name', value: 'customers', upstreamDepth: 0, downstreamDepth: 3 });
    });

    it('parses N+model+M as depth-limited both directions', () => {
        const s = parseSelectorToken('2+customers+3');
        expect(s).toEqual({ type: 'name', value: 'customers', upstreamDepth: 2, downstreamDepth: 3 });
    });

    it('parses tag: selector', () => {
        const s = parseSelectorToken('tag:staging');
        expect(s).toEqual({ type: 'tag', value: 'staging', upstreamDepth: 0, downstreamDepth: 0 });
    });

    it('parses tag: with empty value', () => {
        const s = parseSelectorToken('tag:');
        expect(s).toEqual({ type: 'tag', value: '', upstreamDepth: 0, downstreamDepth: 0 });
    });
});

// ---- bfsDepthLimited ----

describe('bfsDepthLimited', () => {
    const { adj } = buildAdjacencyMaps(nodes, edges);

    it('returns empty set for maxDepth 0', () => {
        const result = bfsDepthLimited(adj, ['model.proj.stg_orders'], 0);
        expect(result.size).toBe(0);
    });

    it('returns root + direct neighbors for maxDepth 1', () => {
        const result = bfsDepthLimited(adj, ['model.proj.stg_orders'], 1);
        expect([...result].sort()).toEqual([
            'model.proj.customers',
            'model.proj.revenue',
            'model.proj.stg_orders',
        ].sort());
    });

    it('traverses all reachable nodes (including root) for maxDepth Infinity', () => {
        const result = bfsDepthLimited(adj, ['model.proj.stg_orders'], Infinity);
        expect([...result].sort()).toEqual([
            'model.proj.customers',
            'model.proj.revenue',
            'model.proj.stg_orders',
        ].sort());
    });

    it('includes the root itself in the visited set', () => {
        const result = bfsDepthLimited(adj, ['model.proj.stg_orders'], Infinity);
        expect(result.has('model.proj.stg_orders')).toBe(true);
    });
});

// ---- applyDbtSelection ----

describe('applyDbtSelection', () => {
    it('returns null for empty query', () => {
        expect(applyDbtSelection('', nodes, edges)).toBeNull();
        expect(applyDbtSelection('   ', nodes, edges)).toBeNull();
    });

    it('exact match: returns only the named model', () => {
        expect(names(applyDbtSelection('customers', nodes, edges))).toEqual(['customers']);
    });

    it('upstream (+model): returns model + all ancestors', () => {
        expect(names(applyDbtSelection('+customers', nodes, edges))).toEqual(['customers', 'stg_orders'].sort());
    });

    it('downstream (model+): returns model + all descendants', () => {
        expect(names(applyDbtSelection('customers+', nodes, edges))).toEqual(['customers', 'revenue'].sort());
    });

    it('both (+model+): returns model + ancestors + descendants', () => {
        expect(names(applyDbtSelection('+customers+', nodes, edges))).toEqual(['customers', 'revenue', 'stg_orders'].sort());
    });

    it('root with downstream (model+): returns all descendants', () => {
        expect(names(applyDbtSelection('stg_orders+', nodes, edges))).toEqual(['customers', 'revenue', 'stg_orders'].sort());
    });

    it('leaf with upstream (+model): returns full upstream chain', () => {
        expect(names(applyDbtSelection('+revenue', nodes, edges))).toEqual(['customers', 'revenue', 'stg_orders'].sort());
    });

    it('depth-limited upstream (1+revenue): returns revenue + direct parents only', () => {
        // revenue's direct parents: customers, stg_orders (both 1 hop away)
        expect(names(applyDbtSelection('1+revenue', nodes, edges))).toEqual(['customers', 'revenue', 'stg_orders'].sort());
    });

    it('depth-limited upstream (1+customers): returns customers + stg_orders (1 hop)', () => {
        expect(names(applyDbtSelection('1+customers', nodes, edges))).toEqual(['customers', 'stg_orders'].sort());
    });

    it('depth-limited downstream (revenue+1): returns only revenue (no children)', () => {
        expect(names(applyDbtSelection('revenue+1', nodes, edges))).toEqual(['revenue']);
    });

    it('depth-limited downstream (stg_orders+1): returns stg_orders + direct children', () => {
        // direct children of stg_orders: customers, revenue
        expect(names(applyDbtSelection('stg_orders+1', nodes, edges))).toEqual(['customers', 'revenue', 'stg_orders'].sort());
    });

    it('zero-depth N: limits traversal correctly', () => {
        // 0+customers means upstream depth 0 — only the model itself
        const s = parseSelectorToken('0+customers');
        expect(s.upstreamDepth).toBe(0);
        const { adj, radj } = buildAdjacencyMaps(nodes, edges);
        const result = resolveSingleSelector(s, nodes, adj, radj);
        expect([...result]).toEqual(['model.proj.customers']);
    });

    it('non-existent model returns empty nodes', () => {
        expect(names(applyDbtSelection('does_not_exist', nodes, edges))).toEqual([]);
    });

    it('tag selector: returns all models with matching tag', () => {
        expect(names(applyDbtSelection('tag:staging', nodes, edges))).toEqual(['stg_orders']);
    });

    it('tag selector: unknown tag returns empty', () => {
        expect(names(applyDbtSelection('tag:unknown', nodes, edges))).toEqual([]);
    });

    it('space-separated union: combines results of multiple selectors', () => {
        // "customers revenue" = exact match on both
        expect(names(applyDbtSelection('customers revenue', nodes, edges))).toEqual(['customers', 'revenue'].sort());
    });

    it('union of selectors with traversal', () => {
        // "+customers stg_orders+" should include both directions
        expect(names(applyDbtSelection('+customers stg_orders+', nodes, edges))).toEqual(['customers', 'revenue', 'stg_orders'].sort());
    });

    it('filtered edges only include edges between matched nodes', () => {
        const result = applyDbtSelection('customers+', nodes, edges)!;
        // Should include customers→revenue but NOT stg_orders→customers or stg_orders→revenue
        expect(result.edges).toHaveLength(1);
        expect(result.edges[0]).toEqual({ source: 'model.proj.customers', target: 'model.proj.revenue' });
    });

    it('throws for malformed selector (bare plus with no model)', () => {
        expect(() => applyDbtSelection('+', nodes, edges)).toThrow();
    });
});
