import { NormalizedDataset, ProjectSpec } from '../../schemas/types';

export async function searchHuggingFaceDatasets(spec: ProjectSpec, trace?: any): Promise<Partial<NormalizedDataset>[]> {
    const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;
    const headers: Record<string, string> = {};
    if (HUGGING_FACE_TOKEN) {
        headers['Authorization'] = `Bearer ${HUGGING_FACE_TOKEN}`;
    }

    const tasks = Array.isArray(spec.task) ? spec.task : typeof spec.task === 'string' ? spec.task.split(',').map(s => s.trim()) : [];

    let queries = [
        spec.subdomain,
        ...tasks
    ].filter(Boolean);

    if (trace) { trace.called = true; trace.success = true; }
    const t0 = performance.now();
    let overallStatus = 200;

    let results: Partial<NormalizedDataset>[] = [];

    for (const q of queries) {
        try {
            const url = `https://huggingface.co/api/datasets?search=${encodeURIComponent(q)}&sort=downloads&direction=-1&limit=5`;
            const res = await fetch(url, { headers });

            if (!res.ok) {
                overallStatus = res.status;
            } else {
                const data = await res.json();
                const datasets = (data || []).map((d: any) => ({
                    id: d.id,
                    name: d.id,
                    source: 'Hugging Face',
                    url: `https://huggingface.co/datasets/${d.id}`,
                    description: '', // HF /api/datasets search often omits long descriptions
                    domain: spec.domain,
                    subdomain: spec.subdomain,
                    modality: spec.data_modality,
                    tasks: [spec.task],
                    targetLabels: [],
                    sizeBytes: null,
                    license: 'Unknown',
                    creator: d.author || 'Unknown',
                    downloads: d.downloads || 0,
                    tags: d.tags || [],
                    files: [],
                    metadataQuality: 0,
                    matchScore: 0
                }));
                results = [...results, ...datasets];
            }
        } catch { } // fail silently per query
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
            trace.datasetsFound = (trace.datasetsFound || 0) + finalDatasets.length;
        }
        if (!trace.durationMs) trace.durationMs = 0;
        trace.durationMs = Math.max(trace.durationMs, Math.round(performance.now() - t0));
    }

    return finalDatasets;
}
