import { applyHardNegativeFilter } from './hardNegativeFilter';

function normalize(s: string): string {
    return (s ?? '').toLowerCase().trim();
}

function overlap(a: string, b: string): number {
    const na = normalize(a); const nb = normalize(b);
    if (!na || !nb) return 0;
    if (na.includes(nb) || nb.includes(na)) return 1;
    const wordsA = new Set(na.split(/\W+/).filter(w => w.length > 2));
    const wordsB = nb.split(/\W+/).filter(w => w.length > 2);
    const common = wordsB.filter(w => wordsA.has(w)).length;
    return wordsB.length > 0 ? common / wordsB.length : 0;
}

const TASK_KEYWORDS: Record<string, string[]> = {
    'Object Detection':          ['object detection','bounding box','bbox','detection','localization','yolo','faster rcnn','vehicle detection','car detection','annotated','labeled images','labelled'],
    'Multi-Object Tracking':     ['tracking','mot','multi-object','vehicle tracking','trajectory','bytetrack','botsort','multi object','surveillance'],
    'Counting':                  ['counting','count','crowd count','vehicle count','pedestrian count','people counting'],
    'Defect Detection':          ['defect detection','surface defect','industrial defect','scratch','crack','dent','missing component','surface damage','inspection','quality control','defect'],
    'Image Classification':      ['image classification','classification','medical image','mri','ct scan','x-ray','xray','radiology','tumor','lesion','retinal','histopathology','microscopy','scan','classify'],
    'Semantic Segmentation':     ['segmentation','semantic segmentation','pixel-wise','pixel classification','semantic'],
    'Instance Segmentation':     ['instance segmentation','mask','panoptic','instance'],
    'Text Classification':       ['text classification','document classification','nlp classification','text','nlp','natural language'],
    'Sentiment Analysis':        ['sentiment','sentiment analysis','opinion','review','positive negative','emotion'],
    'Binary Classification':     ['binary classification','fraud detection','spam detection','phishing','classification'],
    'Regression':                ['regression','price prediction','tabular regression','prediction'],
    'Forecasting':               ['forecast','forecasting','time series','temporal','demand prediction','energy forecast','timeseries'],
    'Anomaly Detection':         ['anomaly','anomaly detection','fraud','intrusion','malware','outlier'],
    'Multiclass Classification': ['multiclass','multi-class','multi class','classification','category'],
    'Audio Classification':          ['audio classification','sound classification','audio','speech','emotion recognition','ser','sound','acoustic'],
    'Speech Emotion Recognition':    ['speech emotion','emotion recognition','ser','speech emotion recognition','affective computing','emotion speech'],
    'Named Entity Recognition':      ['ner','named entity','entity recognition','information extraction'],
    'Loan Default Prediction':       ['loan','credit','default','fraud detection','financial risk'],
    'Medical Image Classification':  ['skin','cancer','disease','pathology','dermoscopy','medical','clinical','dermatology','lesion classification'],
};

function canonicalizeModality(value: string): string {
    const v = normalize(value);
    if (!v) return '';
    if (/(image|mri|ct|x-ray|xray|radiology|scan|medical|retina|tumor|lesion|microscopy|histopathology|vision)/.test(v)) return 'image';
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
    // Split comma/slash/+ joined task strings so each sub-task is matched independently
    const allTasks: string[] = [];
    for (const t of projectTasks) {
        t.split(/[,/+]+/).map((s: string) => s.trim()).filter(Boolean).forEach((s: string) => allTasks.push(s));
    }
    for (const task of allTasks) {
        const taskNorm = normalize(task);
        const keywords = TASK_KEYWORDS[task] ?? TASK_KEYWORDS[task.split(' ')[0]] ?? [taskNorm];
        if (keywords.some((k: string) => normalizedDataBlob.includes(normalize(k)))) { best = 100; break; }
        const taskWords = taskNorm.split(/\s+/).filter((w: string) => w.length > 3);
        if (taskWords.length > 0) {
            const matched = taskWords.filter((w: string) => normalizedDataBlob.includes(w));
            const partial = matched.length / taskWords.length;
            if (partial > 0) best = Math.max(best, Math.round(partial * 70));
        }
    }
    return best;
}

function computeModalityMatch(datasetModality: string, projectModality: string): number {
    if (!datasetModality || !projectModality) return 50;
    const ds = canonicalizeModality(datasetModality);
    const project = canonicalizeModality(projectModality);
    if (!ds || !project) return 50;
    if (ds === project) return 100;
    if (project === 'video' && ds === 'image') return 70;
    return 0;
}

