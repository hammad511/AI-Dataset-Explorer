import { NextResponse } from 'next/server';
import type { ProjectSpec } from './schemas/types';
import { analyzeProjectSemantics } from './services/gemini/analyzeProject';
import { calculateDeterministicConfidence } from './services/ranking/confidenceCalculator';
import { scoreDataset } from './services/ranking/datasetScorer';
import { scoreModel } from './services/ranking/modelScorer';
import { calculateFeasibility } from './services/feasibility/calculateFeasibility';
import { estimateHardware } from './services/feasibility/estimateHardware';
import { searchKaggleDatasets } from './services/kaggle/searchDatasets';
import { searchHuggingFaceModels } from './services/huggingface/searchModels';
import { searchHuggingFaceDatasets } from './services/huggingface/searchDatasets';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — clearly labeled. ONLY returned when USE_MOCK_AI=true.
// Never silently falls back to this when OpenRouter fails.
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_ANALYSIS = {
    problem_statement: '[MOCK] Simulated analysis. Enable a live OpenRouter API key to get real results.',
    title: '[MOCK] AI Project Analysis',
    domain: 'Computer Vision',
    subdomain: 'General',
    data_modality: 'Images',
    input_type: 'Unknown',
    task: ['Image Classification'],
    secondary_tasks: [],
    target_type: 'categorical',
    target_labels: [],
    expected_output: 'Class label',
    constraints: [],
    primary_architecture: 'ResNet-50',
    alternative_architectures: ['EfficientNet', 'ViT'],
    architecture_reasoning: 'Default mock architecture.',
    pipeline_stages: [],
    required_dataset_properties: [],
    explicit_facts: ['MOCK MODE'],
    inferred_facts: [],
    unknown_facts: ['all real project details'],
    ambiguity_notes: ['MOCK MODE IS ACTIVE — set USE_MOCK_AI=false and provide a valid OPENROUTER_API_KEY'],
    confidence: {
        task_certainty: 0,
        domain_certainty: 0,
        modality_certainty: 0,
        target_certainty: 0,
        architecture_certainty: 0,
        score: 0,
        reason: 'Mock mode is active. No real analysis was performed.',
    },
};

function normalizeSingleText(value: unknown): string {
    if (Array.isArray(value)) return value.filter(Boolean).map(String).join(', ');
    return String(value ?? '').trim();
}

function hasImageIntent(query: string): boolean {
    const q = (query || '').toLowerCase();
    return /(image|images|mri|ct|x-ray|xray|scan|medical imaging|radiology|tumor|lesion|retinal|microscopy|histopathology|vision|cnn|classification.*image|camera|industrial|defect|scratch|crack|dent|surface damage|production line)/i.test(q);
}

function hasIndustrialDefectIntent(query: string): boolean {
    const q = (query || '').toLowerCase();
    return /(manufacturing|factory|industrial|production line|quality control|defect|crack|scratch|dent|missing component|surface damage|visual inspection|inspection|camera image|camera images|assembly line)/i.test(q);
}

function hasMedicalImageIntent(query: string): boolean {
    const q = (query || '').toLowerCase();
    return /(mri|ct|x-ray|xray|medical imaging|radiology|tumor|lesion|retinal|microscopy|histopathology|diagnosis)/i.test(q);
}

