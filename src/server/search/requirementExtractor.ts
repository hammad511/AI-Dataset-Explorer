/** Generic requirement extraction for arbitrary AI/ML project descriptions. */
import { Requirement, RequirementProfile, RequirementCategory } from './types';
import { extractAnchorSubjectTerms } from './queryUnderstanding';

const CATEGORY_WEIGHT: Partial<Record<RequirementCategory, number>> = {
    DOMAIN: 0.18, MODALITY: 0.16, TASK: 0.18, TARGET: 0.22,
    DATA_SIZE: 0.05, LABEL_AVAILABILITY: 0.06, OTHER: 0.04,
    PRETRAINING: 0.03, COMPUTE: 0.04, TEMPORAL: 0.04, MULTIMODAL: 0.06,
};
const TASKS = /classification|classify|recognition|segmentation|segment(?:ation)?|detection|detect|localization|tracking|forecast(?:ing)?|prediction|regression|ranking|priority|retrieval|recommendation|clustering|generation|translation|summarization|summariz|question answering|speech recognition|pose estimation|anomaly detection|control|planning|reinforcement learning|named entity recognition|\bner\b|\brag\b/i;
const MODALITIES = /image|photo(?:graph)?s?|video|audio|speech|voice|text|multilingual|language|notes?|documents?|tabular|csv|time[- ]series|sensor|3d|3-d|point[- ]cloud|multimodal|genomic|geospatial|satellite|multispectral|hyperspectral|thermal|infrared|microscop|histolog|dermoscop|fundus|x[- ]?ray|cxr|ct\b|cta\b|mri\b|ultrasound|eeg|ieeg|lidar|cryo[- ]?e[mt]/i;
const STRUCTURE = /2d|3d|4d|volumetric|sequence|sequential|temporal|spatial|graph|point[- ]cloud|stream/i;

function unique(values: string[]): string[] { return [...new Set(values.map(value => value.trim()).filter(Boolean))]; }
function phrase(query: string, pattern: RegExp): string | null { return query.match(pattern)?.[1]?.trim() || null; }
function add(requirements: Requirement[], hard: string[], soft: string[], id: string, category: RequirementCategory, value: string, description: string, isHard: boolean, confidence: number, source: 'explicit' | 'inferred' = 'inferred'): void {
    requirements.push({ id, category, detectedValue: value, description, importance: isHard ? 'CRITICAL' : 'MEDIUM', isHard, confidence, source, weight: CATEGORY_WEIGHT[category] || 0.05 });
    (isHard ? hard : soft).push(id);
}

