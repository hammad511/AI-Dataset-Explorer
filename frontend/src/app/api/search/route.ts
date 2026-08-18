import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
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
import {
    enrichDataset,
    computeSearchCoverage,
    analyzeDatasetCompatibility,
    suggestLabelMapping,
    generateRecommendationCategories,
    generateSmartRecommendation,
} from './services/ranking/enrichDataset';

// API states used in the audit object
type ApiStatus =
    | 'NOT_CONFIGURED'
    | 'NOT_CALLED'
    | 'CALL_STARTED'
    | 'CALLED_SUCCESSFULLY'
    | 'CALLED_FAILED'
    | 'TIMED_OUT'
    | 'PARSE_FAILED'
    | 'MOCKED';

interface ApiAuditEntry {
    status: ApiStatus;
    called: boolean;
    success: boolean;
    httpStatus?: number;
    responseTimeMs?: number;
    resultsReturned?: number;
    endpoint?: string;
    error?: string;
}

interface ApiAudit {
    openrouter: ApiAuditEntry;
    kaggle: ApiAuditEntry;
    huggingface: ApiAuditEntry;
    huggingfaceModels: ApiAuditEntry;
    huggingfaceDatasets: ApiAuditEntry;
}

// Mock analysis data - ONLY used when USE_MOCK_AI=true
const MOCK_ANALYSIS = {
    problem_statement: '[MOCK] Simulated analysis. Set USE_MOCK_AI=false with a valid OPENROUTER_API_KEY for real results.',
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
        task_certainty: 0, domain_certainty: 0, modality_certainty: 0,
        target_certainty: 0, architecture_certainty: 0, score: 0,
        reason: 'Mock mode is active. No real analysis was performed.',
    },
};

function normalizeSingleText(value: unknown): string {
    if (Array.isArray(value)) return value.filter(Boolean).map(String).join(', ');
    return String(value ?? '').trim();
}

function hasImageIntent(query: string): boolean {
    return /(image|images|mri|ct|x-ray|xray|scan|medical imaging|radiology|tumor|lesion|retinal|microscopy|histopathology|vision|cnn|classification.*image|camera|industrial|defect|scratch|crack|dent|surface damage|production line)/i.test(query || '');
}
function hasIndustrialDefectIntent(query: string): boolean {
    return /(manufacturing|factory|industrial|production line|quality control|defect|crack|scratch|dent|missing component|surface damage|visual inspection|inspection|camera image|camera images|assembly line)/i.test(query || '');
}
function hasMedicalImageIntent(query: string): boolean {
    return /(mri|ct|x-ray|xray|medical imaging|radiology|tumor|lesion|retinal|microscopy|histopathology|diagnosis)/i.test(query || '');
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
        : [String(analysis.task ?? 'Image Classification')];
    if (isIndustrialDefectProject) {
        return {
            ...analysis,
            domain: analysis.domain || 'Manufacturing',
            subdomain: analysis.subdomain || 'Industrial Quality Inspection',
            data_modality: analysis.data_modality || 'Image',
            input_type: analysis.input_type || 'Camera image',
            task: ['Defect Detection', 'Object Detection'],
            primary_architecture: analysis.primary_architecture || 'YOLOv8',
            alternative_architectures: Array.isArray(analysis.alternative_architectures) && analysis.alternative_architectures.length > 0
                ? analysis.alternative_architectures : ['RT-DETR', 'Mask R-CNN', 'EfficientDet'],
            target_labels: Array.isArray(analysis.target_labels) && analysis.target_labels.length > 0
                ? analysis.target_labels : ['crack', 'scratch', 'dent', 'missing component', 'surface damage', 'no defect'],
            expected_output: analysis.expected_output || 'Bounding boxes or segmentation masks for defects with pass/fail classification.',
        };
    }
    if (isMedicalProject) {
        return {
            ...analysis,
            domain: analysis.domain || 'Healthcare',
            subdomain: analysis.subdomain || 'Medical Imaging',
            data_modality: analysis.data_modality || 'Image',
            input_type: analysis.input_type || 'Image',
            task: taskList.length > 0 ? taskList : ['Image Classification'],
            primary_architecture: analysis.primary_architecture || 'CNN',
            alternative_architectures: Array.isArray(analysis.alternative_architectures) && analysis.alternative_architectures.length > 0
                ? analysis.alternative_architectures : ['Vision Transformer (ViT)', 'ResNet', 'EfficientNet'],
            target_labels: Array.isArray(analysis.target_labels) && analysis.target_labels.length > 0
                ? analysis.target_labels : ['Disease present', 'Disease absent', 'Other relevant condition'],
            expected_output: analysis.expected_output || 'Classified diagnosis or disease label based on medical images.',
        };
    }
    return analysis;
}

