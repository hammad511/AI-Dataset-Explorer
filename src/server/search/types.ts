/**
 * Search Engine Unified Types & Schemas
 *
 * Core data contracts for the Evidence-Aware AI Research Retrieval and Recommendation Engine.
 */

export type FactState = 'CONFIRMED' | 'INFERRED' | 'UNKNOWN';

export interface EvidenceFact<T = any> {
    value: T;
    state: FactState;
    confidence: number;
    source: string;
    verified: boolean;
    reasoning?: string;
}

export type Dimensionality = '2D' | '2.5D' | '3D' | '4D' | 'volumetric' | 'any' | 'unknown';

export type QualityTier = 'Tier A' | 'Tier B' | 'Tier C' | 'Tier D' | string;

export type EvidenceLevel = 'VERIFIED' | 'SUPPORTED' | 'PARTIAL' | 'UNVERIFIED';

export interface ExtractedAnatomy {
    primary: string[];
    organs: string[];
    excluded: string[];
}

export interface ExtractedConstraints {
    mustMatchAnatomy: boolean;
    mustMatchModality: boolean;
    mustMatchTask: boolean;
    prefer3D: boolean;
    requiredFormats?: string[];
    maxSizeBytes?: number;
    preferredLicense?: string;
}

export interface HardwareConstraints {
    maxVramGb: number | 'UNKNOWN';
    requiresEdge: boolean | 'UNKNOWN';
    gpuTarget: string | 'UNKNOWN';
}

export interface ProblemProfile {
    rawQuery: string;
    // Canonical query fields
    domain: string | 'UNKNOWN';
    subdomain: string | 'UNKNOWN';
    tasks: string[]; // Phase 1: List of all requested tasks
    modalities: string[];
    dimensionality: string | 'UNKNOWN';
    entities: string[];
    hardwareConstraints: HardwareConstraints;
    datasetRequirements: {
        minimumSize: number | 'UNKNOWN';
        temporalOrLongitudinal: boolean | 'UNKNOWN';
        labelType: string | 'UNKNOWN';
    };
    unspecifiedFields: string[]; // Explicitly track what we don't know
    
    // Legacy mappings (To ensure we don't break existing files during refactor, mapped from the above)
    originalQuery: string;
    primaryDomain: string;
    subDomain: string[];
    anatomy: any; // Allow ExtractedAnatomy or string[] fallback
    targetEntities: string[];
    modalitySubtypes: string[];
    acquisitionTechnique: string[];
    reconstructionTasks: string[];
    predictionTasks: string[];
    estimationTasks: string[];
    physiologicalTargets: string[];
    samplingStrategy: string[];
    temporalRequirement: string[];
    targetOutputs: string[];
    requiredCharacteristics: string[];
    preferredCharacteristics: string[];
    excludedDomains: string[];
    excludedAnatomy: string[];
    excludedTasks: string[];
    synonyms: Record<string, string[]>;
    datasetQueries: string[];
    modelQueries: string[];
    paperQueries: string[];
    benchmarkQueries: string[];
    ontologyTerms: string[];
    confidence: number;
    object?: string;
    labels?: string[];
    preferredSources?: string[];
    negativeConstraints?: string[];
    
    task: string;
    taskVariants: string[];
    modality: string[];
    sequence: string[];
    target: string[];
    annotation: string[];
    pretrainedModelRequired: boolean;
    datasetRequired: boolean;
    paperRequired: boolean;
    constraints: any;
    positiveEntities: string[];
    negativeEntities: string[];
    requiredConstraints: string[];
    preferredConstraints: string[];
    softPreferences: string[];
    specificEntityMentioned: string | null;
    parseConfidence: number;
    parseLog: string[];
}

export type StructuredQueryUnderstanding = ProblemProfile;
export type ResearchQuerySchema = ProblemProfile;

export interface MatchBreakdown {
    anatomy: number;          // 0-100
    modality: number;         // 0-100
    task: number;             // 0-100
    dimension: number;        // 0-100
    target: number;           // 0-100
    domain: number;           // 0-100
    semantic: number;         // 0-100
    evidence: number;         // 0-100
    metadata: number;         // 0-100
    accessibility: number;    // 0-100
    popularity: number;       // 0-100
    overall: number;          // 0-100
    confirmedClaims: string[];
    warnings: string[];
    disqualifications?: string[];
}

