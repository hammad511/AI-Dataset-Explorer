/**
 * Dataset Scorer — 100-point deterministic algorithm
 *
 * Weights:
 *   Task Match       = 30%
 *   Modality Match   = 20%
 *   Domain Match     = 20%
 *   Subdomain Match  = 15%
 *   Target Match     = 10%
 *   Metadata Quality =  5%
 *
 * Hard-negative datasets are filtered before scoring.
 * Score of 0 is assigned if hard-negative is detected.
 * Output field is `scoreBreakdown` (consistent with UI and fallback data).
 */

import { applyHardNegativeFilter } from './hardNegativeFilter';

function normalize(s: string): string {
    return (s ?? '').toLowerCase().trim();
}

function overlap(a: string, b: string): number {
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return 0;
    if (na.includes(nb) || nb.includes(na)) return 1;
    const wordsA = new Set(na.split(/\W+/).filter(w => w.length > 2));
    const wordsB = nb.split(/\W+/).filter(w => w.length > 2);
    const common = wordsB.filter(w => wordsA.has(w)).length;
    return wordsB.length > 0 ? common / wordsB.length : 0;
}

// Task keyword mapping — extend as needed
const TASK_KEYWORDS: Record<string, string[]> = {
    'Object Detection': ['object detection', 'bounding box', 'bbox', 'detection', 'localization', 'yolo', 'faster rcnn', 'vehicle detection', 'car detection'],
    'Multi-Object Tracking': ['tracking', 'mot', 'multi-object', 'vehicle tracking', 'trajectory', 'bytetrack', 'botsort'],
    'Counting': ['counting', 'count', 'crowd count', 'vehicle count', 'pedestrian count'],
    'Defect Detection': ['defect detection', 'surface defect', 'industrial defect', 'scratch', 'crack', 'dent', 'missing component', 'surface damage', 'inspection'],
    'Image Classification': ['image classification', 'medical image', 'mri', 'ct scan', 'x-ray', 'xray', 'radiology', 'vision', 'tumor', 'lesion', 'retinal', 'histopathology', 'microscopy', 'scan'],
    'Semantic Segmentation': ['segmentation', 'semantic', 'pixel-wise', 'pixel classification'],
    'Instance Segmentation': ['instance segmentation', 'mask', 'panoptic'],
    'Text Classification': ['text classification', 'document classification', 'nlp classification'],
    'Sentiment Analysis': ['sentiment', 'opinion', 'review', 'positive negative'],
    'Binary Classification': ['binary classification', 'positive negative', 'yes no', 'fraud', 'spam', 'phishing'],
    'Regression': ['regression', 'price prediction', 'tabular regression'],
    'Forecasting': ['forecast', 'time series', 'temporal', 'demand prediction', 'energy forecast'],
    'Anomaly Detection': ['anomaly', 'fraud', 'intrusion', 'phishing', 'malware'],
};

function canonicalizeModality(value: string): string {
    const v = normalize(value);
    if (!v) return '';
    if (/(image|images|mri|ct|x-ray|xray|radiology|scan|medical|retina|tumor|lesion|microscopy|histopathology|vision)/.test(v)) return 'image';
    if (/(text|sentiment|review|nlp|document|language|chat|url|webpage)/.test(v)) return 'text';
    if (/(video|frame|sequence|motion|cctv|surveillance)/.test(v)) return 'video';
    if (/(audio|speech|sound)/.test(v)) return 'audio';
    if (/(tabular|csv|table|numeric|structured)/.test(v)) return 'tabular';
    if (/(time.?series|timeseries|temporal|hourly|daily)/.test(v)) return 'timeseries';
    return v;
}

function computeTaskMatch(dataset: any, projectTasks: string[]): number {
    const dataBlob = [dataset.name, dataset.title, dataset.description, ...(dataset.tags ?? [])].join(' ');
    const normalizedDataBlob = normalize(dataBlob);
    let best = 0;

    for (const task of projectTasks) {
        const taskNorm = normalize(task);
        const keywords = TASK_KEYWORDS[task] ?? [taskNorm];
        const score = keywords.some(k => normalizedDataBlob.includes(normalize(k))) ? 1 : 0;
        if (score > best) best = score;
    }
    return best * 100;
}