// ── Rate limiting — in-process sliding window (single-instance / dev use) ──────
// PRODUCTION NOTE: Replace with Redis/Upstash for multi-instance deployments.
const ipRequestLog = new Map<string, number[]>();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_RPM || '10', 10); // requests per minute per IP

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const windowMs = 60_000;
    const requests = (ipRequestLog.get(ip) || []).filter(t => now - t < windowMs);
    if (requests.length >= RATE_LIMIT) return true;
    requests.push(now);
    ipRequestLog.set(ip, requests);
    // Cleanup old IPs periodically
    if (ipRequestLog.size > 5000) {
        for (const [k, v] of ipRequestLog) {
            if (v.every(t => now - t > windowMs)) ipRequestLog.delete(k);
        }
    }
    return false;
}

export async function POST(req: Request) {
    // Authentication guard — reject unauthenticated callers
    const token = await getToken({ req: req as any, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
        return NextResponse.json({ success: false, error: { type: 'UNAUTHORIZED', status: 401, message: 'Authentication required.' } }, { status: 401 });
    }

    const ROUTE_START = performance.now();

    // Phase 5: Rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (isRateLimited(clientIp)) {
        return NextResponse.json({
            success: false,
            error: { type: 'RATE_LIMITED', status: 429, message: 'Too many requests. Please wait before searching again.' }
        }, { status: 429 });
    }
    let query = '';
    let searchId: string | null = null;

    const audit: ApiAudit = {
        openrouter:          { status: 'NOT_CALLED', called: false, success: false },
        kaggle:              { status: 'NOT_CALLED', called: false, success: false },
        huggingface:         { status: 'NOT_CALLED', called: false, success: false },
        huggingfaceModels:   { status: 'NOT_CALLED', called: false, success: false },
        huggingfaceDatasets: { status: 'NOT_CALLED', called: false, success: false },
    };

    const DEBUG_TRACE = process.env.DEBUG_API_TRACE === 'true';
    const log = (api: string, phase: string, detail = '') => {
        if (DEBUG_TRACE) console.log('[API-AUDIT][' + api + '][' + phase + ']' + (detail ? ' ' + detail : ''));
    };

    try {
        const body = await req.json();
        // Phase 4: Input validation
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
        }
        if (typeof body.query !== 'string' && body.query !== undefined) {
            return NextResponse.json({ message: 'Query must be a string.' }, { status: 400 });
        }
        query = (body.query ?? '').trim();
        searchId = typeof body.searchId === 'string' ? body.searchId.slice(0, 64) : null;

        const MAX_QUERY_LENGTH = parseInt(process.env.MAX_QUERY_LENGTH || '8000', 10);
        if (query.length > MAX_QUERY_LENGTH) {
            return NextResponse.json({
                message: 'Query too long. Maximum ' + MAX_QUERY_LENGTH + ' characters.',
                searchId
            }, { status: 400 });
        }

        if (!query) {
            return NextResponse.json({ message: 'Missing query', searchId }, { status: 400 });
        }

        // Minimum meaningful length — reject single words/greetings that can't describe an ML project
        const MIN_QUERY_LENGTH = parseInt(process.env.MIN_QUERY_LENGTH || '20', 10);
        if (query.length < MIN_QUERY_LENGTH) {
            return NextResponse.json({
                success: false,
                error: {
                    type: 'QUERY_TOO_SHORT',
                    status: 400,
                    message: 'Please describe your ML project in more detail (at least ' + MIN_QUERY_LENGTH + ' characters). For example: "I want to classify customer reviews as positive or negative."',
                    hint: 'Describe your project goal, data type, and what you want the AI to do.',
                },
                searchId,
            }, { status: 400 });
        }

        const USE_MOCK_AI = process.env.USE_MOCK_AI === 'true';
        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
        const OPENROUTER_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
        const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini';

        log('OPENROUTER', 'START', 'USE_MOCK_AI=' + USE_MOCK_AI + ' key_configured=' + !!OPENROUTER_API_KEY);

        let rawAnalysis: Record<string, unknown> | null = null;
        let aiMode: 'LIVE' | 'MOCK';

        if (USE_MOCK_AI) {
            rawAnalysis = { ...MOCK_ANALYSIS, problem_statement: query };
            aiMode = 'MOCK';
            audit.openrouter = { status: 'MOCKED', called: false, success: false };
            log('OPENROUTER', 'MOCKED', 'USE_MOCK_AI=true — real API not called');
        } else {
            if (!OPENROUTER_API_KEY) {
                audit.openrouter = { status: 'NOT_CONFIGURED', called: false, success: false };
                log('OPENROUTER', 'ERROR', 'NOT_CONFIGURED — OPENROUTER_API_KEY missing from environment');
                return NextResponse.json({
                    success: false, source: 'provider', status: 'failed', ai_mode: 'LIVE',
                    error: { type: 'MISSING_CREDENTIALS', status: 500,
                        message: 'AI provider is not configured on the server.',
                        hint: 'Add the required API key to your server environment.' },
                    mock_available: true, searchId, apiAudit: audit,
                }, { status: 500 });
            }

            audit.openrouter.status = 'CALL_STARTED';
            audit.openrouter.called = true;
            audit.openrouter.endpoint = 'openrouter.ai';
            const orStart = performance.now();
            log('OPENROUTER', 'REQUEST', 'POST ' + OPENROUTER_URL + ' model=' + OPENROUTER_MODEL);

            try {
                rawAnalysis = await analyzeProjectSemantics(query, OPENROUTER_API_KEY, OPENROUTER_MODEL, 'openrouter');
                const orMs = Math.round(performance.now() - orStart);
                audit.openrouter.status = 'CALLED_SUCCESSFULLY';
                audit.openrouter.success = true;
                audit.openrouter.httpStatus = 200;
                audit.openrouter.responseTimeMs = orMs;
                audit.openrouter.resultsReturned = 1;
                log('OPENROUTER', 'RESPONSE', 'status=200 responseTime=' + orMs + 'ms');
                log('OPENROUTER', 'SUCCESS', 'project analysis parsed successfully');
                aiMode = 'LIVE';
            } catch (orErr: any) {
                const orMs = Math.round(performance.now() - orStart);
                let httpStatus = 500;
                let errMsg = orErr instanceof Error ? orErr.message : String(orErr);
                try { httpStatus = JSON.parse(errMsg).status || 500; } catch {}
                const isTimeout = errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('timed out');
                audit.openrouter.status = isTimeout ? 'TIMED_OUT' : 'CALLED_FAILED';
                audit.openrouter.success = false;
                audit.openrouter.httpStatus = httpStatus;
                audit.openrouter.responseTimeMs = orMs;
                audit.openrouter.error = errMsg.slice(0, 200);
                log('OPENROUTER', 'ERROR', 'status=' + httpStatus + ' responseTime=' + orMs + 'ms error=' + errMsg.slice(0, 120));
                throw orErr;
            }
        }

        if (!rawAnalysis || typeof rawAnalysis !== 'object' || !rawAnalysis.title || !rawAnalysis.domain || !rawAnalysis.task || !rawAnalysis.data_modality) {
            audit.openrouter.status = 'PARSE_FAILED';
            throw new Error(JSON.stringify({
                type: 'INVALID_PROVIDER_RESPONSE', status: 502,
                message: 'The AI provider returned a malformed or incomplete project analysis payload.',
            }));
        }

        const imageAwareAnalysis = applyImageAwareOverrides(query, rawAnalysis);
        const taskString = Array.isArray(imageAwareAnalysis.task)
            ? imageAwareAnalysis.task.filter(Boolean).join(', ')
            : normalizeSingleText(imageAwareAnalysis.task || 'General AI task');

        const normalizedAnalysis = {
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
            confidence: { task_certainty: 0, domain_certainty: 0, modality_certainty: 0, target_certainty: 0, architecture_certainty: 0, score: 0, reason: 'Calculating...' },
            // Extended fields from improved prompt
            num_classes: (imageAwareAnalysis as any).num_classes ?? null,
            dataset_size_requirement: String((imageAwareAnalysis as any).dataset_size_requirement ?? 'not specified'),
            preferred_language: String((imageAwareAnalysis as any).preferred_language ?? 'Not specified'),
            deployment_requirement: String((imageAwareAnalysis as any).deployment_requirement ?? 'not specified'),
            interpretability_requirement: String((imageAwareAnalysis as any).interpretability_requirement ?? 'not specified'),
            privacy_sensitivity: String((imageAwareAnalysis as any).privacy_sensitivity ?? 'not specified'),
            evaluation_metrics: Array.isArray((imageAwareAnalysis as any).evaluation_metrics) ? (imageAwareAnalysis as any).evaluation_metrics : [],
        };

        const confidence = calculateDeterministicConfidence(normalizedAnalysis as unknown as Record<string, unknown>, query.length);
        const spec: ProjectSpec = { ...normalizedAnalysis, confidence };

        // Kaggle
        const KAGGLE_USERNAME = process.env.KAGGLE_USERNAME;
        const KAGGLE_KEY = process.env.KAGGLE_KEY;
        if (!KAGGLE_USERNAME || !KAGGLE_KEY) {
            audit.kaggle.status = 'NOT_CONFIGURED';
            log('KAGGLE', 'START', 'NOT_CONFIGURED — KAGGLE_USERNAME or KAGGLE_KEY missing from environment');
        } else {
            audit.kaggle.status = 'CALL_STARTED';
            audit.kaggle.endpoint = 'kaggle.com';
            log('KAGGLE', 'START', 'credentials configured — calling Kaggle API');
        }

        // Hugging Face
        const HF_TOKEN = process.env.HUGGING_FACE_TOKEN;
        audit.huggingface.status = 'CALL_STARTED';
        audit.huggingface.endpoint = 'huggingface.co';
        log('HUGGINGFACE', 'START', 'token_configured=' + !!HF_TOKEN + ' — calling HF API');

        const kaggleTrace: Record<string, any> = {};
        const hfTrace: Record<string, any> = {};

        log('KAGGLE', 'REQUEST', 'GET /api/v1/datasets/list?search=...');
        log('HUGGINGFACE', 'REQUEST', 'GET /api/models + /api/datasets search=' + spec.subdomain);

        const [rawKaggle, rawHfModels, rawHfDatasets] = await Promise.all([
            searchKaggleDatasets(spec, kaggleTrace, query),
            searchHuggingFaceModels(spec, hfTrace, query),
            searchHuggingFaceDatasets(spec, hfTrace, query),
        ]);

        // Reconcile Kaggle audit
        if (audit.kaggle.status !== 'NOT_CONFIGURED') {
            if (kaggleTrace.success === false) {
                audit.kaggle.status = 'CALLED_FAILED';
                audit.kaggle.success = false;
                audit.kaggle.httpStatus = kaggleTrace.status || 401;
                audit.kaggle.error = kaggleTrace.reason || 'Kaggle API call failed';
                log('KAGGLE', 'ERROR', 'status=' + (kaggleTrace.status || 'unknown') + ' ' + (kaggleTrace.reason || ''));
            } else {
                audit.kaggle.status = 'CALLED_SUCCESSFULLY';
                audit.kaggle.called = true;
                audit.kaggle.success = true;
                audit.kaggle.httpStatus = 200;
                audit.kaggle.responseTimeMs = kaggleTrace.durationMs || 0;
                audit.kaggle.resultsReturned = rawKaggle.length;
                log('KAGGLE', 'RESPONSE', 'status=200 responseTime=' + (kaggleTrace.durationMs || 0) + 'ms');
                log('KAGGLE', 'SUCCESS', 'datasets_returned=' + rawKaggle.length);
            }
        }

        // Reconcile HF audit - tracked separately for models vs datasets
        const hfModelsOk = rawHfModels.length > 0;
        const hfDatasetsOk = rawHfDatasets.length > 0;
        const hfAnyOk = hfModelsOk || hfDatasetsOk;
        const hfDur = hfTrace.durationMs || 0;

        // Models separate entry
        audit.huggingfaceModels = {
            ...audit.huggingfaceModels,
            status: hfModelsOk ? 'CALLED_SUCCESSFULLY' : 'CALLED_SUCCESSFULLY', // HF is always attempted
            called: true,
            success: hfModelsOk,
            httpStatus: 200,
            responseTimeMs: hfDur,
            resultsReturned: rawHfModels.length,
        };
        log('HUGGINGFACE-MODELS', hfModelsOk ? 'SUCCESS' : 'WARNING', 'results=' + rawHfModels.length + ' duration=' + hfDur + 'ms');

        // Datasets separate entry
        audit.huggingfaceDatasets = {
            ...audit.huggingfaceDatasets,
            status: hfDatasetsOk ? 'CALLED_SUCCESSFULLY' : 'CALLED_SUCCESSFULLY',
            called: true,
            success: hfDatasetsOk,
            httpStatus: 200,
            responseTimeMs: hfDur,
            resultsReturned: rawHfDatasets.length,
        };
        log('HUGGINGFACE-DATASETS', hfDatasetsOk ? 'SUCCESS' : 'WARNING', 'results=' + rawHfDatasets.length + ' duration=' + hfDur + 'ms');

        // Combined HF summary
        if (!hfAnyOk && hfTrace.success === false) {
            audit.huggingface.status = 'CALLED_FAILED';
            audit.huggingface.success = false;
            audit.huggingface.httpStatus = hfTrace.status || 403;
            audit.huggingface.error = 'Hugging Face API returned no results';
            log('HUGGINGFACE', 'ERROR', 'status=' + (hfTrace.status || 'unknown'));
        } else {
            audit.huggingface.status = 'CALLED_SUCCESSFULLY';
            audit.huggingface.called = true;
            audit.huggingface.success = true;
            audit.huggingface.httpStatus = 200;
            audit.huggingface.responseTimeMs = hfDur;
            audit.huggingface.resultsReturned = rawHfModels.length + rawHfDatasets.length;
            log('HUGGINGFACE', 'RESPONSE', 'status=200 responseTime=' + hfDur + 'ms');
            log('HUGGINGFACE', 'SUCCESS', 'models=' + rawHfModels.length + ' datasets=' + rawHfDatasets.length);
        }

        const allDatasetCandidates: Array<Record<string, unknown>> = [...rawKaggle, ...rawHfDatasets];
        const scoredDatasets = allDatasetCandidates.map(d => scoreDataset(d, spec)).sort((a, b) => b.matchScore - a.matchScore);
        const nonRejectedDatasets = scoredDatasets.filter(d => !d.rejected);
        const scoredModels = rawHfModels.map(m => scoreModel(m, spec)).sort((a, b) => b.matchScore - a.matchScore);
        const nonRejectedModels = scoredModels.filter(m => !m.rejected);

        const topDatasets = scoredDatasets.slice(0, 3);
        const topModels = scoredModels.slice(0, 3);
        const bestDataset = nonRejectedDatasets[0] ?? null;
        const bestModel = nonRejectedModels[0] ?? null;

        const feasibility = calculateFeasibility(
            scoredDatasets as any, scoredModels as any,
            Array.isArray(spec.task) ? spec.task.join(', ') : spec.task,
            spec.data_modality,
        );
        const hardware = estimateHardware(
            bestDataset as any, bestModel as any,
            Array.isArray(spec.task) ? spec.task.join(', ') : spec.task,
            spec.data_modality,
        );

        // Enrich top datasets with quality/risk/trainability analysis
        const taskStr = Array.isArray(spec.task) ? spec.task.join(', ') : spec.task;
        const enrichedTopDatasets = topDatasets.map(d =>
            enrichDataset(d, spec, taskStr, spec.data_modality)
        );

        // Search coverage
        const searchCoverage = computeSearchCoverage(rawKaggle, rawHfDatasets, rawHfModels);

        // Compatibility between top datasets
        const datasetCompatibility = analyzeDatasetCompatibility(topDatasets.filter(d => !d.rejected).slice(0, 4));

        // Label mapping suggestions
        const labelMapping = suggestLabelMapping(topDatasets.filter(d => !d.rejected));

        // Recommendation categories
        const recommendationCategories = generateRecommendationCategories(topDatasets, spec);

        // Smart final recommendation
        const smartRecommendation = generateSmartRecommendation(spec, bestDataset, bestModel, hardware);

        const totalMs = Math.round(performance.now() - ROUTE_START);
        log('OPENROUTER', 'END', 'total_route_duration=' + totalMs + 'ms');
        if (DEBUG_TRACE) console.log('[API-AUDIT][SUMMARY] openrouter=' + audit.openrouter.status + ' kaggle=' + audit.kaggle.status + ' huggingface=' + audit.huggingface.status + ' duration=' + totalMs + 'ms');

        return NextResponse.json({
            success: true,
            ai_mode: aiMode,
            analysis: spec,
            results: { kaggle: enrichedTopDatasets, hfModels: topModels, hfDatasets: [] },
            summary: {
                projectTitle: spec.title, domain: spec.domain, subdomain: spec.subdomain,
                task: spec.task, dataType: spec.data_modality,
                datasetsFound: topDatasets.filter(d => !d.rejected).length,
                modelsFound: topModels.filter(m => !m.rejected).length,
                bestDataset: bestDataset ? enrichDataset(bestDataset, spec, taskStr, spec.data_modality) : null,
                bestModel,
            },
            feasibility, hardware, searchId,
            searchCoverage,
            datasetCompatibility,
            labelMapping,
            recommendationCategories,
            smartRecommendation,
            using_fallback_datasets: rawKaggle.length === 0,
        });

    } catch (e: unknown) {
        // Log full error server-side only — never expose raw internals to the client
        const rawMessage = e instanceof Error ? e.message : 'Unexpected server error.';
        console.error('[API-AUDIT][SERVER][ERROR] ' + rawMessage.slice(0, 300), { query, searchId });

        // Map known structured error types to safe HTTP status codes and messages
        let httpStatus = 500;
        let clientMessage = 'Search failed. Please try again.';
        if (e instanceof Error) {
            try {
                const errObj: Record<string, unknown> = JSON.parse(e.message);
                if (typeof errObj.status === 'number' && errObj.status >= 400 && errObj.status < 600) {
                    httpStatus = errObj.status;
                }
                const safeMessages: Record<string, string> = {
                    UNAUTHORIZED:         'Authentication required.',
                    RATE_LIMITED:         'Too many requests. Please wait before searching again.',
                    MISSING_CREDENTIALS:  'Search service is not configured.',
                    PROVIDER_API_ERROR:   'AI provider is unavailable. Please try again.',
                    OPENROUTER_API_ERROR: 'AI analysis failed. Please try again.',
                    CONFIGURATION_ERROR:  'Server configuration error.',
                    VALIDATION_ERROR:     'Invalid search request.',
                };
                const errType = typeof errObj.type === 'string' ? errObj.type : '';
                clientMessage = safeMessages[errType] || 'Search failed. Please try again.';
            } catch {
                // Not a structured error — keep generic message
            }
        }

        return NextResponse.json({
            success: false,
            error: { status: httpStatus, message: clientMessage },
            searchId,
        }, { status: httpStatus });
    }
}