export interface EvidenceItem {
    claim: string;
    sourceField: 'title' | 'description' | 'readme' | 'modelCard' | 'tags' | 'abstract' | 'config' | 'doi';
    evidenceText: string;
    verified: boolean;
    strength: 'strong' | 'moderate' | 'weak';
}

/**
 * Normalized Search Result returned by all Provider Adapters (Kaggle, Hugging Face, OpenAlex, Semantic Scholar, arXiv, PubMed)
 */
export interface NormalizedSearchResult {
    id: string;
    source: string;
    title: string;
    description?: string;
    url?: string;
    authors?: string[];
    date?: string;
    tags?: string[];
    modality?: string | string[];
    anatomy?: string[];
    task?: string | string[];
    domain?: string | string[];
    format?: string | string[];
    license?: string;
    rawMetadata?: any;
    evidenceText?: string;
    retrievalQuery?: string;
    retrievalTier?: number;
    // Normalized optional fields for models/datasets/papers
    type?: 'dataset' | 'model' | 'paper';
    name?: string;
    downloads?: number | null;
    likes?: number | null;
    citationCount?: number | null;
    year?: number | null;
    venue?: string;
    doi?: string;
    pdfUrl?: string;
    paperUrl?: string;
    architecture?: string;
    pipelineTag?: string;
    framework?: string;
    parameters?: string | number | null;
    sizeBytes?: number | null;
    size?: string;
    metadata?: Record<string, unknown>;
}

export type MatchCategory = 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'RELATED_RESOURCE';

/**
 * High-Precision Ranked Result with Match Scoring, Evidence Calibration, and Verification Transparency
 */
export interface RankedResult extends NormalizedSearchResult {
    matchScore: number;                 // 0 - 100
    evidenceConfidence: number;         // 0 - 100
    tier: QualityTier;                  // 'Tier A' | 'Tier B' | 'Tier C' | 'Tier D'
    evidenceLevel: EvidenceLevel;       // 'VERIFIED' | 'SUPPORTED' | 'PARTIAL' | 'UNVERIFIED'
    matchCategory: MatchCategory;       // 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'RELATED_RESOURCE'
    
    // Explicit evidence verification sections
    whyMatches: string[];               // Reasons why candidate matches query constraints
    verifiedClaims: string[];           // Claims definitively verified in source metadata
    unverifiedClaims: string[];         // Explicitly unverified claims (e.g. "Radial k-space not verified")
    potentialLimitations: string[];     // Scientific or technical constraints
    potentialMismatches: string[];      // Partial mismatches detected
    
    matchBreakdown: MatchBreakdown;
    evidenceItems: EvidenceItem[];
    warnings: string[];
    matchReason: string;

    // Special verification flags for models and datasets
    isPretrainedCheckpointVerified?: boolean;
    checkpointStatusLabel?: string;     // 'VERIFIED CHECKPOINT' | 'ARCHITECTURE REFERENCE ONLY' | 'RESEARCH BASELINE'
    samplingCompatibilityVerified?: boolean;
    samplingCompatibilityNote?: string;

    // Cross-entity linkage
    paperRelationships?: {
        datasetId?: string;
        modelId?: string;
        summary?: string;
    };

    rejected?: boolean;
    rejectionReason?: string | null;
}

export interface RejectedResult {
    candidate: NormalizedSearchResult;
    reason: string;
    conflictType: 'anatomy' | 'modality' | 'task' | 'domain' | 'dimensionality' | 'other';
    stage?: string;
}

