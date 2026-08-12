import type { ConfidenceBreakdown } from '../ranking/confidenceCalculator';

export interface ProjectSpec {
    problem_statement: string;
    title: string;
    domain: string;
    subdomain: string;
    data_modality: string;
    input_type: string;
    task: string;
    secondary_tasks: string[];
    target_type: string;
    target_labels: string[];
    expected_output: string;
    constraints: string[];
    explicit_facts: string[];
    inferred_facts: string[];
    unknown_facts: string[];
    ambiguity_notes: string[];
    primary_architecture: string;
    alternative_architectures: string[];
    architecture_reasoning: string;
    confidence: ConfidenceBreakdown;
}

export interface NormalizedDataset {
    id: string;
    name: string;
    title?: string;
    subtitle?: string;
    source: 'Kaggle' | 'Hugging Face';
    url: string;
    description: string;
    domain: string;
    subdomain: string;
    modality: string;
    tasks: string[];
    targetLabels: string[];
    sizeBytes: number | null;
    license: string;
    creator: string;
    downloads: number | null;
    tags: string[];
    files: string[];
    metadataQuality: number;
    matchScore: number;
    scoreBreakdown: {
        task: number;
        modality: number;
        domain: number;
        subdomain: number;
        target: number;
        metadata: number;
    };
    rejected: boolean;
    rejectionReason: string | null;
    matchReason: string;
}

export interface NormalizedModel {
    id: string;
    name: string;
    source: 'Hugging Face';
    url: string;
    task: string;
    modality: string;
    architecture: string;
    framework: string;
    parameters: number | null;
    license: string;
    downloads: number | null;
    likes: number | null;
    benchmarkEvidence: string[];
    matchScore: number;
    scoreBreakdown: {
        task: number;
        modality: number;
        architecture: number;
        benchmark: number;
        efficiency: number;
        popularity: number;
    };
    rejected: boolean;
    rejectionReason: string | null;
    matchReason: string;
}

export interface ProjectFeasibility {
    datasetAvailability: number;
    modelAvailability: number;
    /** Higher = more computationally accessible (easier to train/run). */
    computationalFeasibility: number;
    documentation: number;
    datasetQuality: number;
    overallScore: number;
    level: string;
}

export interface HardwareEstimate {
    gpu: { recommendedClass: string; vramRequirement: string; };
    ram: { minimum: string; recommended: string; };
    storage: { dataset: string; workingSpace: string; };
    cloudAlternative: string;
}

export interface SearchResponsePayload {
    intent: string;
    analysis: ProjectSpec | null;
    results: {
        kaggle: NormalizedDataset[];
        hfModels: NormalizedModel[];
        hfDatasets: NormalizedDataset[];
    };
    summary: {
        projectTitle: string;
        domain: string;
        subdomain: string;
        task: string;
        dataType: string;
        datasetsFound: number;
        modelsFound: number;
        bestDataset: NormalizedDataset | null;
        bestModel: NormalizedModel | null;
    };
    feasibility: ProjectFeasibility | null;
    hardware: HardwareEstimate | null;
}
