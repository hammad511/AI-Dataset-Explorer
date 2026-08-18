import { NormalizedDataset, ProjectSpec } from '../../schemas/types';

function buildKaggleQueries(spec: ProjectSpec, rawQuery?: string): string[] {
    const task = String(spec.task || '');
    const domain = String(spec.domain || '');
    const subdomain = String(spec.subdomain || '');
    const modality = String(spec.data_modality || '');
    const labels = Array.isArray(spec.target_labels) ? spec.target_labels.slice(0, 3).join(' ') : '';
    const title = String(spec.title || '');

    // Extract meaningful keywords from the raw user query to use as the most specific search
    const STOP = new Set(['i','want','to','find','a','an','the','dataset','datasets','on','for','about','with','using','that','this','my','me','can','please','need','looking','get','use','build','create','make','train','model','data','some','good','best','related']);
    const rawKeywords = rawQuery
        ? rawQuery.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w))
        : [];
    const rawPhrase  = rawKeywords.slice(0, 4).join(' ');
    const rawBigram  = rawKeywords.slice(0, 2).join(' ');

    // Primary: task + domain combo — most specific
    const q1 = [task.replace(/,/g, ' '), subdomain].filter(Boolean).join(' ').trim();
    // Secondary: domain + modality
    const q2 = [domain, modality].filter(Boolean).join(' ').trim();
    // Tertiary: title keywords
    const q3 = title.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    // Task-specific extras
    const taskLower = task.toLowerCase();
    const domainLower = domain.toLowerCase();
    const extras: string[] = [];
    if (taskLower.includes('detect') || taskLower.includes('tracking')) {
        extras.push([labels, 'object detection dataset'].filter(Boolean).join(' ').trim());
        if (subdomain) extras.push(subdomain + ' dataset');
    } else if (taskLower.includes('segment')) {
        extras.push([subdomain, 'segmentation'].join(' ').trim());
    } else if (domainLower.includes('nlp') || domainLower.includes('natural language')) {
        extras.push(subdomain + ' text classification');
    } else if (domainLower.includes('medical') || domainLower.includes('healthcare')) {
        extras.push([subdomain, modality, 'dataset'].join(' ').trim());
    } else if (taskLower.includes('forecast') || taskLower.includes('time')) {
        extras.push(subdomain + ' time series');
    } else if (domainLower.includes('audio') || modality.toLowerCase().includes('audio') || modality.toLowerCase().includes('speech') || taskLower.includes('speech') || taskLower.includes('audio') || taskLower.includes('emotion recognition') || taskLower.includes('ser')) {
        extras.push('speech emotion recognition dataset');
        extras.push([labels, 'audio classification'].filter(Boolean).join(' ').trim());
        if (subdomain) extras.push(subdomain + ' audio dataset');
    } else if (modality.toLowerCase().includes('tabular') || domainLower.includes('finance')) {
        extras.push([subdomain, 'tabular dataset'].join(' ').trim());
    }

    // Raw query phrases come first — they are the most specific and most likely to match
    const all = [rawPhrase, rawBigram, q1, q2, q3, ...extras].filter(q => q && q.length > 5);
    return Array.from(new Set(all)).slice(0, 5);
}