export interface UnifiedCandidate {
    id: string;
    source: 'kaggle' | 'huggingface' | 'semantic_scholar' | 'openalex' | 'arxiv' | 'pubmed' | string;
    type: 'dataset' | 'model' | 'paper';
    title: string;
    name?: string;
    description?: string;
    tags?: string[];
    url?: string;
    license?: string;
    domain?: string;
    task?: string;
    modality?: string | string[];
    modalities?: string[];
    dimensionality?: Dimensionality;
    anatomy?: string[];
    sequenceSubtypes?: string[];
    format?: string;
    formats?: string[];
    retrievalQuery?: string;
    retrievalTier?: number;
    size?: string;
    sizeBytes?: number | null;
    downloads?: number | null;
    likes?: number | null;
    citationCount?: number | null;
    authors?: string[];
    year?: number | null;
    venue?: string;
    doi?: string;
    paperUrl?: string;
    pdfUrl?: string;
    architecture?: string;
    pipelineTag?: string;
    framework?: string;
    parameters?: string | number | null;
    trainingDataset?: string;
    metadata: Record<string, unknown>;
    rawMetadata?: Record<string, unknown>;
    sourceScore?: number;

    // Computed Engine Attributes
    matchScore: number;
    confidenceScore?: number;
    match_level?: string;
    requirementMatches?: RequirementMatch[];
    verified?: RequirementMatch[];
    unknown?: RequirementMatch[];
    failed?: RequirementMatch[];
    tier: QualityTier;
    evidenceLevel: EvidenceLevel;
    evidenceSources: string[];
    evidenceStrength: number; // 0-100
    matchBreakdown: MatchBreakdown;
    evidence: EvidenceItem[];
    warnings: string[];
    rejected: boolean;
    rejectionReason: string | null;
    matchReason: string;
    relationship?: 'EXACT_DATASET' | 'EXACT_MODEL' | 'DIRECTLY_RELATED' | 'RELATED_RESEARCH';
    relationshipEvidence?: string;

    // Optional extensions matching RankedResult for unified consumption
    evidenceConfidence?: number;
    matchCategory?: MatchCategory;
    whyMatches?: string[];
    verifiedClaims?: string[];
    unverifiedClaims?: string[];
    potentialLimitations?: string[];
    potentialMismatches?: string[];
    evidenceItems?: EvidenceItem[];
    isPretrainedCheckpointVerified?: boolean;
    checkpointStatusLabel?: string;
    samplingCompatibilityVerified?: boolean;
    samplingCompatibilityNote?: string;
}

export interface CrossEncoderEvaluation {
    relevance: number;        // 0.0 - 1.0
    anatomyMatch: number;     // 0.0 - 1.0
    modalityMatch: number;    // 0.0 - 1.0
    taskMatch: number;        // 0.0 - 1.0
    dimensionMatch: number;   // 0.0 - 1.0
    targetMatch: number;      // 0.0 - 1.0
    domainMatch: number;      // 0.0 - 1.0
    suitability: number;      // 0.0 - 1.0
    evidenceQuality: number;  // 0.0 - 1.0
    reason: string;
}

export interface CandidateFunnelStats {
    retrieved: number;
    deduplicated: number;
    hardFiltered: number;
    semanticRanked: number;
    crossEncoderReranked: number;
    finalRecommended: number;
}

export interface SearchDiagnostics {
    funnel: CandidateFunnelStats;
    parsedQuery: StructuredQueryUnderstanding;
    generatedQueries: {
        datasetQueries: string[];
        modelQueries: string[];
        paperQueries: string[];
    };
    sourceDistribution: Record<string, number>;
    rejectionReasons: { id: string; title: string; reason: string }[];
    timingsMs: {
        queryUnderstanding: number;
        retrieval: number;
        deduplication: number;
        hardFilter: number;
        semanticRanking: number;
        crossEncoder: number;
        evidenceVerification: number;
        diversity: number;
        total: number;
    };
}

export interface PipelineTelemetry {
    retrievalCount: number;
    filteredCount: number;
    rerankedCount: number;
    finalCount: number;
    averageScore: number;
    lowConfidenceCount: number;
    sourceDistribution: Record<string, number>;
    rejectionReasonsCount: Record<string, number>;
}

export interface ResearchGraphNode {
    id: string;
    label: string;
    type: 'query' | 'anatomy' | 'task' | 'modality' | 'dataset' | 'model' | 'paper' | 'benchmark';
    metadata?: Record<string, any>;
}

export interface ResearchGraphEdge {
    source: string;
    target: string;
    relationship: string;
}

export interface ResearchGraph {
    nodes: ResearchGraphNode[];
    edges: ResearchGraphEdge[];
}

