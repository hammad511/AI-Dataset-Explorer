/**
 * Query Understanding Engine (Search Engine 2.0.0)
 *
 * Converts natural-language research problem statements into a deep, structured
 * scientific representation (ResearchQuerySchema) without losing critical tokens.
 *
 * Preserves exact tokens: "4D", "flow", "cardiac", "MRI", "velocity", "field",
 * "reconstruction", "sparse", "k-space", "radial", "undersampling", "hemodynamic",
 * "wall shear stress", "estimation".
 */

import {
    ResearchQuerySchema,
    StructuredQueryUnderstanding,
    ExtractedAnatomy,
    ExtractedConstraints,
    Dimensionality,
} from './types';
import {
    ANATOMY_ONTOLOGY,
    MODALITY_ONTOLOGY,
    TASK_ONTOLOGY,
    SCIENTIFIC_CONCEPT_GRAPH,
    getDynamicNegativeConcepts,
    isMedicalProblem,
    normalizeAnatomy,
    normalizeModality,
    normalizeTask,
    normalizeDimensionality,
    getConflictingAnatomies,
} from './ontology';

// â”€â”€ Scientific Domain Matchers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface DomainMatchRule {
    domain: string;
    subdomains: string[];
    test: (q: string) => boolean;
}

const DOMAIN_RULES: DomainMatchRule[] = [
    {
        domain: 'Biomedical / Cardiovascular MRI / Computational Hemodynamics',
        subdomains: ['Cardiovascular MRI', '4D Flow MRI', 'Computational Hemodynamics', 'Accelerated MRI Reconstruction'],
        test: (q) => /cardiac|heart|myocard|aort|coronary|cardiovascular/i.test(q) && /mri|magnetic\s*resonance/i.test(q) && /flow|velocity|hemodynamic|shear\s*stress|k-space/i.test(q),
    },
    {
        domain: 'Biomedical / Neurology & Neurodegenerative Diseases',
        subdomains: ['Alzheimer\'s Disease', 'Mild Cognitive Impairment (MCI)', 'Longitudinal Neuroimaging', 'Dementia Progression'],
        test: (q) => /alzheimer|dementia|mild\s*cognitive\s*impairment|\bmci\b|adni|oasis|apoe|cognitive\s*score|cognitive\s*progression/i.test(q),
    },
    {
        domain: 'Biomedical / Cardiology & Cardiovascular Imaging',
        subdomains: ['Cardiovascular Imaging', 'Cardiac MRI', 'Coronary CTA'],
        test: (q) => /cardiac|heart|myocard|aort|coronary|cardiovascular/i.test(q),
    },
    {
        domain: 'Biomedical / Ophthalmology & Retinal Imaging',
        subdomains: ['Diabetic Retinopathy', 'Fundus Photography', 'Retinal Disease Classification', 'Ophthalmology'],
        test: (q) => /retinopath|retina|fundus|ophthalm|diabetic\s*retinopathy|macular|glaucoma/i.test(q),
    },
    {
        domain: 'Biomedical / Dermatology & Skin Oncology',
        subdomains: ['Melanoma Detection', 'Skin Lesion Classification', 'Dermoscopy'],
        test: (q) => /melanoma|skin\s*(lesion|cancer|disease|tumor|condition)|isic|dermoscop|dermatolog/i.test(q),
    },
    {
        domain: 'Document AI, OCR & Receipt / Invoice Extraction',
        subdomains: ['Receipt & Invoice OCR', 'Key Information Extraction (KIE)', 'Vision-Language Document Parsing', 'Structured Line-Item Extraction'],
        test: (q) => /\breceipts?\b|\binvoices?\b|\bocr\b|optical\s*character|scanned\s*(?:document|receipt|invoice|form|image)|key\s*information\s*extraction|\bkie\b|\bdocvqa\b|\bsroie\b|\bcord\b|\bfunsd\b|\bdonut\b|\blayoutlm\w*\b/i.test(q),
    },
    {
        domain: 'Clinical & Biomedical Natural Language Processing',
        subdomains: ['Clinical NER', 'Pathology Note Extraction', 'Biomedical Text Mining', 'EHR NLP'],
        test: (q) => /(?:clinical|pathology|medical|biomedical|ehr|radiology|patient|doctor|hospital|oncology).*(?:\bner\b|named\s*entity|notes?|text|reports?|nlp|token\s*classification|entity\s*extraction)/i.test(q) || (/\bner\b|named\s*entity/i.test(q) && /clinical|pathology|medical|biomedical|ehr|disease|drug/i.test(q)),
    },
    {
        domain: 'Legal, Financial & Enterprise RAG / NLP',
        subdomains: ['Legal Document Analysis', 'Retrieval-Augmented Generation (RAG)', 'Multilingual Document Retrieval'],
        test: (q) => /\blegal\b|\bcontract\b|\blaw\b|\blegislation\b|\brag\b|retrieval[- ]augmented/i.test(q),
    },
    {
        domain: 'Renewable Energy & Thermal Solar Inspection',
        subdomains: ['Solar Panel Defect Detection', 'Photovoltaic Thermal Inspection', 'Electroluminescence Anomaly Detection'],
        test: (q) => /solar\s*panel|photovoltaic|\bpv\s*(?:panel|module|defect)|electroluminescen/i.test(q),
    },
    {
        domain: 'Biomedical / Cellular Biology & Digital Pathology',
        subdomains: ['Nuclei Segmentation', 'Fluorescence Microscopy', 'Histopathology'],
        test: (q) => /nuclei|cellular|fluorescence|histolog|monuseg|stardist/i.test(q),
    },
    {
        domain: 'Biomedical / Neurology & Neuroimaging',
        subdomains: ['Brain MRI', 'Neuroimaging', 'Neuro-oncology', 'Brain Tumor'],
        test: (q) => /\bbrain\b|cerebr|hippocamp|glioma|\bstroke\b|epilep|\beeg\b|\bieeg\b|\becog\b|cranial|\bneuro(?:imaging|logy|oncology)?\b/i.test(q),
    },
    {
        domain: 'Biomedical / Abdominal Imaging & Oncology',
        subdomains: ['Abdominal Radiology', 'Multi-organ Segmentation', 'Hepatic & Renal Imaging'],
        test: (q) => /abdomen|abdominal|liver|kidney|pancreas|spleen|stomach|gallbladder/i.test(q),
    },
    {
        domain: 'Biomedical / Pulmonary & Thoracic Imaging',
        subdomains: ['Chest Radiography', 'Pulmonary CT', 'Lung Nodule Analysis', 'Pneumonia Detection'],
        test: (q) => /lung|pulmonary|pneumonia|cxr|chest\s*x.?ray|pleural|bronchial/i.test(q),
    },
    {
        domain: 'Aerospace & Industrial Defect Inspection',
        subdomains: ['Surface Defect Detection', 'Aircraft Inspection', 'Industrial Quality Control'],
        test: (q) => /aircraft|airplane|aerospace|fuselage|aviation|defect|panel|surface\s*inspection|crack|corrosion|manufacturing\s*defect/i.test(q),
    },
    {
        domain: 'Agriculture & Remote Sensing',
        subdomains: ['Crop Disease Detection', 'Crop Yield Estimation', 'Satellite Agriculture', 'Precision Agriculture'],
        test: (q) => /crop|plant|leaf|leaves|agriculture|farming|weed|satellite|multispectral|remote\s*sensing/i.test(q),
    },
    {
        domain: 'Structural Biology & Cryo-Microscopy',
        subdomains: ['Cryo-ET', 'Cryo-EM', 'Subtomogram Averaging', 'Macromolecular Structures'],
        test: (q) => /cryo[- ]?e[mt]|electron\s*tomograph|subtomogram|macromolecule|structural\s*biology/i.test(q),
    },
    {
        domain: 'Computer Vision / Object Detection & Vehicles',
        subdomains: ['Vehicle Detection', 'Traffic Surveillance', 'Instance Segmentation', 'YOLOv8'],
        test: (q) => /vehicle|traffic|car\b|cctv|surveillance|yolo/i.test(q),
    },
    {
        domain: 'Computer Vision / Fine-Grained Object Classification',
        subdomains: ['Animal Classification', 'Pet Recognition', 'Fine-Grained Classification'],
        test: (q) => /cats?\s*and\s*dogs?|pet\b|animal\b|dog\b|cat\b/i.test(q),
    },
    {
        domain: 'Robotics & Physical AI',
        subdomains: ['Robot Manipulation', 'Teleoperation', 'Imitation Learning'],
        test: (q) => /robot|manipulat|so.?101|lerobot|teleoperat|gripper|policy\s*learning/i.test(q),
    },
    {
        domain: 'Natural Language Processing & Language Models',
        subdomains: ['Ticket Triage', 'Text Classification', 'Information Extraction', 'Summarization'],
        test: (q) => /nlp|natural\s*language|sentiment|llm|transformer|text\s*classif|summariz|ticket|triage|customer\s*support|\btext\b|\bmultilingual\b|\bner\b/i.test(q),
    },
    {
        domain: 'Audio & Speech Processing',
        subdomains: ['Speech Recognition', 'Acoustic Classification', 'Audio Forensics'],
        test: (q) => /\baudio\b|\bspeech\b|\bvoice\b|\bwav\b|\bacoustic\b|\bsound\b|\bspeaker\b/i.test(q),
    },
    {
        domain: 'Autonomous Driving & Spatial Perception',
        subdomains: ['LiDAR Point Clouds', 'Trajectory Prediction', 'Multi-Object Tracking'],
        test: (q) => /autonomous|self.?driving|lidar|point\s*cloud|kitti|nuscenes/i.test(q),
    },
    {
        domain: 'Financial Fraud & Tabular Prediction',
        subdomains: ['Anomaly Detection', 'Tabular Forecasting', 'Credit Fraud'],
        test: (q) => /fraud|credit\s*card|banking|financial|stock|forecasting/i.test(q),
    },
    {
        domain: 'Clinical & Biomedical Natural Language Processing',
        subdomains: ['Clinical NER', 'Pathology Note Extraction', 'Biomedical Text Mining', 'EHR NLP'],
        test: (q) => /(?:clinical|pathology|medical|biomedical|ehr|radiology|patient|doctor|hospital| oncology)\s*(?:ner\b|notes?|text|reports?|nlp|extraction|summariz|classification)/i.test(q) || (/\bner\b|named\s*entity/i.test(q) && /clinical|pathology|medical|biomedical|ehr|disease|drug/i.test(q)),
    },
    {
        domain: 'Legal, Financial & Enterprise RAG / NLP',
        subdomains: ['Legal Document Analysis', 'Retrieval-Augmented Generation (RAG)', 'Multilingual Document Retrieval'],
        test: (q) => /\blegal\b|\bcontract\b|\blaw\b|\blegislation\b|\brag\b|retrieval[- ]augmented/i.test(q),
    },
    {
        domain: 'Renewable Energy & Thermal Solar Inspection',
        subdomains: ['Solar Panel Defect Detection', 'Photovoltaic Thermal Inspection', 'Electroluminescence Anomaly Detection'],
        test: (q) => /solar\s*panel|photovoltaic|\bpv\s*(?:panel|module|defect)|electroluminescen/i.test(q),
    },
];

