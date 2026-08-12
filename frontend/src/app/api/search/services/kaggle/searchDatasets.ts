import { NormalizedDataset, ProjectSpec } from '../../schemas/types';

export async function searchKaggleDatasets(spec: ProjectSpec, trace?: any): Promise<Partial<NormalizedDataset>[]> {
    const KAGGLE_USERNAME = process.env.KAGGLE_USERNAME;
    const KAGGLE_KEY = process.env.KAGGLE_KEY;

    if (!KAGGLE_USERNAME || !KAGGLE_KEY) {
        if (trace) {
            trace.called = false;
            trace.success = false;
            trace.reason = 'API key not configured';
        }
        return [];
    }

    if (trace) {
        trace.called = true;
        trace.success = true;
    }

    if (enableLogs) console.log('[KAGGLE] START');
    const t0 = performance.now();

    let queries = [
        `${spec.subdomain} ${spec.task} dataset`.trim().replace(/unknown/ig, ''),
        `${spec.domain} ${spec.data_modality}`.trim(),
        spec.title
    ];

    const taskLower = String(spec.task ?? '').toLowerCase();
    const domainLower = String(spec.domain ?? '').toLowerCase();

    if (domainLower.includes('nlp')) {
        queries.push(`${spec.subdomain} text classification`);
    } else if (domainLower.includes('medical')) {
        queries.push(`${spec.subdomain} ${spec.data_modality} dataset`);
    } else if (taskLower.includes('detect')) {
        queries.push(`${spec.subdomain} object detection`);
    }

    queries = Array.from(new Set(queries.filter(q => q.length > 5)));

    const auth = Buffer.from(`${KAGGLE_USERNAME}:${KAGGLE_KEY}`).toString('base64');
    let results: Partial<NormalizedDataset>[] = [];

    let overallStatus = 200;
    for (const q of queries) {
        try {
            const url = `https://www.kaggle.com/api/v1/datasets/list?search=${encodeURIComponent(q)}&sortBy=relevance`;
            const res = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });

            if (!res.ok) {
                overallStatus = res.status;
            } else {
                const data = await res.json();
                const datasets = (data || []).map((item: any) => ({
                    id: item.ref,
                    name: item.title,
                    source: 'Kaggle',
                    url: `https://kaggle.com/${item.ref}`,
                    description: item.description || item.subtitle || '',
                    domain: spec.domain,
                    subdomain: spec.subdomain,
                    modality: spec.data_modality,
                    tasks: [spec.task],
                    targetLabels: [],
                    sizeBytes: item.totalBytes || null,
                    license: item.licenseName || 'Unknown',
                    creator: item.creatorName || 'Unknown',
                    downloads: item.downloadCount || 0,
                    tags: (item.tags || []).map((t: any) => t.name),
                    files: [],
                    metadataQuality: 0,
                    matchScore: 0
                }));
                results = [...results, ...datasets];
            }
        } catch { } // fail silently for individual query throws
    }

    // Deduplicate
    const unique = new Map<string, Partial<NormalizedDataset>>();
    for (const d of results) {
        if (!unique.has(d.id!)) unique.set(d.id!, d);
    }
    const finalDatasets = Array.from(unique.values());

    if (trace) {
        if (overallStatus !== 200 && finalDatasets.length === 0) {
            trace.success = false;
            trace.status = overallStatus;
        } else {
            trace.success = true;
            trace.datasetsFound = finalDatasets.length;
        }
        trace.durationMs = Math.round(performance.now() - t0);
    }

    return finalDatasets;
}
