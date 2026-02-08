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

export interface Manifest {
    metadata: ManifestMetadata;
    nodes: Record<string, ManifestNode>;
    parent_map: Record<string, string[]>;
    child_map: Record<string, string[]>;
    sources: Record<string, ManifestNode>;
}

export interface ParsedManifest {
    projectName: string;
    modelsByName: Map<string, ManifestNode>;
    modelsByFilePath: Map<string, ManifestNode>;
    parentMap: Map<string, string[]>;
    childMap: Map<string, string[]>;
    allModels: ManifestNode[];
}

export interface DbtProject {
    name: string;
    rootPath: string;
    manifestPath: string;
    parsedManifest: ParsedManifest | null;
    hasManifest: boolean;
}