// ── Core Subject & Anchor-Token Extraction ───────────────────────────────────

const GENERIC_ML_STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'for', 'to', 'in', 'on', 'of', 'with', 'from', 'by', 'at', 'as', 'into', 'over', 'under',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'can', 'could',
    'must', 'shall', 'may', 'might', 'that', 'this', 'these', 'those', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
    'all', 'both', 'each', 'every', 'any', 'some', 'such', 'other', 'another', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'also',
    'i', 'im', 'we', 'our', 'my', 'me', 'you', 'your', 'it', 'its', 'they', 'them', 'their',
    'want', 'wants', 'need', 'needs', 'looking', 'search', 'searching', 'find', 'finding', 'build', 'building', 'create', 'creating',
    'make', 'making', 'develop', 'developing', 'train', 'training', 'fine', 'tune', 'tuning', 'finetune', 'finetuning', 'use', 'uses', 'used', 'using', 'based',
    'run', 'runs', 'running', 'work', 'works', 'working', 'allow', 'allows', 'allowed', 'allowing', 'support', 'supports', 'supporting',
    'extract', 'extracts', 'extracted', 'extracting', 'extraction', 'parse', 'parses', 'parsed', 'parsing', 'process', 'processing', 'handle', 'handling',
    'dataset', 'datasets', 'data', 'database', 'corpus', 'corpora', 'collection', 'benchmark', 'benchmarks', 'challenge',
    'model', 'models', 'architecture', 'architectures', 'network', 'networks', 'backbone', 'backbones', 'checkpoint', 'weights', 'pretrained',
    'system', 'systems', 'pipeline', 'pipelines', 'project', 'projects', 'application', 'applications', 'solution', 'solutions',
    'tool', 'tools', 'framework', 'frameworks', 'method', 'methods', 'approach', 'approaches', 'algorithm', 'algorithms',
    'saas', 'b2b', 'b2c', 'mvp', 'poc', 'prod', 'production', 'enterprise', 'business', 'company', 'service', 'services', 'platform', 'api', 'sdk', 'app', 'workflow',
    'ai', 'ml', 'dl', 'deep', 'learning', 'machine', 'neural', 'artificial', 'intelligence', 'automated', 'automatic',
    'classification', 'classify', 'classifier', 'segmentation', 'segment', 'segmenter', 'detection', 'detect', 'detector',
    'recognition', 'recognize', 'prediction', 'predict', 'predictor', 'estimation', 'estimate', 'regression', 'clustering',
    'generation', 'generate', 'identification', 'identify', 'analysis', 'analyze', 'monitoring', 'monitor', 'assessment',
    'image', 'images', 'imaging', 'photo', 'photos', 'photograph', 'photographs', 'picture', 'pictures', 'visual', 'vision',
    'video', 'videos', 'stream', 'streams', 'frame', 'frames', 'text', 'texts', 'tabular', 'table', 'csv', 'file', 'files',
    'real', 'time', 'realtime', 'near', 'fast', 'high', 'low', 'accuracy', 'accurate', 'precision', 'latency', 'speed', 'performance',
    'lightweight', 'small', 'large', 'scale', 'open', 'source', 'public', 'available', 'free', 'commercial', 'safe', 'license', 'licenses', 'licensed', 'permissive',
    'mit', 'apache', 'bsd', 'gpl', 'lgpl', 'agpl', 'cc', 'cc0',
    'gpu', 'gpus', 'vram', 'memory', 'hardware', 'cuda', 'cpu', 'tpu', 'npu', 'edge', 'cloud',
    't4', 'l4', 'a10', 'a10g', 'v100', 'a100', 'h100', 'rtx', 'gtx', 'jetson', 'orin',
    'qlora', 'lora', 'peft', 'fp16', 'bf16', 'fp32', 'int8', 'int4', 'nf4', 'gptq', 'awq', 'gguf', 'onnx', 'tensorrt', 'quantized', 'quantization',
    '2d', '3d', '4d', 'rgb', 'planar', 'volumetric',
    'structured', 'unstructured', 'semi', 'messy', 'noisy', 'clean', 'raw', 'complex', 'simple', 'custom', 'standard',
    'level', 'multi', 'single', 'task', 'domain', 'type', 'input', 'output', 'target', 'label', 'labels', 'labeled', 'annotated',
]);