function computeModalityMatch(datasetModality: string, projectModality: string): number {
    if (!datasetModality || !projectModality) return 50;
    const ds = canonicalizeModality(datasetModality);
    const project = canonicalizeModality(projectModality);
    if (!ds || !project) return 50;
    if (ds === project) return 100;
    // video datasets are also scored by image tasks (detection on frames)
    if (project === 'video' && ds === 'image') return 70;
    return 0;
}

function computeDomainMatch(datasetDomain: string, projectDomain: string): number {
    if (!datasetDomain || !projectDomain) return 40;
    return overlap(datasetDomain, projectDomain) * 100;
}

function computeSubdomainMatch(datasetTags: string[], projectSubdomain: string): number {
    if (!projectSubdomain || !datasetTags?.length) return 40;
    const blob = datasetTags.join(' ');
    return overlap(blob, projectSubdomain) * 100;
}

function computeTargetMatch(dataset: any, targetLabels: string[]): number {
    if (!targetLabels?.length) return 50;
    const dataBlob = [dataset.name, dataset.description, ...(dataset.tags ?? [])].join(' ');
    const matched = targetLabels.filter(l => normalize(dataBlob).includes(normalize(l)));
    return (matched.length / targetLabels.length) * 100;
}

function computeMetadataScore(dataset: any): number {
    let score = 0;
    // Use sizeBytes (the correct field name used throughout the codebase)
    const bytes = dataset.sizeBytes ?? dataset.size ?? 0;
    if (bytes && bytes > 0) score += 40;
    if (dataset.license && normalize(dataset.license) !== 'unknown') score += 30;
    if (dataset.creator || dataset.author) score += 30;
    return score;
}

export function scoreDataset(dataset: any, project: any): any {
    const projectTasks = Array.isArray(project.task)
        ? project.task.filter(Boolean).map(String)
        : [String(project.task ?? '')].filter(Boolean);

    // Hard-negative check first
    const hnResult = applyHardNegativeFilter(dataset, project);
    if (hnResult.rejected) {
        return {
            ...dataset,
            rejected: true,
            rejectionReason: hnResult.rejectionReason,
            matchScore: 0,
            scoreBreakdown: { task: 0, modality: 0, domain: 0, subdomain: 0, target: 0, metadata: 0 },
            matchReason: `Rejected: ${hnResult.rejectionReason}`,
        };
    }

    const taskScore = computeTaskMatch(dataset, projectTasks);
    const modalityScore = computeModalityMatch(dataset.modality ?? dataset.dataType ?? '', project.data_modality ?? '');
    const domainScore = computeDomainMatch(dataset.domain ?? '', project.domain ?? '');
    const subdomainScore = computeSubdomainMatch(dataset.tags ?? [], project.subdomain ?? '');
    const targetScore = computeTargetMatch(dataset, project.target_labels ?? []);
    const metadataScore = computeMetadataScore(dataset);

    const finalScore = Math.round(
        taskScore * 0.30 +
        modalityScore * 0.20 +
        domainScore * 0.20 +
        subdomainScore * 0.15 +
        targetScore * 0.10 +
        metadataScore * 0.05
    );

    const matchReason = buildMatchReason(taskScore, modalityScore, domainScore, subdomainScore, targetScore, projectTasks);

    return {
        ...dataset,
        rejected: false,
        matchScore: finalScore,
        // scoreBreakdown is the canonical field name (used in UI and fallback data)
        scoreBreakdown: {
            task: Math.round(taskScore),
            modality: Math.round(modalityScore),
            domain: Math.round(domainScore),
            subdomain: Math.round(subdomainScore),
            target: Math.round(targetScore),
            metadata: Math.round(metadataScore),
        },
        matchReason,
    };
}

function buildMatchReason(task: number, modality: number, domain: number, subdomain: number, target: number, tasks: string[]): string {
    const parts: string[] = [];
    if (task >= 80) parts.push(`strong task alignment (${tasks.join(' + ')}: ${task}%)`);
    else if (task >= 50) parts.push(`partial task match (${task}%)`);
    else parts.push(`weak task match (${task}%)`);
    if (modality >= 80) parts.push('modality confirmed');
    if (domain >= 70) parts.push('domain confirmed');
    if (target >= 70) parts.push('target labels present');
    return parts.join(', ');
}