export async function searchKaggleDatasets(spec: ProjectSpec, trace?: any, rawQuery?: string): Promise<Partial<NormalizedDataset>[]> {
    const KAGGLE_USERNAME = process.env.KAGGLE_USERNAME;
    const KAGGLE_KEY = process.env.KAGGLE_KEY;

    if (!KAGGLE_USERNAME || !KAGGLE_KEY) {
        if (trace) { trace.called = false; trace.success = false; trace.reason = 'KAGGLE_USERNAME or KAGGLE_KEY not in .env.local'; }
        if (process.env.DEBUG_API_TRACE === 'true') console.log('[API-TRACE] Kaggle NOT_CONFIGURED — missing credentials');
        return [];
    }

    const TRACE = process.env.DEBUG_API_TRACE === 'true';
    const queries = buildKaggleQueries(spec, rawQuery);
    const auth = Buffer.from(KAGGLE_USERNAME + ':' + KAGGLE_KEY).toString('base64');
    let results: Partial<NormalizedDataset>[] = [];
    let overallStatus = -1; // -1 = no request attempted yet; set to real HTTP status on first response
    const t0 = performance.now();

    if (trace) trace.called = true;
    if (TRACE) console.log('[API-TRACE] Kaggle START queries=' + JSON.stringify(queries));

    for (const q of queries) {
        try {
            const url = 'https://www.kaggle.com/api/v1/datasets/list?search=' + encodeURIComponent(q) + '&sortBy=relevance&pageSize=20';
            if (TRACE) console.log('[API-TRACE] Kaggle REQUEST GET ' + url.replace('https://www.kaggle.com', ''));
            const KAGGLE_TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '15000', 10);
            const kCtrl = new AbortController();
            const kTid = setTimeout(() => kCtrl.abort(), KAGGLE_TIMEOUT);
            let res: Response;
            try {
                res = await fetch(url, { headers: { 'Authorization': 'Basic ' + auth }, signal: kCtrl.signal });
            } catch (fe: any) {
                clearTimeout(kTid);
                if (fe.name === 'AbortError') { overallStatus = 408; if (TRACE) console.warn('[API-TRACE] Kaggle TIMEOUT query=' + q); continue; }
                if (TRACE) console.warn('[API-TRACE] Kaggle NETWORK_ERROR query=' + q); continue;
            }
            clearTimeout(kTid);
            if (!res.ok) {
                overallStatus = res.status;
                if (TRACE) console.warn('[API-TRACE] Kaggle FAILED status=' + res.status + ' query=' + q);
            } else {
                const data = await res.json();
                const datasets = (data || []).map((item: any) => ({
                    id: item.ref,
                    name: item.title,
                    title: item.title,
                    subtitle: item.subtitle || '',
                    source: 'Kaggle' as const,
                    url: 'https://www.kaggle.com/datasets/' + item.ref,
                    description: item.subtitle || item.description || '',
                    domain: spec.domain,
                    subdomain: spec.subdomain,
                    modality: spec.data_modality,
                    tasks: [spec.task],
                    targetLabels: spec.target_labels || [],
                    sizeBytes: item.totalBytes || null,
                    license: item.licenseName || 'Unknown',
                    creator: item.creatorName || 'Unknown',
                    creatorName: item.creatorName || 'Unknown',
                    downloads: item.downloadCount || 0,
                    tags: (item.tags || []).map((t: any) => (typeof t === 'string' ? t : t?.name || '')).filter(Boolean),
                    files: [],
                    metadataQuality: 0,
                    matchScore: 0,
                    scoreBreakdown: { task: 0, modality: 0, domain: 0, subdomain: 0, target: 0, metadata: 0 },
                    rejected: false,
                    rejectionReason: null,
                    matchReason: ''
                }));
                results = [...results, ...datasets];
                if (TRACE) console.log('[API-TRACE] Kaggle RESPONSE status=200 query=' + JSON.stringify(q) + ' found=' + datasets.length);
            }
        } catch (err: any) {
            if (TRACE) console.warn('[API-TRACE] Kaggle EXCEPTION query=' + q + ' err=' + String(err?.message || err).slice(0,100));
        }
    }

    const unique = new Map<string, Partial<NormalizedDataset>>();
    for (const d of results) { if (d.id && !unique.has(d.id)) unique.set(d.id, d); }
    const finalDatasets = Array.from(unique.values());
    const dur = Math.round(performance.now() - t0);

    if (trace) {
        const failed = overallStatus !== 200 && finalDatasets.length === 0;
        trace.success = !failed;
        if (failed) trace.status = overallStatus;
        trace.datasetsFound = finalDatasets.length;
        trace.durationMs = dur;
    }

    if (finalDatasets.length > 0) {
        if (TRACE) console.log('[API-TRACE] Kaggle SUCCESS total_unique=' + finalDatasets.length + ' duration=' + dur + 'ms');
    } else {
        if (TRACE) console.warn('[API-TRACE] Kaggle WARNING total_unique=0 duration=' + dur + 'ms status=' + overallStatus);
    }
    return finalDatasets;
}