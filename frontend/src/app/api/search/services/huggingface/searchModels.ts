import { NormalizedModel, ProjectSpec } from '../../schemas/types';

export async function searchHuggingFaceModels(spec: ProjectSpec, trace?: any): Promise<Partial<NormalizedModel>[]> {
    const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;
    const headers: Record<string, string> = {};
    if (HUGGING_FACE_TOKEN) {
        headers['Authorization'] = `Bearer ${HUGGING_FACE_TOKEN}`;
    }

    const tasks = Array.isArray(spec.task) ? spec.task : typeof spec.task === 'string' ? spec.task.split(',').map(s => s.trim()) : [];

    let queries = [
        spec.subdomain,
        spec.primary_architecture,
        ...tasks
    ].filter(Boolean);

    if (trace) { trace.called = true; trace.success = true; }
    const t0 = performance.now();
    let overallStatus = 200;

    let results: Partial<NormalizedModel>[] = [];

    for (const q of queries) {
        try {
            const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&sort=downloads&direction=-1&limit=5`;
            const res = await fetch(url, { headers });
            if (!res.ok) {
                overallStatus = res.status;
            } else {
                const data = await res.json();
                const models = (data || []).map((m: any) => ({
                    id: m.modelId,
                    name: m.modelId,
                    source: 'Hugging Face',
                    url: `https://huggingface.co/${m.modelId}`,
                    task: m.pipeline_tag || 'Unknown',
                    modality: spec.data_modality,
                    architecture: m.tags?.find((t: string) => t.includes('architecture:'))?.split(':')[1] || 'Unknown',
                    framework: m.tags?.includes('pytorch') ? 'PyTorch' : m.tags?.includes('tf') ? 'TensorFlow' : 'Unknown',
                    parameters: null,
                    license: 'Unknown',
                    downloads: m.downloads || 0,
                    likes: m.likes || 0,
                    benchmarkEvidence: [],
                    matchScore: 0
                }));
                results = [...results, ...models];
            }
        } catch { } // fail silently per query
    }

    // Deduplicate
    const unique = new Map<string, Partial<NormalizedModel>>();
    for (const d of results) {
        if (!unique.has(d.id!)) unique.set(d.id!, d);
    }
    const finalModels = Array.from(unique.values());

    if (trace) {
        if (overallStatus !== 200 && finalModels.length === 0) {
            trace.success = false;
            trace.status = overallStatus;
        } else {
            trace.success = true;
            trace.modelsFound = finalModels.length; // Models found
        }
        if (!trace.durationMs) trace.durationMs = 0;
        trace.durationMs += Math.round(performance.now() - t0);
    }

    return finalModels;
}
