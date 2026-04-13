export interface ManifestColumn {
    name: string;
    description: string;
    data_type: string | null;
}

export interface ManifestNode {
    unique_id: string;
    name: string;
    resource_type: string;
    package_name: string;
    original_file_path: string;
    path: string;
    fqn: string[];
    refs: ManifestRef[];
    depends_on: {
        macros: string[];
        nodes: string[];
    };
    config: {
        materialized?: string;
        [key: string]: unknown;
    };
    description: string;
    columns: Record<string, ManifestColumn>;
    database: string;
    schema: string;
}

export interface ManifestRef {
    name: string;
    package: string | null;
    version: string | null;
}

export interface ManifestMetadata {
    project_name: string;
    project_id: string;
    [key: string]: unknown;
}

export interface ManifestSource {
    unique_id: string;
    source_name: string;
    name: string;
    description: string;
    database: string;
    schema: string;
    columns: Record<string, ManifestColumn>;
}

export interface Manifest {
    metadata: ManifestMetadata;
    nodes: Record<string, ManifestNode>;
    parent_map: Record<string, string[]>;
    child_map: Record<string, string[]>;
    sources: Record<string, Record<string, unknown>>;
}

export interface ParsedManifest {
    projectName: string;
    modelsByName: Map<string, ManifestNode>;
    modelsByFilePath: Map<string, ManifestNode>;
    parentMap: Map<string, string[]>;
    childMap: Map<string, string[]>;
    allModels: ManifestNode[];
    sourcesByName: Map<string, ManifestSource[]>;
    allSources: ManifestSource[];
}

export interface DbtProject {
    name: string;
    rootPath: string;
    manifestPath: string;
    parsedManifest: ParsedManifest | null;
    hasManifest: boolean;
}