function applyImageAwareOverrides(query: string, analysis: Record<string, unknown>): Record<string, unknown> {
    if (!analysis || typeof analysis !== 'object') return analysis;
    const q = String(query || '');
    const isIndustrialDefectProject = hasIndustrialDefectIntent(q);
    const isMedicalProject = hasMedicalImageIntent(q);
    const isImageProject = hasImageIntent(q);
    if (!isImageProject) return analysis;

    const taskList = Array.isArray(analysis.task) && analysis.task.length > 0
        ? analysis.task.filter(Boolean).map(String)
        : [String((analysis as Record<string, unknown>).task ?? 'Image Classification')];
    const normalizedTasks = taskList.map((t: string) => t);

    if (isIndustrialDefectProject) {
        return {
            ...analysis,
            domain: analysis.domain || 'Manufacturing',
            subdomain: analysis.subdomain || 'Industrial Quality Inspection',
            data_modality: analysis.data_modality || 'Image',
            input_type: analysis.input_type || 'Camera image',
            task: normalizedTasks.length > 0 ? ['Defect Detection', 'Object Detection'] : ['Defect Detection', 'Object Detection'],
            primary_architecture: analysis.primary_architecture || 'YOLOv8',
            alternative_architectures: Array.isArray(analysis.alternative_architectures) && analysis.alternative_architectures.length > 0
                ? analysis.alternative_architectures
                : ['RT-DETR', 'Mask R-CNN', 'EfficientDet'],
            target_labels: Array.isArray(analysis.target_labels) && analysis.target_labels.length > 0
                ? analysis.target_labels
                : ['crack', 'scratch', 'dent', 'missing component', 'surface damage', 'no defect'],
            expected_output: analysis.expected_output || 'Bounding boxes or segmentation masks for defects with pass/fail classification in real-time.',
        };
    }

    if (isMedicalProject) {
        return {
            ...analysis,
            domain: analysis.domain || 'Healthcare',
            subdomain: analysis.subdomain || 'Medical Imaging',
            data_modality: analysis.data_modality || 'Image',
            input_type: analysis.input_type || 'Image',
            task: normalizedTasks.length > 0 ? normalizedTasks : ['Image Classification'],
            primary_architecture: analysis.primary_architecture || 'CNN',
            alternative_architectures: Array.isArray(analysis.alternative_architectures) && analysis.alternative_architectures.length > 0
                ? analysis.alternative_architectures
                : ['Vision Transformer (ViT)', 'ResNet', 'EfficientNet'],
            target_labels: Array.isArray(analysis.target_labels) && analysis.target_labels.length > 0
                ? analysis.target_labels
                : ['Disease present', 'Disease absent', 'Other relevant condition'],
            expected_output: analysis.expected_output || 'Classified diagnosis or disease label based on medical images.',
        };
    }

    // For all other image projects, trust the LLM analysis — do not apply domain overrides
    return analysis;
}

