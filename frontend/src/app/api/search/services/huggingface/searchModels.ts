import { NormalizedModel, ProjectSpec } from '../../schemas/types';

function inferPipelineTag(task: string, mod: string): string | null {
    const t = task.toLowerCase(), m = mod.toLowerCase();
    if (/(speech.?emot|emotion.?recogn|ser|audio.?classif|sound.?classif)/.test(t)) return 'audio-classification';
    if (/(audio|speech|voice|sound|wav|microphone)/.test(m) && !/(object.?detect|track)/.test(t)) return 'audio-classification';
    if (/(object.?detect|detect|track|count|bbox|bounding)/.test(t) || /(image|video|cctv)/.test(m)) return 'object-detection';
    if (/segment/.test(t)) return 'image-segmentation';
    if (/(image.?classif|classif)/.test(t) && /(image|vision)/.test(m)) return 'image-classification';
    if (/(sentiment|text.?classif|nlp)/.test(t)) return 'text-classification';
    if (/(generat|llm|chatbot)/.test(t)) return 'text-generation';
    if (/(speech|audio|asr)/.test(t)) return 'automatic-speech-recognition';
    return null;
}

function buildModelQueries(spec: ProjectSpec, rawQuery?: string): string[] {
    const STOP = new Set(['i','want','to','find','a','an','the','dataset','datasets','on','for','about','with','using','that','this','my','me','can','please','need','looking','get','use','build','create','make','train','model','data','some','good','best','related']);
    const tasks = typeof spec.task === 'string' ? spec.task.split(',').map((s: string) => s.trim()) : (Array.isArray(spec.task) ? spec.task : []);
    const archTokens = (spec.primary_architecture || '').toLowerCase().split(/[\s+\/,|]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 2);
    const subdomain = (spec.subdomain || '').split(/[\/,]+/)[0].trim().split(' ')[0].toLowerCase();

    const queries: string[] = [];

    // Inject raw query keywords first — most specific
    if (rawQuery) {
        const words = rawQuery.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
        if (words.length >= 2) queries.push(words.slice(0, 3).join(' '));
        if (words.length >= 1) queries.push(words[0]);
    }

    for (const arch of archTokens.slice(0, 2)) { queries.push(subdomain ? arch + ' ' + subdomain : arch); }
    for (const task of tasks.slice(0, 2)) { const t = task.trim().toLowerCase(); if (t && !queries.some((q: string) => q.includes(t))) queries.push(t); }
    return [...new Set(queries.filter(Boolean))].slice(0, 5);
}

export async function searchHuggingFaceModels(spec: ProjectSpec, trace?: any, rawQuery?: string): Promise<Partial<NormalizedModel>[]> {
    const TRACE = process.env.DEBUG_API_TRACE === 'true';
    const HF_TOKEN = process.env.HUGGING_FACE_TOKEN;
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (HF_TOKEN) headers['Authorization'] = 'Bearer ' + HF_TOKEN;
    const queries = buildModelQueries(spec, rawQuery);
    const pipelineTag = inferPipelineTag(String(spec.task || ''), String(spec.data_modality || ''));
    if (trace) { trace.called = true; trace.success = false; }
    const t0 = performance.now();
    let overallStatus = 200, results: Partial<NormalizedModel>[] = [];
    if (TRACE) console.log('[API-TRACE] HuggingFace-Models START queries=' + JSON.stringify(queries) + ' pipeline=' + pipelineTag);
    for (const q of queries) {
        try {
            let url = 'https://huggingface.co/api/models?search=' + encodeURIComponent(q) + '&sort=downloads&direction=-1&limit=10';
            if (pipelineTag) url += '&pipeline_tag=' + encodeURIComponent(pipelineTag);
            const TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '15000', 10);
            const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), TIMEOUT);
            let res: Response;
            try { res = await fetch(url, { headers, signal: ctrl.signal }); }
            catch (fe: any) { clearTimeout(tid); if (fe.name === 'AbortError') { overallStatus = 408; if (TRACE) console.warn('[API-TRACE] HF-Models TIMEOUT q=' + q); continue; } if (TRACE) console.warn('[API-TRACE] HF-Models NET_ERR q=' + q); continue; }
            clearTimeout(tid);
            if (!res.ok) { overallStatus = res.status; if (TRACE) console.warn('[API-TRACE] HF-Models FAIL status=' + res.status); }
            else {
                const data = await res.json();
                const models = (data || []).map((m: any) => ({
                    id: m.modelId, name: m.modelId, source: 'Hugging Face' as const,
                    url: 'https://huggingface.co/' + m.modelId,
                    task: m.pipeline_tag || 'Unknown', modality: spec.data_modality,
                    architecture: (m.tags || []).find((t: string) => t.startsWith('architecture:'))?.split(':')[1] || 'Unknown',
                    framework: (m.tags || []).includes('pytorch') ? 'PyTorch' : (m.tags || []).includes('tf') ? 'TensorFlow' : 'Unknown',
                    parameters: null,
                    license: (m.tags || []).find((t: string) => t.startsWith('license:'))?.split(':').slice(1).join(':')?.replace(/-/g, ' ') || 'Unknown',
                    downloads: m.downloads || 0, likes: m.likes || 0, benchmarkEvidence: [],
                    matchScore: 0, scoreBreakdown: { task: 0, modality: 0, architecture: 0, benchmark: 0, efficiency: 0, popularity: 0 },
                    rejected: false, rejectionReason: null, matchReason: ''
                }));
                results = [...results, ...models];
                if (TRACE) console.log('[API-TRACE] HF-Models RESPONSE q=' + JSON.stringify(q) + ' found=' + models.length);
            }
        } catch (err: any) { if (TRACE) console.warn('[API-TRACE] HF-Models EXCEPTION err=' + String(err?.message || err).slice(0, 80)); }
    }
    const unique = new Map<string, Partial<NormalizedModel>>();
    for (const d of results) { if (d.id && !unique.has(d.id)) unique.set(d.id, d); }
    const final = Array.from(unique.values());
    const dur = Math.round(performance.now() - t0);
    if (trace) { trace.success = overallStatus === 200 && final.length > 0; trace.httpStatus = overallStatus; trace.modelsFound = final.length; trace.durationMs = (trace.durationMs || 0) + dur; }
    if (TRACE) console.log('[API-TRACE] HF-Models SUCCESS total=' + final.length + ' duration=' + dur + 'ms');
    return final;
}