function computeDomainMatch(datasetDomain: string, projectDomain: string): number {
    if (!datasetDomain || !projectDomain) return 40;
    return overlap(datasetDomain, projectDomain) * 100;
}

function computeSubdomainMatch(dataset: any, projectSubdomain: string): number {
    if (!projectSubdomain) return 40;
    const tags = dataset.tags ?? [];
    const textBlob = [dataset.name, dataset.title, dataset.description, ...tags].filter(Boolean).join(' ');
    if (!textBlob.trim()) return 40;
    const score = overlap(textBlob, projectSubdomain) * 100;
    if (score > 0) return score;
    const subWords = normalize(projectSubdomain).split(/\s+/).filter((w: string) => w.length > 3);
    if (subWords.length === 0) return 40;
    const blobNorm = normalize(textBlob);
    const matched = subWords.filter((w: string) => blobNorm.includes(w));
    return matched.length > 0 ? Math.round((matched.length / subWords.length) * 60) : 0;
}

function computeTargetMatch(dataset: any, targetLabels: string[]): number {
    if (!targetLabels?.length) return 50;
    const dataBlob = [dataset.name, dataset.description, ...(dataset.tags ?? [])].join(' ');
    const matched = targetLabels.filter(l => normalize(dataBlob).includes(normalize(l)));
    return (matched.length / targetLabels.length) * 100;
}

// ── Semantic label normalization for target compatibility ──────────────────────
const LABEL_ALIASES: Record<string, string[]> = {
    'happy':     ['happiness','joy','joyful','delighted','pleased','cheerful'],
    'sad':       ['sadness','sorrow','unhappy','grief','depressed','melancholy'],
    'angry':     ['anger','rage','furious','mad','irritated','enraged'],
    'fearful':   ['fear','scared','afraid','terror','anxious','frightened'],
    'surprised': ['surprise','shock','astonished','amazed','startled'],
    'neutral':   ['calm','boredom','bored','indifferent','serene'],
    'disgusted': ['disgust','repulsion','revulsion','aversion'],
    'malignant': ['cancer','malign','melanoma','carcinoma'],
    'benign':    ['benign','non-cancerous','normal'],
    'default':   ['defaulted','bad loan','non-performing'],
};

function normalizeLabel(label: string): string {
    const l = label.toLowerCase().trim();
    if (LABEL_ALIASES[l]) return l;
    for (const [canonical, aliases] of Object.entries(LABEL_ALIASES)) {
        if (aliases.includes(l)) return canonical;
    }
    return l;
}

export function computeTargetCompatibility(dataset: any, requestedLabels: string[]): {
    exactMatches: number; relatedMatches: number; missingLabels: string[];
    additionalLabels: string[]; compatibilityScore: number; requestedCount: number;
} {
    if (!requestedLabels || requestedLabels.length === 0) {
        return { exactMatches: 0, relatedMatches: 0, missingLabels: [], additionalLabels: [], compatibilityScore: 50, requestedCount: 0 };
    }
    const dataBlob = normalize([dataset.name, dataset.description, ...(dataset.tags ?? [])].join(' '));
    const normalizedRequested = requestedLabels.map(l => normalizeLabel(l));
    let exactMatches = 0; let relatedMatches = 0;
    const missingLabels: string[] = [];
    for (let i = 0; i < requestedLabels.length; i++) {
        const original = requestedLabels[i];
        const canonical = normalizedRequested[i];
        const aliases = LABEL_ALIASES[canonical] || [];
        const allForms = [original.toLowerCase(), canonical, ...aliases];
        const exactFound = allForms.some(f => dataBlob.includes(normalize(f)));
        if (exactFound) { exactMatches++; }
        else {
            const words = canonical.split(/s+/).filter((w: string) => w.length > 2);
            const partialFound = words.some((w: string) => dataBlob.includes(w));
            if (partialFound) { relatedMatches++; }
            else { missingLabels.push(original); }
        }
    }
    const covered = exactMatches + relatedMatches * 0.7;
    const compatibilityScore = Math.round((covered / requestedLabels.length) * 100);
    return { exactMatches, relatedMatches, missingLabels, additionalLabels: [], compatibilityScore, requestedCount: requestedLabels.length };
}