const SECONDARY_SCHEMA_FIELD_WORDS = new Set([
    'line', 'item', 'items', 'date', 'dates', 'id', 'ids', 'number', 'numbers', 'name', 'names',
    'field', 'fields', 'value', 'values', 'total', 'totals', 'amount', 'amounts', 'code', 'codes', 'record', 'records',
]);

export const DOMAIN_ANCHOR_SYNONYMS: Record<string, string[]> = {
    receipt: ['receipt', 'receipts', 'invoice', 'invoices', 'cord', 'sroie', 'donut', 'layoutlm', 'layoutlmv3', 'docvqa', 'ocr', 'document-parsing', 'expense'],
    invoice: ['invoice', 'invoices', 'receipt', 'receipts', 'fatura', 'rvl-cdip', 'cord', 'sroie', 'donut', 'layoutlm', 'layoutlmv3', 'docvqa', 'ocr', 'billing', 'document'],
    ocr: ['ocr', 'optical-character-recognition', 'receipt', 'invoice', 'scanned', 'document', 'trocr', 'donut', 'layoutlm', 'paddleocr', 'sroie', 'cord', 'docvqa', 'text-recognition'],
    scanned: ['scanned', 'scan', 'ocr', 'receipt', 'invoice', 'document', 'form', 'funsd', 'sroie', 'cord', 'rvl-cdip', 'docvqa', 'layoutlm', 'donut'],
    document: ['document', 'documents', 'docvqa', 'layoutlm', 'donut', 'ocr', 'invoice', 'receipt', 'form', 'funsd', 'rvl-cdip', 'pdf'],
    vendor: ['vendor', 'invoice', 'receipt', 'billing', 'merchant', 'supplier', 'cord', 'sroie'],
    tax: ['tax', 'invoice', 'receipt', 'financial', 'billing', 'accounting'],
    solar: ['solar', 'photovoltaic', 'pv', 'elpv', 'solar-panel', 'solar_panel', 'module'],
    panel: ['panel', 'photovoltaic', 'pv', 'solar', 'surface', 'module'],
    defect: ['defect', 'anomaly', 'crack', 'fault', 'damage', 'corrosion', 'inspection', 'mvtec', 'surface-defect'],
    thermal: ['thermal', 'infrared', 'ir', 'thermography', 'flir'],
    pathology: ['pathology', 'histopathology', 'clinical', 'medical', 'biomedical', 'biomed', 'ehr', 'oncology', 'disease', 'bc5cdr', 'ncbi-disease', 'pubmed'],
    clinical: ['clinical', 'medical', 'biomedical', 'patient', 'healthcare', 'ehr', 'hospital', 'pathology', 'pubmed', 'mimic', 'biobert'],
    ner: ['ner', 'named-entity', 'named entity', 'token-classification', 'entity-extraction', 'entity recognition', 'bc5cdr', 'conll', 'i2b2'],
    notes: ['notes', 'clinical-notes', 'ehr', 'text', 'reports', 'medical-text', 'discharge', 'abstracts'],
    legal: ['legal', 'law', 'contract', 'contracts', 'legislation', 'court', 'statute', 'judicial', 'lexglue', 'eurlex', 'cuad', 'case-law'],
    contract: ['contract', 'contracts', 'legal', 'cuad', 'lexglue', 'ledgar', 'clause', 'clauses'],
    rag: ['rag', 'retrieval', 'question-answering', 'qa', 'passage', 'embedding', 'document-retrieval', 'knowledge-intensive', 'bge'],
    multilingual: ['multilingual', 'cross-lingual', 'multi-language', 'xlm', 'mbert', 'translation'],
    plant: ['plant', 'leaf', 'leaves', 'crop', 'agriculture', 'agricultural', 'plantvillage', 'plantdoc', 'foliar', 'botanical'],
    leaf: ['leaf', 'leaves', 'plant', 'crop', 'plantvillage', 'foliar', 'blight', 'rust', 'mildew'],
    disease: ['disease', 'diseases', 'pathology', 'lesion', 'infection', 'disorder', 'diagnosis'],
    fraud: ['fraud', 'fraudulent', 'credit-card', 'transaction', 'financial', 'banking', 'payment', 'anomaly', 'ieee-cis'],
    credit: ['credit', 'credit-card', 'fraud', 'transaction', 'financial', 'banking', 'payment'],
    alzheimer: ['alzheimer', 'alzheimers', 'dementia', 'mci', 'adni', 'oasis', 'cognitive', 'neurodegenerative', 'brain'],
    cardiac: ['cardiac', 'heart', 'coronary', 'myocardium', 'myocardial', 'aorta', 'aortic', 'cardiovascular', 'acdc', 'asoca', 'ventricle'],
    coronary: ['coronary', 'cardiac', 'heart', 'vessel', 'artery', 'arteries', 'cta', 'ccta', 'asoca', 'stenosis'],
    abdomen: ['abdomen', 'abdominal', 'liver', 'kidney', 'pancreas', 'spleen', 'amos', 'btcv', 'chaos', 'flare', 'multi-organ'],
    abdominal: ['abdominal', 'abdomen', 'liver', 'kidney', 'pancreas', 'spleen', 'amos', 'btcv', 'chaos', 'flare'],
    brain: ['brain', 'cerebral', 'neuro', 'glioma', 'glioblastoma', 'brats', 'intracranial', 'cranial', 'hippocampus', 'meningioma'],
    glioma: ['glioma', 'glioblastoma', 'brain-tumor', 'brain tumor', 'brats', 'lgg', 'hgg', 'neuro-oncology'],
    tumor: ['tumor', 'tumour', 'neoplasm', 'lesion', 'oncology', 'cancer', 'segmentation', 'brats'],
    retina: ['retina', 'retinal', 'retinopathy', 'fundus', 'eyepacs', 'aptos', 'messidor', 'ophthalmology', 'diabetic-retinopathy'],
    retinopathy: ['retinopathy', 'retina', 'retinal', 'fundus', 'eyepacs', 'aptos', 'messidor', 'diabetic'],
    skin: ['skin', 'melanoma', 'dermoscopy', 'dermoscopic', 'isic', 'ham10000', 'dermatology', 'lesion', 'nevus'],
    melanoma: ['melanoma', 'skin-lesion', 'skin cancer', 'isic', 'ham10000', 'dermoscopy', 'dermatology'],
    chest: ['chest', 'thoracic', 'pulmonary', 'lung', 'pneumonia', 'cxr', 'chexpert', 'mimic-cxr', 'radiograph'],
    pneumonia: ['pneumonia', 'chest-xray', 'cxr', 'pulmonary', 'lung', 'chexpert', 'thoracic'],
    nuclei: ['nuclei', 'nuclear', 'cell', 'cellular', 'monuseg', 'pannuke', 'stardist', 'cellpose', 'histology', 'microscopy'],
    emotion: ['emotion', 'emotional', 'affect', 'affective', 'ravdess', 'iemocap', 'tess', 'crema-d', 'sentiment'],
    speech: ['speech', 'audio', 'voice', 'ravdess', 'iemocap', 'wav2vec2', 'hubert', 'whisper', 'acoustic'],
    driver: ['driver', 'driving', 'drowsiness', 'drowsy', 'fatigue', 'yawdd', 'nthu', 'in-cabin'],
    vehicle: ['vehicle', 'vehicles', 'traffic', 'car', 'cars', 'automotive', 'bdd100k', 'kitti', 'nuscenes', 'highway'],
    seizure: ['seizure', 'epilepsy', 'epileptic', 'eeg', 'ieeg', 'chb-mit', 'tusz', 'electroencephalogram'],
    satellite: ['satellite', 'remote-sensing', 'aerial', 'earth-observation', 'sentinel', 'landsat', 'dota', 'bigearthnet', 'eurosat'],
    cryo: ['cryo', 'cryo-et', 'cryo-em', 'subtomogram', 'tomogram', 'electron-tomography', 'macromolecule'],
};

