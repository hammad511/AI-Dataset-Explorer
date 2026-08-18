import { NormalizedDataset, ProjectSpec } from '../../schemas/types';

/**
 * Extract the most searchable keyword phrases from the user's raw query.
 * Strips filler words and returns 2-3 specific noun phrases.
 */
function extractQueryKeywords(rawQuery: string): string[] {
    const STOP = new Set(['i','want','to','find','a','an','the','dataset','datasets','on','for','about','with','using','that','this','my','me','can','please','need','looking','get','use','build','create','make','train','model','data','some','good','best','related']);
    const words = rawQuery.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP.has(w));
    if (words.length === 0) return [];
    // Build a 2-3 word phrase from the most meaningful words
    const phrase = words.slice(0, 4).join(' ');
    const bigram = words.slice(0, 2).join(' ');
    const firstWord = words[0];
    return [...new Set([phrase, bigram, firstWord].filter(s => s.length > 2))].slice(0, 3);
}

/**
 * Check if a dataset result is relevant to the user's query.
 * Drops results where none of the query keywords appear anywhere in
 * the dataset name, description, or tags.
 */
function isRelevant(d: any, keywords: string[]): boolean {
    if (keywords.length === 0) return true; // can't filter without keywords
    const blob = [d.id, d.description, ...(d.tags || [])].join(' ').toLowerCase();
    return keywords.some(kw => blob.includes(kw));
}

export async function searchHuggingFaceDatasets(spec: ProjectSpec, trace?: any, rawQuery?: string): Promise<Partial<NormalizedDataset>[]> {
    const TRACE = process.env.DEBUG_API_TRACE === 'true';
    const HF_TOKEN = process.env.HUGGING_FACE_TOKEN;
    const headers: Record<string,string> = { 'Accept': 'application/json' };
    if (HF_TOKEN) headers['Authorization'] = 'Bearer ' + HF_TOKEN;

    // Build queries — raw user query comes FIRST so the most specific search runs first
    const queryKeywords = rawQuery ? extractQueryKeywords(rawQuery) : [];
    const tasks = typeof spec.task === 'string' ? spec.task.split(',').map(s=>s.trim()) : (Array.isArray(spec.task) ? spec.task : []);
    const specQueries = [spec.subdomain, ...tasks].filter(Boolean);
    // De-duplicate, put raw query phrases first
    const queries = [...new Set([...queryKeywords, ...specQueries])].filter(Boolean).slice(0, 5);

    if (trace) { trace.called = true; trace.success = false; }
    const t0 = performance.now();
    let overallStatus = 200;
    let results: Partial<NormalizedDataset>[] = [];
    if (TRACE) console.log('[API-TRACE] HuggingFace-Datasets START queries=' + JSON.stringify(queries) + ' token_configured=' + !!HF_TOKEN);

    for (const q of queries) {
        try {
            // Use sort=likes (not downloads) so popular-by-topic datasets rank higher than viral unrelated ones
            const url = 'https://huggingface.co/api/datasets?search=' + encodeURIComponent(q) + '&sort=likes&direction=-1&limit=12';
            if (TRACE) console.log('[API-TRACE] HuggingFace-Datasets REQUEST GET /api/datasets?search=' + encodeURIComponent(q));
            const HFD_TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '15000', 10);
            const dCtrl = new AbortController();
            const dTid = setTimeout(() => dCtrl.abort(), HFD_TIMEOUT);
            let res: Response;
            try {
                res = await fetch(url, { headers, signal: dCtrl.signal });
            } catch (fe: any) {
                clearTimeout(dTid);
                if (fe.name === 'AbortError') { overallStatus = 408; if (TRACE) console.warn('[API-TRACE] HF-Datasets TIMEOUT q=' + q); continue; }
                if (TRACE) console.warn('[API-TRACE] HF-Datasets NETWORK_ERROR q=' + q); continue;
            }
            clearTimeout(dTid);
            if (!res.ok) {
                overallStatus = res.status;
                if (TRACE) console.warn('[API-TRACE] HuggingFace-Datasets FAILED status=' + res.status + ' query=' + q);
            } else {
                const data = await res.json();
                const datasets = (data || [])
                    .filter((d: any) => isRelevant(d, queryKeywords)) // drop obviously irrelevant results
                    .map((d: any) => ({
                        id: d.id,
                        name: d.id,
                        title: d.id,
                        subtitle: (d.cardData?.pretty_name || d.id || ''),
                        source: 'Hugging Face' as const,
                        url: 'https://huggingface.co/datasets/' + d.id,
                        description: (d.description || d.cardData?.pretty_name || (d.tags||[]).filter((t:string)=>!t.includes(':')).slice(0,5).join(', ') || d.id || ''),
                        domain: spec.domain,
                        subdomain: spec.subdomain,
                        modality: spec.data_modality,
                        tasks: [spec.task],
                        targetLabels: spec.target_labels || [],
                        sizeBytes: (d.cardData?.dataset_size || d.dataset_size || null),
                        license: (d.license || (d.tags||[]).find((t:string)=>t.startsWith('license:'))?.replace('license:','') || 'Unknown'),
                        creator: d.author || 'Unknown',
                        downloads: d.downloads || 0,
                        tags: d.tags || [],
                        files: [],
                        metadataQuality: 0,
                        matchScore: 0,
                        scoreBreakdown: { task: 0, modality: 0, domain: 0, subdomain: 0, target: 0, metadata: 0 },
                        rejected: false,
                        rejectionReason: null,
                        matchReason: ''
                    }));
                results = [...results, ...datasets];
                if (TRACE) console.log('[API-TRACE] HuggingFace-Datasets RESPONSE status=200 query=' + JSON.stringify(q) + ' found=' + datasets.length);
            }
        } catch(err: any) {
            if (TRACE) console.warn('[API-TRACE] HuggingFace-Datasets EXCEPTION q=' + q + ' err=' + String(err?.message||err).slice(0,100));
        }
    }

    const unique = new Map<string, Partial<NormalizedDataset>>();
    for (const d of results) { if (d.id && !unique.has(d.id)) unique.set(d.id, d); }
    const final = Array.from(unique.values());
    const dur = Math.round(performance.now() - t0);

    if (trace) {
        trace.success = overallStatus === 200 || final.length > 0;
        if (overallStatus !== 200) trace.status = overallStatus;
        trace.datasetsFound = (trace.datasetsFound || 0) + final.length;
        trace.durationMs = Math.max(trace.durationMs || 0, dur);
    }
    if (TRACE) console.log('[API-TRACE] HuggingFace-Datasets SUCCESS total_unique=' + final.length + ' duration=' + dur + 'ms');
    return final;
}
