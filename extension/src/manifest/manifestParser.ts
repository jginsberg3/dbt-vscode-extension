import * as fs from 'fs';
import { Manifest, ManifestColumn, ManifestNode, ManifestSource, ParsedManifest } from './types';

export function parseManifest(manifestPath: string): ParsedManifest {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest: Manifest = JSON.parse(raw);

    const modelsByName = new Map<string, ManifestNode>();
    const modelsByFilePath = new Map<string, ManifestNode>();
    const allModels: ManifestNode[] = [];

    for (const [, node] of Object.entries(manifest.nodes)) {
        if (node.resource_type !== 'model') {
            continue;
        }
        modelsByName.set(node.name, node);
        modelsByFilePath.set(node.original_file_path, node);
        allModels.push(node);
    }

    // Build parent/child maps filtered to models only
    const parentMap = new Map<string, string[]>();
    const childMap = new Map<string, string[]>();

    for (const [nodeId, parents] of Object.entries(manifest.parent_map)) {
        if (modelsByName.has(nodeIdToName(nodeId))) {
            const modelParents = parents.filter(p => p.startsWith('model.'));
            parentMap.set(nodeId, modelParents);
        }
    }

    for (const [nodeId, children] of Object.entries(manifest.child_map)) {
        if (modelsByName.has(nodeIdToName(nodeId))) {
            const modelChildren = children.filter(c => c.startsWith('model.'));
            childMap.set(nodeId, modelChildren);
        }
    }

    // Parse sources
    const sourcesByName = new Map<string, ManifestSource[]>();
    const allSources: ManifestSource[] = [];

    for (const [, rawSource] of Object.entries(manifest.sources)) {
        const source: ManifestSource = {
            unique_id: rawSource['unique_id'] as string ?? '',
            source_name: rawSource['source_name'] as string ?? '',
            name: rawSource['name'] as string ?? '',
            description: rawSource['description'] as string ?? '',
            database: rawSource['database'] as string ?? '',
            schema: rawSource['schema'] as string ?? '',
            columns: rawSource['columns'] as Record<string, ManifestColumn> ?? {},
        };
        allSources.push(source);

        const existing = sourcesByName.get(source.source_name) ?? [];
        existing.push(source);
        sourcesByName.set(source.source_name, existing);
    }

    return {
        projectName: manifest.metadata.project_name,
        modelsByName,
        modelsByFilePath,
        parentMap,
        childMap,
        allModels,
        sourcesByName,
        allSources,
    };
}

function nodeIdToName(uniqueId: string): string {
    // unique_id format: "model.project_name.model_name"
    const parts = uniqueId.split('.');
    return parts[parts.length - 1];
}