export interface SearchResult {
    query: string;
    constraints: StructuredQueryUnderstanding;
    datasets: UnifiedCandidate[];
    models: UnifiedCandidate[];
    papers: UnifiedCandidate[];
    tiers: {
        exactMatches: UnifiedCandidate[];
        strongMatches: UnifiedCandidate[];
        partialMatches: UnifiedCandidate[];
        relatedResources: UnifiedCandidate[];
    };
    researchGraph: ResearchGraph;
    diagnostics: SearchDiagnostics;
    telemetry: PipelineTelemetry;
    feasibility?: {
        status: string;
        gpuTarget: string;
        feasibility_score: number;
        level: string;
    };
    hardware?: {
        gpu_recommendation: string;
        vram_estimate: string;
        training_time_estimate: string;
        cost_estimate: string;
    };
    scientificSynthesis?: string;
    aiRationale?: string;
}

export interface UserFeedback {
    id: string;
    searchId: string;
    query: string;
    candidateId: string;
    candidateType: 'dataset' | 'model' | 'paper';
    rating: 'positive' | 'negative';
    reasons?: ('wrong_anatomy' | 'wrong_modality' | 'wrong_task' | 'wrong_dimensionality' | 'poor_quality' | 'irrelevant')[];
    comment?: string;
    createdAt: number;
}

export interface IRBenchmarkMetrics {
    precisionAt5: number;
    precisionAt10: number;
    recallAt10: number;
    ndcgAt10: number;
    mrr: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
    wrongAnatomyRate: number;
    wrongModalityRate: number;
    wrongTaskRate: number;
}

export interface IREvaluationComparison {
    queryId: string;
    query: string;
    baseline: IRBenchmarkMetrics;
    advanced: IRBenchmarkMetrics;
    improvementPercent: {
        precisionAt5: number;
        ndcgAt10: number;
        errorReduction: number;
    };
}

/**
 * Section 64 Master Research Search Response Schema
 */
export interface EmptyResult {
    status: 'NO_CANDIDATES_RETRIEVED' | 'CANDIDATES_FILTERED_OUT' | 'SOURCE_API_FAILED';
    message: string;
}