export async function POST(req: Request) {
    const DEBUG_API_TRACE = process.env.DEBUG_API_TRACE === 'true';
    const ROUTE_START = performance.now();
    const apiTrace = {
        openrouter: { called: false, success: false } as Record<string, any>,
        kaggle: { called: false, success: false } as Record<string, any>,
        huggingface: { called: false, success: false } as Record<string, any>
    };

    let query = '';
    let searchId: string | null = null;

    if (DEBUG_API_TRACE) {
        console.log('\n[SEARCH] request received');
    }

    try {
        const body = await req.json();
        query = (body.query ?? '').trim();
        searchId = body.searchId || null;

        if (!query) {
            return NextResponse.json({ message: 'Missing query', searchId }, { status: 400 });
        }

        const USE_MOCK_AI = process.env.USE_MOCK_AI === 'true';
        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

        // ── Semantic Analysis ──────────────────────────────────────────────
        let rawAnalysis: Record<string, unknown> | null = null;
        let aiMode: 'LIVE' | 'MOCK';

        if (USE_MOCK_AI) {
            rawAnalysis = { ...MOCK_ANALYSIS, problem_statement: query };
            aiMode = 'MOCK';
            if (DEBUG_API_TRACE) {
                console.log('mockAI=true');
            }
        } else {
            if (!OPENROUTER_API_KEY) {
                apiTrace.openrouter.reason = 'API key not configured';
                return NextResponse.json({
                    success: false,
                    source: 'provider',
                    status: 'failed',
                    ai_mode: 'LIVE',
                    error: {
                        type: 'MISSING_CREDENTIALS',
                        status: 500,
                        message: 'OPENROUTER_API_KEY is not configured on the server.',
                        hint: 'Add OPENROUTER_API_KEY to your .env.local file.',
                    },
                    mock_available: true,
                    searchId,
                    ...(DEBUG_API_TRACE && { apiTrace }),
                }, { status: 500 });
            }

            apiTrace.openrouter.called = true;
            if (DEBUG_API_TRACE) console.log('[OPENROUTER] START');
            const orStart = performance.now();
            try {
                rawAnalysis = await analyzeProjectSemantics(query, OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL, 'openrouter');
                const orDur = Math.round(performance.now() - orStart);
                apiTrace.openrouter.success = true;
                apiTrace.openrouter.durationMs = orDur;
                if (DEBUG_API_TRACE) {
                    console.log(`[OPENROUTER] END status=200 duration=${orDur}ms`);
                    console.log(`[OPENROUTER] project analysis generated`);
                }
            } catch (authError: any) {
                const orDur = Math.round(performance.now() - orStart);
                apiTrace.openrouter.success = false;
                apiTrace.openrouter.durationMs = orDur;
                let status = 500;
                try { status = JSON.parse(authError.message).status || 500; } catch { }
                apiTrace.openrouter.status = status;
                if (DEBUG_API_TRACE) {
                    console.log(`[OPENROUTER] END status=${status} duration=${orDur}ms`);
                }
                throw authError; // rethrow to keep standard block behavior
            }
            aiMode = 'LIVE';
        }

        // ── Confidence Calculation ─────────────────────────────────────────
        if (!rawAnalysis || typeof rawAnalysis !== 'object' || !rawAnalysis.title || !rawAnalysis.domain || !rawAnalysis.task || !rawAnalysis.data_modality) {
            throw new Error(JSON.stringify({
                type: 'INVALID_PROVIDER_RESPONSE',
                status: 502,
                message: 'The AI provider returned a malformed or incomplete project analysis payload. Missing required fields like title, domain, task, or data_modality.',
            }));
        }

        const imageAwareAnalysis = applyImageAwareOverrides(query, rawAnalysis);

        const taskString = Array.isArray(imageAwareAnalysis.task)
            ? imageAwareAnalysis.task.filter(Boolean).join(', ')
            : normalizeSingleText(imageAwareAnalysis.task || 'General AI task');

        const normalizedAnalysis: ProjectSpec = {
            problem_statement: String(imageAwareAnalysis.problem_statement ?? query),
            title: String(imageAwareAnalysis.title ?? 'AI Project Analysis'),
            domain: String(imageAwareAnalysis.domain ?? 'General AI'),
            subdomain: String(imageAwareAnalysis.subdomain ?? 'General'),
            data_modality: String(imageAwareAnalysis.data_modality ?? 'Text'),
            input_type: String(imageAwareAnalysis.input_type ?? 'Unknown'),
            task: taskString,
            secondary_tasks: Array.isArray(imageAwareAnalysis.secondary_tasks) ? imageAwareAnalysis.secondary_tasks.filter(Boolean).map(String) : [],
            target_type: String(imageAwareAnalysis.target_type ?? 'categorical'),
            target_labels: Array.isArray(imageAwareAnalysis.target_labels) ? imageAwareAnalysis.target_labels.filter(Boolean).map(String) : [],
            expected_output: String(imageAwareAnalysis.expected_output ?? 'Project output'),
            constraints: Array.isArray(imageAwareAnalysis.constraints) ? imageAwareAnalysis.constraints.filter(Boolean).map(String) : [],
            explicit_facts: Array.isArray(imageAwareAnalysis.explicit_facts) ? imageAwareAnalysis.explicit_facts.filter(Boolean).map(String) : [],
            inferred_facts: Array.isArray(imageAwareAnalysis.inferred_facts) ? imageAwareAnalysis.inferred_facts.filter(Boolean).map(String) : [],
            unknown_facts: Array.isArray(imageAwareAnalysis.unknown_facts) ? imageAwareAnalysis.unknown_facts.filter(Boolean).map(String) : [],
            ambiguity_notes: Array.isArray(imageAwareAnalysis.ambiguity_notes) ? imageAwareAnalysis.ambiguity_notes.filter(Boolean).map(String) : [],
            primary_architecture: String(imageAwareAnalysis.primary_architecture ?? 'Custom model'),
            alternative_architectures: Array.isArray(imageAwareAnalysis.alternative_architectures) ? imageAwareAnalysis.alternative_architectures.filter(Boolean).map(String) : [],
            architecture_reasoning: String(imageAwareAnalysis.architecture_reasoning ?? 'Selected based on task and modality requirements.'),
            confidence: {
                task_certainty: 0,
                domain_certainty: 0,
                modality_certainty: 0,
                target_certainty: 0,
                architecture_certainty: 0,
                score: 0,
                reason: 'Calculated from semantic analysis.',
            },
        };

        const confidence = calculateDeterministicConfidence(normalizedAnalysis, query.length);
        const spec: ProjectSpec = { ...normalizedAnalysis, confidence };

        // ── External Dataset/Model Retrieval ──────────────────────────────
        const [rawKaggle, rawHfModels, rawHfDatasets] = await Promise.all([
            searchKaggleDatasets(spec, apiTrace.kaggle),
            searchHuggingFaceModels(spec, apiTrace.huggingface),
            searchHuggingFaceDatasets(spec, apiTrace.huggingface)
        ]);

        if (DEBUG_API_TRACE) {
            console.log('[KAGGLE] START');
            console.log(`[KAGGLE] END status=${apiTrace.kaggle.status || 200} duration=${apiTrace.kaggle.durationMs || 0}ms`);
            console.log(`[KAGGLE] datasets returned=${apiTrace.kaggle.datasetsFound || 0}`);

            console.log('[HUGGINGFACE] START');
            console.log(`[HUGGINGFACE] END status=${apiTrace.huggingface.status || 200} duration=${apiTrace.huggingface.durationMs || 0}ms`);
            console.log(`[HUGGINGFACE] datasets returned=${apiTrace.huggingface.datasetsFound || 0}`);
        }

        const kaggleCandidates: Array<Record<string, unknown>> = [...rawKaggle, ...rawHfDatasets];
        const hfCandidates: Array<Record<string, unknown>> = rawHfModels;

        // ── Deterministic Scoring + Hard-Negative Filter ──────────────────
        const scoredDatasets = kaggleCandidates
            .map(d => scoreDataset(d, spec))
            .sort((a, b) => b.matchScore - a.matchScore);

        const nonRejectedDatasets = scoredDatasets.filter(d => !d.rejected);

        const scoredModels = hfCandidates
            .map((m) => scoreModel(m, spec))
            .sort((a, b) => b.matchScore - a.matchScore);

        const nonRejectedModels = scoredModels.filter(m => !m.rejected);

        if (DEBUG_API_TRACE) {
            console.log(`[FILTER] candidates before filtering=${kaggleCandidates.length}`);
            console.log(`[FILTER] hard-negative candidates removed=${kaggleCandidates.length - nonRejectedDatasets.length}`);
            console.log(`[FILTER] candidates after filtering=${nonRejectedDatasets.length}`);

            console.log(`[RANKING] scoring candidates=${nonRejectedDatasets.length}`);
        }

        const topDatasets = scoredDatasets.slice(0, 3);
        const topModels = scoredModels.slice(0, 3);
        const bestDataset = nonRejectedDatasets[0] ?? null;
        const bestModel = nonRejectedModels[0] ?? null;

        if (DEBUG_API_TRACE) {
            console.log(`[BEST DATASET] name="${bestDataset ? bestDataset.name : 'null'}"`);
            console.log(`[BEST DATASET] score=${bestDataset ? bestDataset.matchScore : 0}%`);
            console.log(`[MODEL SEARCH] models found=${nonRejectedModels.length}`);
        }

        // ── Feasibility & Hardware (Deterministic) ────────────────────────
        const feasibility = calculateFeasibility(
            scoredDatasets as typeof scoredDatasets,
            scoredModels as typeof scoredModels,
            Array.isArray(spec.task) ? spec.task.join(', ') : spec.task,
            spec.data_modality,
        );
        const hardware = estimateHardware(
            bestDataset as typeof bestDataset,
            bestModel as typeof bestModel,
            Array.isArray(spec.task) ? spec.task.join(', ') : spec.task,
            spec.data_modality,
        );

        if (DEBUG_API_TRACE) {
            console.log(`[FINAL] search completed duration=${Math.round(performance.now() - ROUTE_START)}ms`);
        }

        return NextResponse.json({
            success: true,
            ai_mode: aiMode,
            analysis: spec,
            results: {
                kaggle: topDatasets,
                hfModels: topModels,
                hfDatasets: [],
            },
            summary: {
                projectTitle: spec.title,
                domain: spec.domain,
                subdomain: spec.subdomain,
                task: spec.task,
                dataType: spec.data_modality,
                datasetsFound: topDatasets.filter(d => !d.rejected).length,
                modelsFound: topModels.filter(m => !m.rejected).length,
                bestDataset,
                bestModel,
            },
            feasibility,
            hardware,
            searchId,
            ...(DEBUG_API_TRACE && { apiTrace }),
        });

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unexpected server error.';
        console.error('[search/route] Error:', message, { query, searchId });

        // Try to parse a structured OpenRouter/provider error
        let errObj: Record<string, unknown> | null = null;
        if (e instanceof Error) {
            try { errObj = JSON.parse(e.message); } catch { /* raw error */ }
        }

        if (errObj?.type) {
            const statusValue = typeof errObj.status === 'number' ? errObj.status : 500;
            const httpStatus = statusValue < 600 ? statusValue : 500;

            if (DEBUG_API_TRACE) {
                console.log(`[FINAL] search completed duration=${Math.round(performance.now() - ROUTE_START)}ms`);
            }

            return NextResponse.json({
                success: false,
                source: 'openrouter',
                status: 'failed',
                ai_mode: 'LIVE',
                error: errObj,
                mock_available: true,
                searchId,
                ...(DEBUG_API_TRACE && { apiTrace }),
            }, { status: httpStatus });
        }

        if (DEBUG_API_TRACE) {
            console.log(`[FINAL] search completed duration=${Math.round(performance.now() - ROUTE_START)}ms`);
        }

        return NextResponse.json({
            success: false,
            source: 'server',
            status: 'failed',
            ai_mode: 'LIVE',
            error: {
                type: 'SERVER_ERROR',
                status: 500,
                message,
            },
            mock_available: true,
            searchId,
            ...(DEBUG_API_TRACE && { apiTrace }),
        }, { status: 500 });
    }
}