export function extractRequirementProfile(rawQuery: string): RequirementProfile {
    const query = rawQuery.trim();
    const lower = query.toLowerCase();
    const requirements: Requirement[] = [];
    const hardRequirementIds: string[] = [];
    const softRequirementIds: string[] = [];
    const preferences: string[] = [];
    const negativeRequirements: string[] = [];

    const explicitTask = phrase(query, /\b(?:task|to|for)\s+(?:is\s+)?([a-z][a-z -]{2,40})/i);
    const taskMatches = unique((lower.match(new RegExp(TASKS.source, 'gi')) || []));
    const task = explicitTask && TASKS.test(explicitTask) ? explicitTask : taskMatches[0] || null;
    if (taskMatches.length > 0) {
        taskMatches.forEach((t, idx) => {
            add(requirements, hardRequirementIds, softRequirementIds, `req_task_${idx}`, 'TASK', t, `Required task: ${t}`, false, 0.85, 'explicit');
        });
    } else if (task) {
        add(requirements, hardRequirementIds, softRequirementIds, 'req_task', 'TASK', task, `Required task: ${task}`, false, explicitTask ? 0.95 : 0.8, explicitTask ? 'explicit' : 'inferred');
    }

    const modalityMatches = unique(lower.match(new RegExp(MODALITIES.source, 'gi')) || []);
    let modality = modalityMatches[0] || null;
    if (!modality) {
        if (/\bner\b|named\s*entity|\brag\b|clinical\s*notes|pathology\s*notes|legal|sentiment|summariz|translation/i.test(lower)) {
            modality = 'text';
        } else if (/fraud|credit\s*risk|churn/i.test(lower)) {
            modality = 'tabular';
        } else if (/solar\s*panel|plant|leaf|vehicle|traffic|skin|melanoma|retinopath|nuclei/i.test(lower)) {
            modality = 'image';
        }
    }
    if (modality) add(requirements, hardRequirementIds, softRequirementIds, 'req_modality', 'MODALITY', modality, `Input modality: ${modality}`, true, 0.88);

    const dimensions = unique(lower.match(/\b(?:2d|3d|4d|volumetric|point[- ]cloud|sequence|time[- ]series|graph)\b/gi) || []);

    // Always extract anchor subject terms (handles both noun-first and verb-first problem statements)
    const { anchorTerms, coreSubjectPhrase } = extractAnchorSubjectTerms(query);
    const phraseObject =
        phrase(query, /\b(?:detect|classif(?:y|ication)|segment|recognize|forecast|predict)\s+(?:the\s+)?([a-z][a-z0-9 -]{2,50}?)(?:\s+from|\s+using|\s+in|\s+on|\.|,|$)/i) ||
        phrase(query, /\b(?:dataset|model|system)\s+for\s+([a-z][a-z0-9 -]{2,50}?)(?:\s+from|\s+using|\s+with|\.|,|$)/i);

    const targetValue = anchorTerms.length > 0
        ? anchorTerms.join('; ')
        : phraseObject;

    if (targetValue) {
        add(
            requirements,
            hardRequirementIds,
            softRequirementIds,
            'req_object',
            'TARGET',
            targetValue,
            `Target subject/entity: ${coreSubjectPhrase || targetValue}`,
            true,
            0.90,
            'explicit'
        );
    }

    const domain = phrase(query, /\b(?:in|within|for)\s+(?:the\s+)?([a-z][a-z0-9 &/-]{2,40}?)(?:\s+domain|\s+data|\s+datasets?|\s+projects?|\s+applications?|\.|,|$)/i);
    if (domain && !TASKS.test(domain) && !MODALITIES.test(domain)) {
        add(requirements, hardRequirementIds, softRequirementIds, 'req_domain', 'DOMAIN', domain, `Project domain: ${domain}`, false, 0.72);
    }

    const labelsRequired = /labeled|labelled|annotated|ground truth|class labels?|supervised/i.test(lower);
    if (labelsRequired) add(requirements, hardRequirementIds, softRequirementIds, 'req_labels', 'LABEL_AVAILABILITY', 'labeled/annotated', 'Labels or annotations are required', true, 0.94, 'explicit');
    const publicAccess = /public(?:ly)? available|open access|open[- ]source|downloadable/i.test(lower);
    if (publicAccess) add(requirements, hardRequirementIds, softRequirementIds, 'req_public', 'OTHER', 'public access', 'Public access is required', true, 0.93, 'explicit');

    const sourceMatches = unique(lower.match(/kaggle|hugging\s*face|github|arxiv|pubmed|semantic scholar|openalex|research repository/gi) || []);
    if (sourceMatches.length) { preferences.push(...sourceMatches); add(requirements, hardRequirementIds, softRequirementIds, 'req_source', 'OTHER', sourceMatches.join(', '), `Preferred sources: ${sourceMatches.join(', ')}`, false, 0.9, 'explicit'); }
    const licenseMatches = unique(lower.match(/\b(?:mit|apache(?: 2\.0)?|bsd(?:-\d)?|cc[- ]by(?:-sa)?|creative commons|gpl)\b/gi) || []);
    if (licenseMatches.length) add(requirements, hardRequirementIds, softRequirementIds, 'req_license', 'OTHER', licenseMatches.join(', '), `License preference: ${licenseMatches.join(', ')}`, false, 0.9, 'explicit');
    const minSize = Number((lower.match(/(?:at least|minimum of|over)\s*([\d,]+)\s*(?:samples|images|records|rows|examples)/i)?.[1] || '').replace(/,/g, '')) || null;
    if (minSize) add(requirements, hardRequirementIds, softRequirementIds, 'req_size', 'DATA_SIZE', String(minSize), `Minimum resource size: ${minSize}`, false, 0.9, 'explicit');
    const year = Number(lower.match(/(?:after|since|from|published\s+in)\s+(20\d{2})/i)?.[1] || '') || null;
    if (year) add(requirements, hardRequirementIds, softRequirementIds, 'req_year', 'OTHER', String(year), `Research year: ${year}`, false, 0.9, 'explicit');

    const negatives = lower.match(/(?:not|without|excluding|exclude|only)\s+([a-z][a-z0-9 -]{2,50})/gi) || [];
    negativeRequirements.push(...negatives.map(value => value.replace(/^(not|without|excluding|exclude|only)\s+/i, '').trim()));
    if (negativeRequirements.length) add(requirements, hardRequirementIds, softRequirementIds, 'req_negative', 'OTHER', negativeRequirements.join(', '), `Excluded concepts: ${negativeRequirements.join(', ')}`, true, 0.9, 'explicit');
    if (/prefer|preferred|ideally|would like/i.test(lower)) preferences.push('user preference stated');

    const isLongitudinal = /longitudinal|multi[- ]?timepoint|follow[- ]?up|progression over|serial\s*scan|repeat\s*scan/i.test(lower);
    if (isLongitudinal) {
        add(requirements, hardRequirementIds, softRequirementIds, 'req_longitudinal', 'LONGITUDINAL', 'longitudinal', 'Longitudinal multi-timepoint data structure required', true, 0.95, 'explicit');
    }
    const isMultimodal = /multimodal|multi[- ]modal|multiple modalities/i.test(lower);
    const hasClinicalData = /clinical\s*(?:data|cohort|records?|patients?|variables?)|real[- ]patient|ehr\b|electronic health|medical record|progression label/i.test(lower);
    if (hasClinicalData) {
        add(requirements, hardRequirementIds, softRequirementIds, 'req_clinical', 'CLINICAL', 'patient clinical data', 'Patient clinical cohort data required', true, 0.90, 'explicit');
    }
    const hasClassImbalance = /class imbalance|imbalanced|rare class/i.test(lower);
    const hasMissingData = /missing data|missing values?|incomplete/i.test(lower);
    const gpu = Number(lower.match(/(\d+)\s*gb(?:\s*(?:vram|gpu|memory))?\b/i)?.[1] || '') || null;
    if (gpu) add(requirements, hardRequirementIds, softRequirementIds, 'req_gpu', 'GPU', `${gpu}GB`, `Compute limit: ${gpu}GB`, true, 0.95, 'explicit');

    const totalWeight = requirements.reduce((sum, item) => sum + item.weight, 0) || 1;
    requirements.forEach(item => { item.weight /= totalWeight; });
    const wantsModel = /model|architecture|network|backbone/i.test(lower);
    const wantsDataset = /dataset|data|training set/i.test(lower);
    const queryType = wantsDataset && wantsModel ? 'all' : wantsModel ? 'model' : wantsDataset ? 'dataset' : 'all';
    const resolvedObject = coreSubjectPhrase || phraseObject || null;
    return {
        requirements, hardRequirementIds, softRequirementIds, gpuVramLimitGb: gpu,
        isLongitudinal, isMultimodal, hasClinicalData, hasClassImbalance, hasMissingData,
        primaryDomainKeywords: anchorTerms.length > 0 ? anchorTerms : (domain ? [domain] : []), queryType,
        domain: domain || coreSubjectPhrase || null, subdomain: null, object: resolvedObject,
        input: { type: modality || null, modality, dimensions: dimensions.join(', ') || null, structure: STRUCTURE.test(lower) ? dimensions.join(', ') : null },
        output: { type: task || null, labels: labelsRequired ? ['labeled'] : [], classes: [] },
        entities: unique([...anchorTerms, ...(resolvedObject ? [resolvedObject] : []), ...modalityMatches]), preferences, negativeRequirements,
        datasetRequirements: { minimumSize: minSize, maximumSize: null, annotationRequired: labelsRequired || null, labelRequired: labelsRequired || null, license: licenseMatches, source: sourceMatches, publicAccess: publicAccess || null },
        researchRequirements: { year, venue: [], datasetSpecific: /papers?\s+(?:using|about)|dataset[- ]specific/i.test(lower) ? true : null },
    };
}

const profileCache = new Map<string, RequirementProfile>();
export function getRequirementProfile(rawInput: string | any): RequirementProfile {
    const rawQuery = typeof rawInput === 'string' ? rawInput : (rawInput?.rawQuery || rawInput?.query || '');
    const key = (rawQuery || '').trim();
    const cached = profileCache.get(key);
    if (cached) return cached;
    const profile = extractRequirementProfile(key);
    profileCache.set(key, profile);
    return profile;
}