function canonicalizeAnchorToken(token: string): string {
    if (DOMAIN_ANCHOR_SYNONYMS[token]) return token;
    if (token.endsWith('s') && token.length > 4 && DOMAIN_ANCHOR_SYNONYMS[token.slice(0, -1)]) {
        return token.slice(0, -1);
    }
    return token;
}

/**
 * Extracts high-specificity subject/domain anchor tokens from any natural-language problem statement,
 * stripping conversational filler, hardware numbers, and generic ML meta-words, and prioritizing
 * primary domain nouns over secondary output field names.
 */
export function extractAnchorSubjectTerms(rawQuery: string): {
    anchorTerms: string[];
    expandedAnchorGroups: string[][];
    coreSubjectPhrase: string;
} {
    const cleaned = rawQuery
        .toLowerCase()
        .replace(/\b\d+(?:\.\d+)?\s*(?:gb|g|tb|mb|b|m)\b/gi, ' ')
        .replace(/\b(?:rtx|gtx|a100|a10g|a10|v100|t4|l4|h100)\s*\d*\b/gi, ' ')
        .replace(/\b(?:mit|apache(?:[- ]*2(?:\.0)?)?|bsd|cc-by|cc0)\b/gi, ' ')
        .replace(/[^a-z0-9\s-]/g, ' ');

    // Identify tokens appearing inside "from <source>" or "on <source>" prepositional subject clauses
    const sourceClauseTokens = new Set<string>();
    const fromOnMatches = rawQuery.toLowerCase().matchAll(/\b(?:from|on|in|for|of)\s+([a-z0-9\s-]{3,65}?)(?:\.|,|;|\bthat\b|\bwith\b|\busing\b|\band\s+all\b|\bit\s+must\b|$)/gi);
    for (const match of fromOnMatches) {
        const words = (match[1] || '').split(/[^a-z0-9]+/).filter(Boolean);
        for (const w of words) {
            sourceClauseTokens.add(canonicalizeAnchorToken(w));
        }
    }

    const rawTokens = cleaned.split(/\s+/).filter(Boolean);
    const candidateAnchors: string[] = [];

    for (const tok of rawTokens) {
        const bareRaw = tok.replace(/^-+|-+$/g, '');
        if (bareRaw.length < 2) continue;
        if (/^\d+$/.test(bareRaw)) continue;

        const isImportantAcronym = /^(?:ner|rag|ocr|kie|vqa|vlm|eeg|ecg|ekg|ieeg|cta|ccta|cxr|oct|sar|pv|asr|ehr|mci|adni|isic|brats|amos|coco|yolo)$/i.test(bareRaw);
        if (!isImportantAcronym && (bareRaw.length <= 2 || GENERIC_ML_STOPWORDS.has(bareRaw))) {
            continue;
        }

        if (bareRaw.includes('-')) {
            const parts = bareRaw.split('-').filter(p => p.length >= 2 && !GENERIC_ML_STOPWORDS.has(p));
            for (const p of parts) {
                const canon = canonicalizeAnchorToken(p);
                if (!GENERIC_ML_STOPWORDS.has(canon) && !candidateAnchors.includes(canon)) {
                    candidateAnchors.push(canon);
                }
            }
            continue;
        }

        const canon = canonicalizeAnchorToken(bareRaw);
        if (!GENERIC_ML_STOPWORDS.has(canon) && !candidateAnchors.includes(canon)) {
            candidateAnchors.push(canon);
        }
    }

    // Score each candidate anchor by domain specificity so primary domain subjects ("receipt", "invoice", "scanned")
    // take precedence over secondary field names ("line", "items", "dates", "ids") in long multi-sentence prompts.
    const scoredAnchors = candidateAnchors.map((term, idx) => {
        let score = 0;
        if (DOMAIN_ANCHOR_SYNONYMS[term]) score += 10;
        if (sourceClauseTokens.has(term)) score += 5;
        if (SECONDARY_SCHEMA_FIELD_WORDS.has(term)) score -= 6;
        return { term, score, idx };
    });

    const hasHighSpecificityDomainTerms = scoredAnchors.some(a => a.score >= 8);
    const filteredAnchors = hasHighSpecificityDomainTerms
        ? scoredAnchors.filter(a => a.score > 0)
        : scoredAnchors.filter(a => a.score >= -2);

    const finalScored = (filteredAnchors.length > 0 ? filteredAnchors : scoredAnchors)
        .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
        .slice(0, 6);

    const anchorTerms = finalScored.map(a => a.term);

    // Build synonym groups for each extracted anchor term
    const expandedAnchorGroups: string[][] = anchorTerms.map((term) => {
        const syns = DOMAIN_ANCHOR_SYNONYMS[term] || [];
        return Array.from(new Set([term, ...syns]));
    });

    const coreSubjectPhrase = anchorTerms.slice(0, 4).join(' ');

    return {
        anchorTerms,
        expandedAnchorGroups,
        coreSubjectPhrase,
    };
}