function computeMetadataScore(dataset: any): number {
    let score = 0;
    const bytes = dataset.sizeBytes ?? dataset.size ?? 0;
    if (bytes && bytes > 0) score += 40;
    if (dataset.license && normalize(dataset.license) !== 'unknown') score += 30;
    if (dataset.creator || dataset.author) score += 30;
    return score;
}

/** Convert raw 0-100 component score to proportional value (capped to its max weight).
 *  This way scoreBreakdown.task is out of 30, .modality out of 20, etc.
 *  The UI bar formula (val/max)*100 then gives the correct percentage. */
function toWeighted(score: number, max: number): number {
    return Math.min(max, Math.round(score * max / 100));
}

export function scoreDataset(dataset: any, project: any): any {
    const projectTasks = Array.isArray(project.task)
        ? project.task.filter(Boolean).map(String)
        : [String(project.task ?? '')].filter(Boolean);

    // Hard-negative check first — uses zeros since scores not yet computed
    const hnResult = applyHardNegativeFilter(dataset, project);
    if (hnResult.rejected) {
        return {
            ...dataset,
            rejected: true,
            rejectionReason: hnResult.rejectionReason,
            matchScore: 0,
            scoreBreakdown: { task: 0, modality: 0, domain: 0, subdomain: 0, target: 0, metadata: 0 },
            matchReason: 'Rejected: ' + hnResult.rejectionReason,
        };
    }

    // Compute all component scores (0-100 each)
    const taskScore      = computeTaskMatch(dataset, projectTasks);
    const modalityScore  = computeModalityMatch(dataset.modality ?? dataset.dataType ?? '', project.data_modality ?? '');
    const domainScore    = computeDomainMatch(dataset.domain ?? '', project.domain ?? '');
    const subdomainScore = computeSubdomainMatch(dataset, project.subdomain ?? '');
    const metadataScore  = computeMetadataScore(dataset);
    const targetCompatibility = computeTargetCompatibility(dataset, project.target_labels ?? []);
    // Classification tasks weight label compatibility more heavily (20% vs 10%)
    const isClassificationTask = /classif|emotion|sentiment|categor|ser|audio class/i.test(String(project.task||''));
    const taskW    = isClassificationTask ? 0.25 : 0.30;
    const targetW  = isClassificationTask ? 0.20 : 0.10;
    const domainW  = isClassificationTask ? 0.10 : 0.20;
    const subdomW  = isClassificationTask ? 0.10 : 0.15;
    const finalScore = Math.min(100, Math.round(
        taskScore * taskW + modalityScore * 0.20 +
        targetCompatibility.compatibilityScore * targetW +
        domainScore * domainW + subdomainScore * subdomW +
        metadataScore * 0.05
    ));
    const matchReason = buildMatchReason(taskScore, modalityScore, domainScore, subdomainScore, targetCompatibility, projectTasks);

    return {
        ...dataset,
        rejected: false,
        matchScore: finalScore,
        scoreBreakdown: {
            task:      toWeighted(taskScore,                              isClassificationTask?25:30),
            modality:  toWeighted(modalityScore,                          20),
            target:    toWeighted(targetCompatibility.compatibilityScore, isClassificationTask?20:10),
            domain:    toWeighted(domainScore,                            isClassificationTask?10:20),
            subdomain: toWeighted(subdomainScore,                         isClassificationTask?10:15),
            metadata:  toWeighted(metadataScore,                          5),
        },
        matchReason,
        targetCompatibility,
    };
}

function buildMatchReason(task: number, modality: number, domain: number, subdomain: number, tc: ReturnType<typeof computeTargetCompatibility>, tasks: string[]): string {
    const parts: string[] = [];
    if (task >= 80)      parts.push('strong task alignment (' + tasks.join(' + ') + ': ' + task + '%)');
    else if (task >= 50) parts.push('partial task match (' + task + '%)');
    else                 parts.push('weak task match (' + task + '%)');
    if (modality >= 80)  parts.push('modality confirmed');
    if (domain >= 70)    parts.push('domain confirmed');
    if(tc.requestedCount>0){if(tc.exactMatches===tc.requestedCount)parts.push('all '+tc.requestedCount+' labels found');else if(tc.exactMatches+tc.relatedMatches>0)parts.push((tc.exactMatches+tc.relatedMatches)+'/'+tc.requestedCount+' labels matched');else parts.push('labels not confirmed in metadata');}
    return parts.join(', ');
}