export interface ResearchSearchResponse {
    query: string;
    interpretation: ResearchQuerySchema;
    datasets: RankedResult[] | EmptyResult;
    models: RankedResult[] | EmptyResult;
    papers: RankedResult[] | EmptyResult;
    benchmarks: RankedResult[] | EmptyResult;
    rejectedResults?: RejectedResult[];
    searchDiagnostics: {
        providersUsed: string[];
        queriesExecuted: number;

        dataset_candidates_retrieved?: number;
        model_candidates_retrieved?: number;
        paper_candidates_retrieved?: number;
        dataset_filter_rejected?: number;
        model_filter_rejected?: number;
        dataset_final?: number;
        model_final?: number;

        candidatesRetrieved: number;
        candidatesAfterDeduplication: number;
        candidatesAfterFiltering: number;
        candidatesReranked: number;
        exactMatches: number;
        partialMatches: number;
        latencyMs: number;
        sourceDistribution?: Record<string, number>;
        rejectionReasons?: { id: string; title: string; reason: string }[];
    };
    searchEngineVersion: string;
    confidenceStatus?: string;
    lowConfidenceNotice?: string | null;
    topScore?: number;
    // Backwards-compatible mappings for existing UI features
    tiers?: {
        exactMatches: UnifiedCandidate[];
        strongMatches: UnifiedCandidate[];
        partialMatches: UnifiedCandidate[];
        relatedResources: UnifiedCandidate[];
    };
    researchGraph?: ResearchGraph;
    diagnostics?: SearchDiagnostics;
    telemetry?: PipelineTelemetry;
    hardware?: {
        gpu_recommendation: string;
        vram_estimate: string;
        training_time_estimate: string;
        cost_estimate: string;
    };
    feasibility?: {
        status: string;
        gpuTarget: string;
        feasibility_score: number;
        level: string;
    };
    scientificSynthesis?: string;
    aiRationale?: string;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// REQUIREMENT-AWARE CONFIDENCE SYSTEM TYPES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type RequirementCategory =
    | 'DOMAIN' | 'MODALITY' | 'TASK' | 'TARGET' | 'LONGITUDINAL'
    | 'MULTIMODAL' | 'CLINICAL' | 'DATA_SIZE' | 'LABEL_AVAILABILITY'
    | 'GPU' | 'COMPUTE' | 'MISSING_DATA' | 'CLASS_IMBALANCE'
    | 'PRETRAINING' | 'TEMPORAL' | 'POPULATION' | 'OTHER';

export type RequirementImportance = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type RequirementSatisfaction =
    | 'SATISFIED' | 'PARTIAL' | 'NOT_SATISFIED' | 'UNKNOWN' | 'CONFLICT';

/** Five-level match categorization â€” replaces the binary EXACT/PARTIAL label */
export type MatchLevel =
    | 'DIRECT_MATCH' | 'STRONG_MATCH' | 'PARTIAL_MATCH' | 'WEAK_MATCH' | 'NO_MATCH';

export interface Requirement {
    id: string;                        // e.g. "req_domain", "req_longitudinal"
    description: string;               // human-readable requirement text
    category: RequirementCategory;
    importance: RequirementImportance;
    isHard: boolean;                   // hard = violation caps final score
    detectedValue: string;             // what was parsed from the query
    weight: number;                    // 0â€“1, weights sum to 1.0 across all reqs
    confidence?: number;
    source?: 'explicit' | 'inferred' | 'metadata' | 'llm' | 'user-provided';
}

export interface RequirementMatch {
    requirementId: string;
    status: RequirementSatisfaction;
    evidence: string | null;           // text snippet from candidate metadata
    confidence: number;                // 0â€“1
    explanation: string;               // one-line reason
}

export interface RequirementProfile {
    requirements: Requirement[];
    hardRequirementIds: string[];
    softRequirementIds: string[];
    gpuVramLimitGb: number | null;
    isLongitudinal: boolean;
    isMultimodal: boolean;
    hasClinicalData: boolean;
    hasClassImbalance: boolean;
    hasMissingData: boolean;
    primaryDomainKeywords: string[];
    queryType: 'dataset' | 'model' | 'paper' | 'all';
    domain?: string | null;
    subdomain?: string | null;
    object?: string | null;
    input?: { type?: string | null; modality?: string | null; format?: string | null; dimensions?: string | null; structure?: string | null };
    output?: { type?: string | null; format?: string | null; labels?: string[]; classes?: string[] };
    entities?: string[];
    preferences?: string[];
    negativeRequirements?: string[];
    datasetRequirements?: { minimumSize?: number | null; maximumSize?: number | null; annotationRequired?: boolean | null; labelRequired?: boolean | null; license?: string[]; source?: string[]; publicAccess?: boolean | null };
    researchRequirements?: { year?: number | null; venue?: string[]; datasetSpecific?: boolean | null };
}

export interface CalibratedScore {
    finalScore: number;                // 0â€“100 after calibration + caps
    matchLevel: MatchLevel;
    requirementCoverage: number;       // 0â€“100 weighted coverage
    hardConstraintScore: number;       // 0â€“100 (0 = critical violation present)
    technicalCompatibility: number;    // 0â€“100 (especially for models)
    matchLevelExplanation: string;     // one-line human reason
    cappedBy: string | null;           // which cap rule triggered (null = no cap)
    scoringTrace: {
        crossEncoderContribution: number;
        requirementContribution: number;
        technicalContribution: number;
        evidenceContribution: number;
        rawBeforeCap: number;
        appliedCap: number | null;
        capReason: string | null;
    };
}

/** Requirement-aware fields extended onto RankedResult (all optional for compat) */
export interface RequirementAwareFields {
    requirementMatches?: RequirementMatch[];
    requirementCoverage?: number;
    hardConstraintScore?: number;
    technicalCompatibility?: number;
    matchLevel?: MatchLevel;
    matchLevelExplanation?: string;
    scoringTrace?: CalibratedScore['scoringTrace'];
    satisfiedRequirements?: string[];
    missingRequirements?: string[];
    unknownRequirements?: string[];
    conflictingRequirements?: string[];
}