// â”€â”€ Master Query Parser (Section 4 & 5) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseResearchQuery(rawQuery: string): ResearchQuerySchema {
    const q = rawQuery.trim();
    const qLower = q.toLowerCase();

    // 1. Primary & Sub-Domain Detection
    let primaryDomain = 'General Machine Learning & AI';
    let subDomain: string[] = ['General Discovery'];

    for (const rule of DOMAIN_RULES) {
        if (rule.test(qLower)) {
            primaryDomain = rule.domain;
            subDomain = rule.subdomains;
            break;
        }
    }

    // 2. Anatomy Extraction (preserving heart, cardiac, aorta, vessels)
    const anatomy: string[] = [];
    const isCardiacQuery = /cardiac|heart|myocard|aort|coronary|cardiovascular/i.test(qLower);

    if (isCardiacQuery) {
        anatomy.push('Heart', 'Cardiac');
        if (/aort/i.test(qLower)) anatomy.push('Aorta', 'Aortic arch', 'Ascending aorta');
        if (/myocard/i.test(qLower)) anatomy.push('Myocardium');
        if (/coronary/i.test(qLower)) anatomy.push('Coronary arteries');
        if (/ventric/i.test(qLower)) anatomy.push('Left ventricle', 'Right ventricle');
        if (!anatomy.includes('Cardiovascular')) anatomy.push('Cardiovascular');
    } else {
        for (const [key, group] of Object.entries(ANATOMY_ONTOLOGY)) {
            const matches = group.terms.some(t => {
                const reg = new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
                return reg.test(qLower);
            });
            if (matches) {
                anatomy.push(group.canonical, ...group.synonyms.slice(0, 3));
                break;
            }
        }
    }


    // 3. Modality & Specialized Techniques
    const modalities: string[] = [];
    const modalitySubtypes: string[] = [];
    const acquisitionTechnique: string[] = [];

    if (/mri|magnetic\s*resonance/i.test(qLower)) {
        modalities.push('MRI');
    }

    if (/4d\s*flow|phase\s*contrast|pc.?mri/i.test(qLower)) {
        if (!modalities.includes('MRI')) modalities.push('MRI');
        modalitySubtypes.push('4D Flow MRI', '4D phase-contrast MRI', '4D PC-MRI');
        acquisitionTechnique.push('Phase-contrast velocity encoding', 'Time-resolved 3D phase-contrast');
    }

    if (/dce|dynamic\s*contrast/i.test(qLower)) {
        if (!modalities.includes('MRI')) modalities.push('MRI');
        modalitySubtypes.push('DCE-MRI', 'Dynamic contrast enhanced MRI');
    }

    if (/\bcta\b|coronary\s*cta|\bct\b|computed\s*tomography/i.test(qLower) && !/pc.?mri/i.test(qLower)) {
        modalities.push('CT');
        if (/\bcta\b/i.test(qLower)) modalitySubtypes.push('CTA', 'Computed Tomography Angiography');
    }

    if (/x.?ray|radiograph|cxr/i.test(qLower)) {
        modalities.push('X-ray');
    }
    if (/ultrasound|echocardio/i.test(qLower)) {
        modalities.push('Ultrasound');
    }
    if (/pet\b|pet\s*scan/i.test(qLower)) {
        modalities.push('PET');
    }
    if (/cryo[- ]?e[mt]|electron\s*tomograph/i.test(qLower)) {
        modalities.push('Cryo-EM/ET');
    }
    if (/microscop|fluorescence|histolog/i.test(qLower)) {
        modalities.push('Microscopy');
    }
    if (/tabular|csv|clinical\s*records|cognitive\s*scores|clinical\s*data|demographic|biomarker|apoe|genetic/i.test(qLower)) {
        if (!modalities.includes('Tabular')) modalities.push('Tabular');
    }
    if (/video|cctv|camera\s*stream|stream/i.test(qLower)) {
        modalities.push('Video');
    }
    if (/satellite|multispectral|hyperspectral|remote\s*sensing/i.test(qLower)) {
        modalities.push('Satellite / Multispectral');
    }
    if (/2d\s*rgb|\brgb\b/i.test(qLower)) {
        modalities.push('2D RGB');
    }
    if (/text|multilingual|\bnlp\b|language|sentences?|documents?|tickets?|\bner\b|named\s*entity|notes?|\brag\b|\bcontract\b|\blegal\b/i.test(qLower)) {
        modalities.push('Text / Multilingual');
    }
    if (/thermal|infrared|electroluminescen/i.test(qLower)) {
        modalities.push('Image / Thermal');
    }
    if (/retin|fundus|photo|dermoscop|image|camera|picture|cats?\s*and\s*dogs|vehicle|solar\s*panel|plant|leaf|leaves|defect|surface|receipts?|invoices?|\bocr\b|scanned/i.test(qLower) && !modalities.includes('Microscopy') && !modalities.includes('Image') && !modalities.includes('Image / Thermal') && !modalities.includes('MRI') && !modalities.includes('CT') && !modalities.includes('X-ray') && !modalities.includes('2D RGB') && !modalities.includes('Satellite / Multispectral')) {
        modalities.push('Image');
    }
    if (/\baudio\b|\bspeech\b|\bvoice\b|\bwav\b|\bacoustic\b/i.test(qLower)) {
        modalities.push('Audio');
    }

    if (modalities.length === 0) {
        modalities.push('Multimodal / General');
    }

    // 4. Sampling Strategy
    const samplingStrategy: string[] = [];
    if (/radial\s*undersampling|radial/i.test(qLower)) {
        samplingStrategy.push('Radial undersampling', 'Radial k-space trajectory', 'Non-Cartesian acquisition');
        acquisitionTechnique.push('Radial k-space sampling', 'Golden-angle radial trajectory');
    }
    if (/sparse\s*k-space|sparse\s*sampling|sparse/i.test(qLower)) {
        samplingStrategy.push('Sparse sampling', 'Sparse k-space', 'Accelerated acquisition', 'Sub-Nyquist sampling');
    }
    if (/compressed\s*sensing/i.test(qLower)) {
        samplingStrategy.push('Compressed sensing');
    }

    // 5. Reconstruction, Prediction, and Estimation Tasks (Multi-Task Extraction)
    const reconstructionTasks: string[] = [];
    const predictionTasks: string[] = [];
    const estimationTasks: string[] = [];

    if (/velocity\s*(?:field\s*)?reconstruction/i.test(qLower)) {
        reconstructionTasks.push(
            'Velocity-field reconstruction',
            '3-directional velocity reconstruction',
            'Velocity reconstruction from undersampled k-space',
            'MRI reconstruction'
        );
    } else if (/k-space\s*reconstruction|mri\s*reconstruction|image\s*reconstruction|reconstruct/i.test(qLower)) {
        reconstructionTasks.push('MRI reconstruction', 'k-space reconstruction', 'Accelerated image reconstruction');
    }

    if (/wall\s*shear\s*stress|wss|shear\s*stress\s*estimation|hemodynamic.*estimation/i.test(qLower)) {
        estimationTasks.push(
            'Wall shear stress estimation',
            'Hemodynamic estimation',
            'Velocity gradient estimation',
            'Vascular shear stress mapping'
        );
    }
    if (/flow\s*quantification|flow\s*estimation/i.test(qLower)) {
        estimationTasks.push('Flow quantification', 'Hemodynamic parameter estimation');
    }

    if (/regression|yield/i.test(qLower)) {
        predictionTasks.push('Regression');
    }
    if (/progression|time\s*to\s*progression|predict\s*progression|conversion/i.test(qLower)) {
        predictionTasks.push('Progression Prediction', 'Time-to-Event Modeling');
    }
    if (/instance\s*segmentation/i.test(qLower)) {
        predictionTasks.push('Instance Segmentation');
    } else if (/segment/i.test(qLower)) {
        predictionTasks.push('Segmentation');
    }
    if (/object\s*detection|bounding\s*box|yolo/i.test(qLower) || (/\bdetect/i.test(qLower) && !/fraud|anomaly|seizure|arrhythmia|pneumonia|disease|cancer|alzheimer|tabular/i.test(qLower))) {
        predictionTasks.push('Object Detection');
    }
    if (/classif|diagnos|early\s*detection|disease\s*detection|emotion\s*recognition|speech\s*emotion/i.test(qLower)) {
        predictionTasks.push('Classification');
    }
    if (/named\s*entity\s*recognition|\bner\b|token\s*classification|entity\s*extraction/i.test(qLower)) {
        predictionTasks.push('Named Entity Recognition (NER)');
    }
    if (/\breceipts?\b|\binvoices?\b|\bocr\b|optical\s*character|key\s*information\s*extraction|\bkie\b|document\s*(?:parsing|extraction|understanding)|line\s*items?/i.test(qLower)) {
        predictionTasks.push('Document OCR & Key Information Extraction (KIE)');
    }
    if (/\brag\b|retrieval|document\s*retrieval|question\s*answering|\bqa\b/i.test(qLower)) {
        predictionTasks.push('Information Retrieval / RAG');
    }
    if (/summariz/i.test(qLower)) {
        predictionTasks.push('Summarization');
    }
    if (/priority|triage|ranking/i.test(qLower)) {
        predictionTasks.push('Priority Classification / Triage');
    }
    if (/anomaly|fraud/i.test(qLower)) {
        predictionTasks.push('Anomaly Detection', 'Imbalanced Classification');
    }

    // 6. Generic Target Entities & Outputs (Clean Anchor Subject Extraction)
    const physiologicalTargets: string[] = [];
    const targetEntities: string[] = [];
    const targetOutputs: string[] = [];

    const { anchorTerms, coreSubjectPhrase } = extractAnchorSubjectTerms(q);
    if (coreSubjectPhrase) {
        targetEntities.push(coreSubjectPhrase);
    }
    for (const term of anchorTerms) {
        if (!targetEntities.includes(term)) {
            targetEntities.push(term);
        }
    }

    // 7. Temporal & Dimensionality Constraints
    const isExplicit3D = /\b(?:3d|3-d|volumetric|voxel|ct\b|mri\b|cbct|nifti|\.nii)\b/i.test(qLower);
    const isExplicit2D = /\b(?:2d|2-d|planar|rgb|photograph|photo|fundus|retinopath|x[- ]?ray|chest\s*xr|microscop|dermoscop|skin\s*lesion|satellite)\b/i.test(qLower);
    const isSpatiotemporal4D = /\b(?:4d|4-d|spatiotemporal|time[- ]resolved\s*3d|4d\s*flow)\b/i.test(qLower) || (isExplicit3D && /longitudinal|multi[- ]timepoint/i.test(qLower));

    const dimensionality: string[] = [];
    if (isSpatiotemporal4D) {
        dimensionality.push('4D (3D spatial + 1D temporal)', 'Longitudinal Volumetric');
    } else if (isExplicit3D && !isExplicit2D) {
        dimensionality.push('3D volumetric');
    } else if (isExplicit2D) {
        dimensionality.push('2D planar');
    } else {
        dimensionality.push('2D planar');
    }

    const temporalRequirement: string[] = [];
    if (/real-time|real\s*time|near-real-time|low-latency/i.test(qLower)) {
        temporalRequirement.push('Real-time inference / reconstruction', 'Near-real-time latency', 'High FPS throughput');
    }

    // 8. Required vs Preferred Characteristics
    const requiredCharacteristics: string[] = [];
    const preferredCharacteristics: string[] = [];

    if (anatomy.length > 0) requiredCharacteristics.push(`${anatomy[0]} anatomy`);
    if (modalities.length > 0) requiredCharacteristics.push(`${modalities[0]} modality`);
    if (modalitySubtypes.length > 0) requiredCharacteristics.push(modalitySubtypes[0]);
    if (reconstructionTasks.length > 0) requiredCharacteristics.push(reconstructionTasks[0]);
    if (predictionTasks.length > 0) requiredCharacteristics.push(predictionTasks[0]);
    if (physiologicalTargets.length > 0) requiredCharacteristics.push(physiologicalTargets[0]);

    if (samplingStrategy.length > 0) preferredCharacteristics.push(...samplingStrategy);
    if (temporalRequirement.length > 0) preferredCharacteristics.push(...temporalRequirement);
    if (targetOutputs.length > 0) preferredCharacteristics.push(...targetOutputs);

    // 9. Excluded Domains, Anatomy, Tasks (Dynamic Negative Detection)
    const negatives = getDynamicNegativeConcepts(q);
    const excludedDomains = negatives.excludedDomains;
    const excludedAnatomy = negatives.excludedAnatomy;
    const excludedTasks = negatives.excludedTasks;

    // 10. Synonyms & Concept Graph Expansion
    const synonyms: Record<string, string[]> = {
        ...DOMAIN_ANCHOR_SYNONYMS,
        '4D Flow MRI': ['4D phase-contrast MRI', '4D PC-MRI', 'phase-contrast velocity MRI', '4D flow MR'],
        'sparse k-space': ['radial undersampling', 'accelerated MRI', 'sub-Nyquist sampling', 'compressed sensing'],
        'velocity field': ['3D velocity vectors', 'blood flow velocity', 'velocity encoding', 'vector field'],
        'wall shear stress': ['WSS', 'hemodynamic shear stress', 'endothelial wall shear', 'shear stress estimation'],
        'cardiac': ['heart', 'cardiovascular', 'myocardium', 'aorta', 'aortic flow'],
        'alzheimer': ['dementia', 'mci', 'adni', 'oasis', 'cognitive decline', 'apoe'],
        'diabetic retinopathy': ['retinal fundus', 'retinopathy', 'eyepacs', 'messidor'],
        'vehicle': ['car', 'traffic', 'automobile', 'yolov8-seg'],
        'cats and dogs': ['pets', 'animals', 'oxford-iiit pet', 'feline', 'canine'],
    };

    // 11. Tiered Query Generation (Dynamic)
    const datasetQueries: string[] = [];
    const modelQueries: string[] = [];
    const paperQueries: string[] = [];
    const benchmarkQueries: string[] = [];

    if (isCardiacQuery && /4d\s*flow/i.test(qLower)) {
        datasetQueries.push('4D flow cardiac MRI', '4D phase contrast MRI velocity', 'cardiac 4D flow MRI dataset', 'aortic 4D flow MRI');
        modelQueries.push('4D flow MRI reconstruction', 'phase contrast MRI reconstruction', 'cardiac MRI k-space reconstruction');
        paperQueries.push('4D flow cardiac MRI velocity reconstruction', 'wall shear stress 4D flow MRI');
        benchmarkQueries.push('4D flow MRI challenge', 'cardiac MRI reconstruction benchmark');
    } else if (/alzheimer|dementia|mci|adni|oasis/i.test(qLower)) {
        datasetQueries.push('Alzheimer MRI', 'ADNI brain MRI', 'Alzheimer longitudinal MRI', 'OASIS brain MRI', 'Alzheimer disease dataset');
        modelQueries.push('Alzheimer MRI model', '3D brain MRI transformer', 'Alzheimer progression prediction', 'medical vision transformer 3D');
        paperQueries.push('longitudinal Alzheimer MRI progression deep learning', 'multimodal Alzheimer disease prediction MRI clinical', 'missing modality medical deep learning Alzheimer');
        benchmarkQueries.push('ADNI', 'OASIS-3 Alzheimer', 'Alzheimer benchmark');
    } else if (/retinopath|retina|fundus/i.test(qLower)) {
        datasetQueries.push('diabetic retinopathy', 'retinal fundus dataset', 'EyePACS diabetic retinopathy', 'diabetic retinopathy image dataset');
        modelQueries.push('diabetic retinopathy classification model', 'retinal fundus vision model', 'BiomedCLIP');
        paperQueries.push('diabetic retinopathy fundus deep learning classification', 'retinal image classification transformers');
        benchmarkQueries.push('EyePACS', 'MESSIDOR', 'DRIVE retina challenge');
    } else if (/vehicle|traffic|car\b/i.test(qLower)) {
        datasetQueries.push('vehicle instance segmentation dataset', 'traffic vehicle detection dataset', 'car segmentation images');
        modelQueries.push('yolov8 instance segmentation', 'yolov8 vehicle', 'yolov8-seg');
        paperQueries.push('YOLOv8 real time instance segmentation vehicles', 'deep learning vehicle detection surveillance');
        benchmarkQueries.push('COCO vehicle', 'BDD100K traffic dataset', 'vehicle detection benchmark');
    } else if (/cats?\s*and\s*dogs?|pet\b/i.test(qLower)) {
        datasetQueries.push('cats and dogs dataset', 'oxford iiit pet', 'cat dog image classification');
        modelQueries.push('vision transformer image classification', 'resnet cats and dogs', 'convnext image classification');
        paperQueries.push('fine grained pet classification deep learning', 'deep learning image classification transfer learning');
        benchmarkQueries.push('Oxford IIIT Pet', 'ImageNet pet classes');
    } else if (/nuclei|monuseg|stardist/i.test(qLower)) {
        datasetQueries.push('MoNuSeg nuclei dataset', 'cell nuclei segmentation microscopy', 'fluorescence microscopy nuclei dataset');
        modelQueries.push('StarDist nuclei segmentation', 'cellpose microscopy', 'U-Net nuclei segmentation');
        paperQueries.push('star convex nuclei segmentation fluorescence microscopy', 'few shot nuclei segmentation deep learning');
        benchmarkQueries.push('MoNuSeg challenge', 'CoNSeP benchmark');
    } else if (/crop|plant|leaf|leaves|plantvillage/i.test(qLower)) {
        datasetQueries.push('plant leaf disease dataset', 'crop disease classification', 'PlantVillage');
        modelQueries.push('plant disease classification', 'leaf disease ViT');
        paperQueries.push('deep learning plant leaf disease classification', 'plant pathology image classification');
        benchmarkQueries.push('PlantVillage', 'PlantDoc');
    } else if (/(?:clinical|pathology|medical|biomedical)\s*(?:ner\b|notes?|text|nlp)|(?:\bner\b.*(?:clinical|pathology|medical))/i.test(qLower)) {
        datasetQueries.push('clinical NER', 'biomedical NER dataset', 'BC5CDR', 'NCBI disease');
        modelQueries.push('biomedical NER', 'PubMedBERT', 'BioBERT NER', 'clinical NER');
        paperQueries.push('clinical named entity recognition pathology notes', 'BioBERT biomedical text mining');
        benchmarkQueries.push('BC5CDR', 'BLURB biomedical NLP');
    } else if (/solar\s*panel|photovoltaic|\bpv\b.*defect/i.test(qLower)) {
        datasetQueries.push('solar panel defect', 'photovoltaic defect dataset', 'ELPV solar', 'thermal solar panel');
        modelQueries.push('solar panel defect detection', 'yolov8 defect detection', 'surface anomaly detection');
        paperQueries.push('solar panel defect detection thermal electroluminescence deep learning');
        benchmarkQueries.push('ELPV solar benchmark', 'MVTec anomaly detection');
    } else if (/\blegal\b.*\brag\b|\blegal\b.*(?:nlp|multilingual|retrieval|document)/i.test(qLower)) {
        datasetQueries.push('legal NLP', 'LexGLUE', 'MultiEURLEX', 'legal contract dataset');
        modelQueries.push('legal-bert', 'bge-m3', 'multilingual embedding');
        paperQueries.push('multilingual legal retrieval augmented generation NLP', 'LexGLUE legal language understanding');
        benchmarkQueries.push('LexGLUE', 'MultiEURLEX');
    } else {
        const primaryAnatomy = anatomy.find(a => !a.includes('_') && a !== a.toUpperCase()) || anatomy[1] || anatomy[0];
        const primaryTarget = coreSubjectPhrase || primaryAnatomy || anchorTerms.slice(0, 3).join(' ') || q.split(/\s+/).slice(0, 3).join(' ');
        const primaryMod = modalities[0] && modalities[0] !== 'Multimodal / General' && modalities[0] !== 'Image' ? modalities[0] : '';
        const primaryTsk = (reconstructionTasks[0] || predictionTasks[0] || estimationTasks[0] || '').split(' ')[0];
        datasetQueries.push(
            `${primaryTarget} ${primaryTsk}`.trim(),
            `${primaryTarget} ${primaryMod}`.trim(),
            primaryTarget.trim()
        );
        modelQueries.push(`${primaryTarget} ${primaryTsk}`.trim(), primaryTarget.trim());
        paperQueries.push(`${primaryTarget} ${primaryTsk} deep learning`.trim(), `${primaryTarget} machine learning`.trim());
        benchmarkQueries.push(`${primaryTarget} benchmark`.trim());
    }

    const ontologyTerms: string[] = [];
    if (isCardiacQuery) {
        ontologyTerms.push('UMLS:C0018787 (Heart)', 'NCIT:C16809 (Magnetic Resonance Imaging)', 'FMA:7088 (Heart)', 'MESH:D054060 (Hemodynamics)');
    } else if (/alzheimer|dementia/i.test(qLower)) {
        ontologyTerms.push('UMLS:C0002395 (Alzheimer Disease)', 'NCIT:C2866 (Alzheimer Disease)', 'MESH:D000544 (Alzheimer Disease)', 'FMA:50801 (Brain)');
    } else if (/retinopath/i.test(qLower)) {
        ontologyTerms.push('UMLS:C0011884 (Diabetic Retinopathy)', 'MESH:D003930 (Diabetic Retinopathy)', 'FMA:58238 (Retina)');
    }

    const confidence = 92;
    const object = targetEntities[0] || anatomy[0] || undefined;
    const labels = /label|classif|healthy|diseased/i.test(qLower) ? ['user-specified labels'] : undefined;
    const preferredSources = /kaggle/i.test(qLower) || /hugging\s*face/i.test(qLower)
        ? ['kaggle', 'huggingface']
        : undefined;
    const negativeConstraints = excludedDomains.length > 0 || excludedAnatomy.length > 0
        ? [...excludedDomains, ...excludedAnatomy]
        : undefined;

    const tasksList = [...reconstructionTasks, ...estimationTasks, ...predictionTasks];
    const vramMatch = q.match(/\b(\d+)\s*(?:gb|g)(?:\s*(?:gpu|vram))?\b/i);
    const maxVramGb = vramMatch ? parseInt(vramMatch[1], 10) : 'UNKNOWN';

    return {
        // --- ProblemProfile Fields ---
        rawQuery: q,
        domain: primaryDomain,
        subdomain: subDomain[0] || 'UNKNOWN',
        tasks: tasksList, // The list of all extracted tasks
        modalities,
        dimensionality: dimensionality[0] || 'UNKNOWN',
        entities: targetEntities,
        hardwareConstraints: {
            maxVramGb,
            requiresEdge: /edge|mobile|jetson/i.test(q) ? true : 'UNKNOWN',
            gpuTarget: 'UNKNOWN',
        },
        datasetRequirements: {
            minimumSize: 'UNKNOWN',
            temporalOrLongitudinal: /longitudinal|temporal|time.series/i.test(q) ? true : 'UNKNOWN',
            labelType: 'UNKNOWN',
        },
        unspecifiedFields: [],

        // --- Legacy Mappings ---
        originalQuery: q,
        primaryDomain,
        subDomain,
        anatomy,
        targetEntities,
        modalitySubtypes,
        acquisitionTechnique,
        reconstructionTasks,
        predictionTasks,
        estimationTasks,
        physiologicalTargets,
        samplingStrategy,
        temporalRequirement,
        targetOutputs,
        requiredCharacteristics,
        preferredCharacteristics,
        excludedDomains,
        excludedAnatomy,
        excludedTasks,
        synonyms,
        datasetQueries,
        modelQueries,
        paperQueries,
        benchmarkQueries,
        ontologyTerms,
        confidence,
        object,
        labels,
        preferredSources,
        negativeConstraints,
        
        task: tasksList[0] || 'discovery',
        taskVariants: tasksList,
        modality: modalities,
        sequence: modalitySubtypes,
        target: targetEntities,
        annotation: targetOutputs,
        pretrainedModelRequired: true,
        datasetRequired: true,
        paperRequired: true,
        constraints: {
            mustMatchAnatomy: anatomy.length > 0,
            mustMatchModality: modalities.length > 0 && modalities[0] !== 'Multimodal / General',
            mustMatchTask: tasksList.length > 0,
            prefer3D: dimensionality.some(d => d.includes('3D') || d.includes('4D')),
        },
        positiveEntities: [...anatomy, ...modalities, ...modalitySubtypes, ...physiologicalTargets],
        negativeEntities: excludedAnatomy,
        requiredConstraints: requiredCharacteristics,
        preferredConstraints: preferredCharacteristics,
        softPreferences: ['Open access license', 'Verified public repository'],
        specificEntityMentioned: null,
        parseConfidence: confidence,
        parseLog: [
            `Parsed query into primary domain: ${primaryDomain}`,
            `Anatomy detected: [${anatomy.join(', ')}]`,
            `Modalities detected: [${modalities.join(', ')}]`,
            `Tasks: [${tasksList.join(', ')}]`,
        ],
    };
}

export function understandQuery(rawQuery: string): StructuredQueryUnderstanding {
    return parseResearchQuery(rawQuery);
}
