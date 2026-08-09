import { NextResponse } from 'next/server';

type SearchPayload = {
    query?: string;
};

type ProjectAnalysis = {
    project_title: string;
    domain: string;
    task: string;
    secondary_task?: string;
    data_type: string;
    output?: string;
    detectionRequired?: boolean;
    segmentationRequired?: boolean;
    classificationType?: 'binary' | 'multi-class' | 'unknown';
    targetClasses?: string[];
    keywords: string[];
    models: string[];
    requiredClasses?: string[];
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;

const stopWords = new Set([
    'want', 'need', 'build', 'system', 'that', 'this', 'can', 'the', 'is', 'i', 'my', 'from', 'using', 'use', 'with', 'for', 'and', 'or', 'of', 'a', 'an', 'to', 'in', 'on', 'by', 'as', 'it', 'its', 'your', 'we', 'will', 'project', 'goal', 'dataset', 'data', 'model', 'models', 'ai', 'ml', 'deep', 'learning', 'help', 'helping', 'able', 'make', 'find'
]);

function buildGeminiPrompt(query: string) {
    return `You are an AI/ML project analysis engine.
Analyze the user's project idea and extract structured information.
Return ONLY valid JSON.
Do not return Markdown.
Do not return explanations.
Do not return \`\`\`json fences.

Required JSON structure:
{
  "project_title": string,
  "domain": string,
  "task": string,
  "secondary_task": string,
  "data_type": string,
  "keywords": string[],
  "models": string[]
}

Generate 5-8 concise semantic search keywords.
The keywords must be suitable for searching machine-learning datasets and models.
Never use generic words such as want, need, build, system, that, this, can, the, is, I.
Never generate keywords by splitting the user's sentence.
User project idea:
${query}`;
}

function stripCodeFence(text: string) {
    return text.replace(/```json|```/g, '').trim();
}

function extractJsonBlock(text: string) {
    const cleaned = stripCodeFence(text);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
        return null;
    }

    return cleaned.slice(start, end + 1);
}

function parseStringList(value: unknown) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(/[\n,;]+/)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
}

function parseGeminiResponse(text: string): ProjectAnalysis | null {
    const jsonBlock = extractJsonBlock(text);
    if (!jsonBlock) {
        console.error('parseGeminiResponse failed: no JSON block found', { text });
        return null;
    }

    try {
        const parsed = JSON.parse(jsonBlock) as Partial<ProjectAnalysis>;

        if (!parsed.project_title || !parsed.domain || !parsed.task || !parsed.data_type || !parsed.keywords || !parsed.models) {
            console.error('parseGeminiResponse failed: missing required fields', { parsed });
            return null;
        }

        return {
            project_title: String(parsed.project_title).trim(),
            domain: String(parsed.domain).trim(),
            task: String(parsed.task).trim(),
            secondary_task: parsed.secondary_task ? String(parsed.secondary_task).trim() : undefined,
            data_type: String(parsed.data_type).trim(),
            keywords: parseStringList(parsed.keywords).slice(0, 8),
            models: parseStringList(parsed.models).slice(0, 8),
            requiredClasses: parseStringList(parsed.requiredClasses).slice(0, 8),
        };
    } catch (error) {
        console.error('parseGeminiResponse failed JSON parse', { jsonBlock, error });
        return null;
    }
}

function phraseTokens(text: string) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2 && !stopWords.has(token));
}

function buildFallbackKeywords(query: string) {
    const unique = new Set<string>();

    if (/(brain tumor|tumor|glioma|meningioma|pituitary)/i.test(query) && /mri/i.test(query)) {
        unique.add('brain tumor MRI');
        unique.add('brain MRI');
        unique.add('brain tumor classification');
        unique.add('medical image classification');
        unique.add('tumor segmentation MRI');
        unique.add('glioma MRI');
        unique.add('meningioma MRI');
        unique.add('pituitary tumor MRI');
    }

    if (unique.size === 0 && /mri|ct|x-?ray|medical|tumor|brain/i.test(query)) {
        if (/tumor/i.test(query)) {
            unique.add('medical image classification');
            unique.add('medical imaging');
            unique.add('tumor detection MRI');
            unique.add('tumor segmentation MRI');
        }

        if (/mri/i.test(query)) {
            unique.add('MRI images');
            unique.add('medical imaging');
        }
    }

    if (unique.size === 0) {
        const tokens = phraseTokens(query);
        for (let i = 0; i < tokens.length && unique.size < 6; i += 1) {
            unique.add(tokens[i]);
        }

        for (let i = 0; i < tokens.length - 1 && unique.size < 8; i += 1) {
            unique.add(`${tokens[i]} ${tokens[i + 1]}`);
        }
    }

    return Array.from(unique).slice(0, 8);
}

function buildDomain(query: string) {
    if (/(mri|ct|x-?ray|medical|radiology|tumor|brain|cancer|healthcare|biomedical)/i.test(query)) {
        return 'Medical Imaging';
    }

    if (/(image|vision|visual|camera|segmentation|detection|object detection)/i.test(query)) {
        return 'Computer Vision';
    }

    if (/(text|language|nlp|chatbot|conversation|translation|sentiment|question answering)/i.test(query)) {
        return 'Natural Language Processing';
    }

    if (/(audio|speech|sound|voice|wav|mp3|spectrogram)/i.test(query)) {
        return 'Speech and Audio';
    }

    return 'Machine Learning';
}

function buildDataType(query: string) {
    if (/mri/i.test(query)) {
        return 'MRI Images';
    }

    if (/ct/i.test(query)) {
        return 'CT Images';
    }

    if (/x-?ray/i.test(query)) {
        return 'X-ray Images';
    }

    if (/(image|vision|photo|visual)/i.test(query)) {
        return 'Images';
    }

    if (/(text|language|nlp|chat|sentence)/i.test(query)) {
        return 'Text';
    }

    if (/(audio|speech|voice|sound)/i.test(query)) {
        return 'Audio';
    }

    return 'Structured data';
}

function buildTask(query: string) {
    const hasClassification = /classif|classify|classification|diagnos|diagnose|tumor type|tumor subtype|tumor grade/i.test(query);
    const hasDetection = /detect|detection|object detection|localiz|localization|localisation|bbox|bounding box|bounding boxes/i.test(query);
    const hasSegmentation = /segment|segmentation|mask|masks|pixel-wise|pixelwise/i.test(query);
    const hasBinary = /(binary|tumor v?s? no tumor|tumor presence|present|absent|yes\/no|healthy|normal)/i.test(query);
    const hasMultiClass = /(multi-?class|type|subtype|grade|glioma|meningioma|pituitary|glioblastoma|schwannoma|metastatic)/i.test(query);

    if (hasSegmentation && !hasDetection && !hasClassification) {
        return {
            primary: 'Tumor Segmentation',
            secondary: undefined,
            output: 'Tumor mask',
            detectionRequired: false,
            segmentationRequired: true,
            classificationType: 'unknown',
        };
    }

    if (hasDetection && !hasSegmentation && !hasClassification) {
        return {
            primary: 'Tumor Detection/Localization',
            secondary: undefined,
            output: 'Tumor bounding box / location',
            detectionRequired: true,
            segmentationRequired: false,
            classificationType: 'unknown',
        };
    }

    if (hasClassification) {
        return {
            primary: 'MRI Classification',
            secondary: hasDetection ? 'Tumor Detection/Localization' : hasSegmentation ? 'Tumor Segmentation' : undefined,
            output: hasBinary ? 'Tumor presence / absence' : hasMultiClass ? 'Tumor type / subtype' : 'Tumor class',
            detectionRequired: hasDetection,
            segmentationRequired: hasSegmentation,
            classificationType: hasBinary ? 'binary' : hasMultiClass ? 'multi-class' : 'unknown',
        };
    }

    if (hasSegmentation) {
        return {
            primary: 'Tumor Segmentation',
            secondary: undefined,
            output: 'Tumor mask',
            detectionRequired: false,
            segmentationRequired: true,
            classificationType: 'unknown',
        };
    }

    if (hasDetection) {
        return {
            primary: 'Tumor Detection/Localization',
            secondary: undefined,
            output: 'Tumor bounding box / location',
            detectionRequired: true,
            segmentationRequired: false,
            classificationType: 'unknown',
        };
    }

    if (/(anomaly|abnormal|outlier)/i.test(query)) {
        return {
            primary: 'Anomaly Detection',
            secondary: undefined,
            output: 'Anomaly score',
            detectionRequired: false,
            segmentationRequired: false,
            classificationType: 'unknown',
        };
    }

    if (/(text|language|nlp|chat|sentiment|translation)/i.test(query)) {
        return {
            primary: 'Text Classification',
            secondary: undefined,
            output: 'Text label',
            detectionRequired: false,
            segmentationRequired: false,
            classificationType: 'unknown',
        };
    }

    return {
        primary: 'MRI Classification',
        secondary: undefined,
        output: 'Tumor class',
        detectionRequired: false,
        segmentationRequired: false,
        classificationType: 'unknown',
    };
}

function buildModels(query: string) {
    if (/(mri|ct|x-?ray|medical|radiology|tumor|brain|cancer)/i.test(query)) {
        return ['CNN', 'ResNet', 'EfficientNet', 'Vision Transformer', 'U-Net'];
    }

    if (/(text|language|nlp|chatbot|translation|sentiment|question answering)/i.test(query)) {
        return ['BERT', 'T5', 'LLaMA', 'GPT', 'Transformer'];
    }

    if (/(audio|speech|voice|sound)/i.test(query)) {
        return ['Wav2Vec', 'Whisper', 'Conformer', 'CNN', 'Transformer'];
    }

    if (/(image|vision|image classification|object detection|segmentation)/i.test(query)) {
        return ['CNN', 'ResNet', 'EfficientNet', 'Vision Transformer', 'U-Net'];
    }

    return ['Transformer', 'XGBoost', 'Random Forest'];
}

function buildTitle(query: string, task: { primary: string; secondary?: string }) {
    const trimmed = query.trim();

    if (/(brain tumor|tumor)/i.test(trimmed) && /mri/i.test(trimmed)) {
        return 'Brain Tumor Detection and Classification from MRI';
    }

    const match = trimmed.match(/(?:detect|classify|segment|identify|recognize|find|predict)\s+([\w\s\/-]+?)(?:\s+from|\s+using|\s+with|\.|$)/i);
    if (match && match[1]) {
        const phrase = match[1].trim().replace(/\s+/g, ' ');
        return `${phrase.charAt(0).toUpperCase() + phrase.slice(1)} ${task.primary}`.replace(/\s+/g, ' ').trim();
    }

    if (/(tumor|brain|medical imaging)/i.test(trimmed)) {
        return `${task.primary} for Medical Imaging`;
    }

    return `${task.primary} Project`;
}

function inferProjectClasses(query: string) {
    const classes = new Set<string>();
    if (/(no tumor|no tumour|normal|healthy)/i.test(query)) classes.add('No Tumor');
    if (/glioma/i.test(query)) classes.add('Glioma');
    if (/meningioma/i.test(query)) classes.add('Meningioma');
    if (/pituitary/i.test(query)) classes.add('Pituitary Tumor');
    if (/metastatic/i.test(query)) classes.add('Metastatic Tumor');
    if (/glioblastoma/i.test(query)) classes.add('Glioblastoma');
    if (/schwannoma/i.test(query)) classes.add('Schwannoma');
    if (classes.size === 0 && /tumor/i.test(query)) {
        classes.add('Tumor');
        if (/no tumor|no tumour|healthy|normal/i.test(query)) classes.add('No Tumor');
    }
    return Array.from(classes);
}

function buildFallbackAnalysis(query: string): ProjectAnalysis {
    const task = buildTask(query);
    return {
        project_title: buildTitle(query, task),
        domain: buildDomain(query),
        task: task.primary,
        secondary_task: task.secondary,
        data_type: buildDataType(query),
        output: task.output,
        detectionRequired: task.detectionRequired,
        segmentationRequired: task.segmentationRequired,
        classificationType: task.classificationType,
        targetClasses: inferProjectClasses(query),
        keywords: buildFallbackKeywords(query),
        models: buildModels(query),
        requiredClasses: inferProjectClasses(query),
    };
}

function normalizeJsonLikeBody(rawBody: string) {
    const hasQuotes = rawBody.includes('"');
    if (hasQuotes) {
        return rawBody;
    }

    return rawBody
        .trim()
        .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
        .replace(/:\s*([A-Za-z0-9_]+)\s*([,}])/g, ': "$1"$2');
}

function parseSearchPayload(rawBody: string): SearchPayload | null {
    if (!rawBody) {
        return null;
    }

    try {
        return JSON.parse(rawBody) as SearchPayload;
    } catch {
        try {
            const normalized = normalizeJsonLikeBody(rawBody);
            return JSON.parse(normalized) as SearchPayload;
        } catch (error) {
            console.error('parseSearchPayload failed:', error, { rawBody });
            return null;
        }
    }
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'AI Dataset Explorer',
            Accept: 'application/json',
            ...headers,
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        return [];
    }

    try {
        return await response.json();
    } catch (error) {
        console.error('Failed to parse JSON from', url, error);
        return [];
    }
}

async function fetchGeminiAnalysis(query: string): Promise<ProjectAnalysis | null> {
    if (!GEMINI_API_KEY) {
        return null;
    }

    try {
        const prompt = buildGeminiPrompt(query);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                temperature: 0,
                maxOutputTokens: 512,
                candidateCount: 1,
                contents: [{ parts: [{ text: prompt }] }],
            }),
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.[0]?.text || '';
        if (!text) {
            return null;
        }

        return parseGeminiResponse(text);
    } catch (error) {
        console.error('Gemini request failed:', error);
        return null;
    }
}

async function searchHuggingFace(keywords: string[]) {
    const search = encodeURIComponent(keywords.slice(0, 2).join(' '));
    const headers: Record<string, string> = {};

    if (HUGGING_FACE_TOKEN) {
        headers.Authorization = `Bearer ${HUGGING_FACE_TOKEN}`;
    }

    try {
        const [hfDatasetsRaw, hfModelsRaw] = await Promise.all([
            fetchJson(`https://huggingface.co/api/datasets?search=${search}&limit=6`, headers),
            fetchJson(`https://huggingface.co/api/models?search=${search}&limit=6`, headers),
        ]);

        return {
            hfDatasets: Array.isArray(hfDatasetsRaw) ? hfDatasetsRaw : [],
            hfModels: Array.isArray(hfModelsRaw) ? hfModelsRaw : [],
        };
    } catch (error) {
        console.error('Hugging Face search failed:', error);
        return { hfDatasets: [], hfModels: [] };
    }
}

function normalizeText(value: unknown) {
    return String(value || '').toLowerCase();
}

function phraseMatchCount(text: string, phrases: string[]) {
    const normalized = text.toLowerCase();
    return phrases.reduce((count, phrase) => normalized.includes(phrase.toLowerCase()) ? count + 1 : count, 0);
}

function phraseScore(text: string, phrases: string[]) {
    if (!phrases.length) return 0;
    return Math.round((phraseMatchCount(text, phrases) / phrases.length) * 100);
}

function buildProjectKeywords(analysis: ProjectAnalysis) {
    const rawKeywords = [analysis.task, analysis.secondary_task, analysis.domain, analysis.data_type, ...(analysis.keywords || [])];
    return Array.from(new Set(rawKeywords.filter(Boolean).map((item) => String(item).trim())));
}

function normalizeClassName(value: string) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractClassesFromDatasetText(fullText: string) {
    const classPatterns = [
        'no tumor',
        'normal',
        'healthy',
        'glioma',
        'meningioma',
        'pituitary tumor',
        'pituitary',
        'meningioma',
        'glioblastoma',
        'schwannoma',
        'metastatic',
        'tumor',
        'tumour',
    ];
    const lower = fullText.toLowerCase();
    return classPatterns.filter((pattern) => lower.includes(pattern)).map((pattern) => {
        if (pattern === 'normal' || pattern === 'healthy') return 'No Tumor';
        if (pattern === 'pituitary') return 'Pituitary Tumor';
        if (pattern === 'glioblastoma') return 'Glioblastoma';
        return pattern.replace(/tumour/, 'tumor');
    });
}

function computeClassCompatibility(datasetClasses: string[], requiredClasses: string[]) {
    if (!requiredClasses.length) return 0;
    const normalizedRequired = requiredClasses.map(normalizeClassName);
    const normalizedDataset = datasetClasses.map(normalizeClassName);
    const matches = normalizedRequired.filter((req) => normalizedDataset.includes(req));
    return Math.round((matches.length / normalizedRequired.length) * 100);
}

function isTaskCompatibleWithClassification(analysis: ProjectAnalysis, fullText: string) {
    const lower = fullText.toLowerCase();
    const classificationPositive = /classification|classify|classifier|diagnosis|diagnose|tumor type|tumor classification/i.test(lower);
    const detectionNegative = /object detection|bounding box|bounding boxes|detection|localization|localisation/i.test(lower);
    const segmentationNegative = /segmentation|segmented|mask|masks/i.test(lower);
    const generationNegative = /text-to-image|image generation|generate|synthesis|diffusion|stable diffusion/i.test(lower);

    if (generationNegative) return false;
    if (segmentationNegative && !classificationPositive) return false;
    if (detectionNegative && !classificationPositive) return false;
    return classificationPositive || /mri|medical image|brain tumor/i.test(lower);
}

function inferDatasetTaskTags(fullText: string) {
    const tags = new Set<string>();
    if (/(classification|classify|classifier)/i.test(fullText)) tags.add('Classification');
    if (/(segmentation|segment|segmented)/i.test(fullText)) tags.add('Segmentation');
    if (/(detection|detect|object detection|detecting)/i.test(fullText)) tags.add('Detection');
    if (/(regression|predict|prediction)/i.test(fullText)) tags.add('Regression');
    if (/(generation|generate|synthesis)/i.test(fullText)) tags.add('Generation');
    if (tags.size === 0) tags.add('Classification');
    return Array.from(tags);
}

function inferDatasetDataTypeTags(fullText: string) {
    const tags = new Set<string>();
    if (/(mri|ct|x-?ray|image|vision|photo|picture)/i.test(fullText)) tags.add('Image');
    if (/(text|language|nlp|sentence|document|paragraph)/i.test(fullText)) tags.add('Text');
    if (/(tabular|csv|spreadsheet|table|sql|database)/i.test(fullText)) tags.add('Tabular');
    if (/(audio|speech|sound|wav|mp3)/i.test(fullText)) tags.add('Audio');
    if (/(video|frame|fps|cctv)/i.test(fullText)) tags.add('Video');
    if (tags.size === 0) tags.add('Image');
    return Array.from(tags);
}

function computeDatasetRelevance(item: any, analysis: ProjectAnalysis) {
    const title = normalizeText(item.titleNullable || item.title || item.ref || '');
    const subtitle = normalizeText(item.subtitleNullable || item.subtitle || '');
    const description = normalizeText(item.description || '');
    const fullText = `${title} ${subtitle} ${description}`;

    const projectKeywords = buildProjectKeywords(analysis);
    const keywordScore = phraseScore(fullText, projectKeywords);

    const taskScore = Math.max(
        phraseScore(fullText, [analysis.task]),
        phraseScore(fullText, [analysis.secondary_task || '']),
        phraseScore(fullText, ['classification', 'classify', 'segmentation', 'segment', 'detection', 'detect'])
    );

    const domainScore = phraseScore(fullText, [analysis.domain]);
    const dataTypeScore = phraseScore(fullText, [analysis.data_type, 'image', 'mri', 'medical imaging', 'ct', 'x-ray', 'xray']);
    const datasetClasses = extractClassesFromDatasetText(fullText);
    const classCompatibilityScore = computeClassCompatibility(datasetClasses, analysis.requiredClasses || []);

    const usesClassificationLabels = /classification|classify|labels|label|grade|type|subtype/i.test(fullText);
    const usesSegmentationLabels = /segmentation|segment|mask|masks|pixel-wise|pixelwise/i.test(fullText);
    const usesDetectionLabels = /bounding box|bounding boxes|bbox|localization|localisation|detect|detection/i.test(fullText);

    const annotationScore = analysis.segmentationRequired
        ? usesSegmentationLabels ? 100 : 0
        : analysis.detectionRequired
            ? usesDetectionLabels ? 100 : 0
            : usesClassificationLabels ? 100 : 0;

    const hardFilterFail = (analysis.segmentationRequired && !usesSegmentationLabels)
        || (analysis.detectionRequired && !usesDetectionLabels)
        || (analysis.classificationType && analysis.classificationType !== 'unknown' && !usesClassificationLabels && !usesDetectionLabels && !usesSegmentationLabels);

    const licenseAvailable = Boolean(item.licenseNameNullable || item.licenseName || item.license);
    const datasetSizeAvailable = Boolean(item.totalBytes || item.totalBytesNullable || item.totalBytes === 0);
    const metadataScore = Math.round(((licenseAvailable ? 1 : 0) + (datasetSizeAvailable ? 1 : 0) + (subtitle ? 1 : 0) + (description ? 1 : 0)) / 4 * 100);

    const relevanceBase = Math.round(
        taskScore * 0.30 +
        classCompatibilityScore * 0.20 +
        annotationScore * 0.15 +
        dataTypeScore * 0.10 +
        metadataScore * 0.05 +
        keywordScore * 0.05 +
        (item.totalBytes || item.totalBytesNullable ? 5 : 0) +
        (licenseAvailable ? 5 : 0)
    );

    const relevance = hardFilterFail ? Math.max(0, relevanceBase - 40) : relevanceBase;

    const taskTags = inferDatasetTaskTags(fullText);
    const dataTypeTags = inferDatasetDataTypeTags(fullText);

    return {
        title: item.titleNullable || item.title || item.ref?.split('/').pop()?.replace(/-/g, ' ') || 'Kaggle Dataset',
        subtitle: item.subtitleNullable || item.subtitle || '',
        description: item.description || '',
        url: item.urlNullable || item.url || `https://www.kaggle.com/${item.ref}`,
        creatorName: item.creatorNameNullable || item.creatorName || item.ownerNameNullable || item.ownerName || 'Unknown',
        ref: item.ref || '',
        license: item.licenseNameNullable || item.licenseName || item.license || 'Information unavailable',
        datasetSize: item.totalBytes || item.totalBytesNullable || null,
        lastUpdated: item.lastUpdated || null,
        source: 'kaggle',
        relevanceScore: Math.max(0, Math.min(100, relevance)),
        keywordScore,
        taskScore,
        classCompatibilityScore,
        domainScore,
        dataTypeScore,
        metadataScore,
        qualityScore: metadataScore,
        projectMatch: projectKeywords.filter((keyword) => fullText.includes(keyword.toLowerCase())),
        taskTags,
        dataTypeTags,
        datasetClasses,
        annotationType: /classification|classify|labels|label/.test(fullText) ? 'Image-level classification labels' : /segmentation|mask/.test(fullText) ? 'Segmentation masks' : /bbox|box|bounding box|bounding boxes/.test(fullText) ? 'Bounding boxes' : 'Unknown',
        annotationCompatibility: annotationScore,
        taskCompatibility: taskScore,
        classCompatibilityScore,
        classCompatibilityExplanation: analysis.requiredClasses && analysis.requiredClasses.length > 0 ? `${classCompatibilityScore}% match to required labels` : 'Not available in dataset metadata',
    };
}

function deduplicateDatasets(datasets: any[]) {
    const seen = new Set<string>();
    return datasets.filter((item) => {
        const key = item.ref || item.url || item.title;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function normalizeModelPipeline(tag: string | undefined) {
    return String(tag || '').toLowerCase();
}

function computeModelDifficulty(name: string) {
    const id = normalizeText(name);
    if (/tiny|distil|light|small/.test(id)) return 'Beginner';
    if (/resnet|efficientnet|dense|mobile|convnext|vgg|bert|albert|roberta|xlnet|deberta/.test(id)) return 'Intermediate';
    if (/gpt|llama|t5|bert-large|gpt-2|gpt-3|transformer|vit|unet|yolo|faster|detr|roberta-large/.test(id)) return 'Advanced';
    return 'Intermediate';
}

function computeModelMatch(model: any, analysis: ProjectAnalysis) {
    const pipeline = normalizeModelPipeline(model.pipeline_tag);
    const title = normalizeText(model.id || model.name || '');
    const task = normalizeText(analysis.task);
    const secondary = normalizeText(analysis.secondary_task || '');
    const dataType = normalizeText(analysis.data_type);
    const output = normalizeText(analysis.output || '');

    let score = 40;

    const isImageTask = task.includes('image') || task.includes('mri') || task.includes('classification') || task.includes('segmentation') || task.includes('detection');
    const isMedical = analysis.domain.toLowerCase().includes('medical');

    if (task.includes('classification')) {
        if (title.includes('resnet') || title.includes('efficientnet') || title.includes('densenet') || title.includes('convnext') || title.includes('vit')) score += 30;
        if (pipeline.includes('image')) score += 20;
        if (title.includes(' clip ') || title.includes('stable') || title.includes('diffusion') || title.includes('gpt') || title.includes('llama') || title.includes('dalle')) score -= 40;
    }

    if (task.includes('detection') || secondary.includes('detection') || output.includes('bounding')) {
        if (title.includes('yolo') || title.includes('faster') || title.includes('retina') || title.includes('detr') || title.includes('ssd') || title.includes('efficientdet') || title.includes('yolov')) score += 35;
        if (!pipeline.includes('image')) score -= 30;
    }

    if (task.includes('segmentation') || secondary.includes('segmentation') || output.includes('mask')) {
        if (title.includes('unet') || title.includes('nnunet') || title.includes('segformer') || title.includes('swinunet') || title.includes('transunet')) score += 35;
        if (!pipeline.includes('image')) score -= 30;
    }

    if (pipeline.includes('image') && isImageTask) score += 15;
    if (dataType.includes('mri') || dataType.includes('medical')) score += 10;
    if (isMedical && title.includes('medical')) score += 10;
    if (title.includes('transfer')) score += 10;

    const badModel = /(text-to-image|image-generation|diffusion|stable diffusion|dalle|gpt|llama|whisper|chatglm|blip|mistral|stable)/i;
    if (badModel.test(title) || badModel.test(pipeline)) score = Math.min(score, 30);

    return Math.min(Math.max(score, 0), 100);
}

function rankHuggingFaceModels(models: any[], analysis: ProjectAnalysis) {
    return models.map((model) => {
        const matchScore = computeModelMatch(model, analysis);
        const difficulty = computeModelDifficulty(model.id || model.name || '');
        const recommendation = difficulty === 'Beginner' ? 'Good starting point' : difficulty === 'Intermediate' ? 'Strong choice' : 'Powerful for larger projects';

        return {
            id: model.id || model.modelId || 'unknown',
            pipeline: model.pipeline_tag || model.task || 'Unknown',
            downloads: model.downloads || 0,
            likes: model.likes || model.ratings || 0,
            url: `https://huggingface.co/${model.id || model.modelId}`,
            matchScore,
            difficulty,
            recommendation,
            source: 'huggingface',
            description: model.tags?.join(', ') || model.description || '',
        };
    }).sort((a, b) => b.matchScore - a.matchScore);
}

function buildProjectSummary(results: { kaggle: any[]; hfModels: any[] }, analysis: ProjectAnalysis) {
    return {
        projectTitle: analysis.project_title,
        domain: analysis.domain,
        task: analysis.task + (analysis.secondary_task ? ` + ${analysis.secondary_task}` : ''),
        dataType: analysis.data_type,
        datasetsFound: results.kaggle.length,
        modelsFound: results.hfModels.length,
        bestDataset: results.kaggle.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))[0] || null,
        bestModel: results.hfModels[0] || null,
    };
}

function buildFeasibility(analysis: ProjectAnalysis, datasets: any[], models: any[]) {
    const datasetAvailability = datasets.length > 0 ? Math.min(90, 50 + datasets.length * 8) : 20;
    const modelAvailability = models.length > 0 ? Math.min(90, 50 + models.length * 10) : 25;
    const datasetQuality = datasets.length > 0 ? Math.round(((datasets[0].qualityScore || 50) + datasetAvailability) / 2) : 40;
    const docScore = models.length > 0 ? 70 : 45;
    const difficulty = models[0]?.difficulty === 'Advanced' ? 60 : models[0]?.difficulty === 'Intermediate' ? 75 : 85;
    const overall = Math.round((datasetAvailability + modelAvailability + datasetQuality + docScore + difficulty) / 5);

    return {
        overall: overall,
        datasetAvailability,
        modelAvailability,
        computationalDifficulty: difficulty,
        documentation: docScore,
        datasetQuality,
        note: datasets.length && models.length ? 'Based on available datasets and model candidates.' : 'Estimated because some information is unavailable.',
    };
}

function buildHardwareRecommendations(analysis: ProjectAnalysis, bestModel: any, bestDataset: any) {
    const dataType = normalizeText(analysis.data_type);
    const task = normalizeText(analysis.task);
    const modelDifficulty = bestModel?.difficulty || 'Intermediate';

    const gpu = dataType.includes('image') || task.includes('segmentation') ? 'NVIDIA RTX 3060 or better' : 'NVIDIA GTX 1660 or equivalent';
    const ram = dataType.includes('image') || task.includes('segmentation') ? '16 GB recommended' : '8 GB minimum';
    const storage = bestDataset?.datasetSize ? `${Math.max(20, Math.ceil(bestDataset.datasetSize / (1024 * 1024 * 1024)) * 5)} GB estimated` : '20-50 GB estimated';

    return {
        gpu,
        ram,
        storage,
        difficulty: modelDifficulty,
        cloudAlternative: 'Cloud GPU recommended for faster training and prototyping',
        note: 'Estimated from task type and available model information.',
    };
}

async function searchKaggleDatasets(keywords: string[], analysis: ProjectAnalysis) {
    const search = encodeURIComponent(keywords.slice(0, 2).join(' '));
    const searchUrl = `https://www.kaggle.com/api/v1/datasets/list?search=${search}&page=1&pageSize=12`;

    console.info('KAGGLE SEARCH QUERY', { searchUrl, keywords });

    try {
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'AI Dataset Explorer',
                Accept: 'application/json',
            },
            cache: 'no-store',
        });

        console.info('KAGGLE REQUEST STATUS', { status: response.status, statusText: response.statusText });

        if (!response.ok) {
            const text = await response.text().catch(() => 'unable to read body');
            console.error('Kaggle search failed: non-OK status', { status: response.status, body: text.slice(0, 500) });
            return [];
        }

        const data = await response.json();
        const rawJson = JSON.stringify(data);
        console.info('KAGGLE RAW RESPONSE', rawJson.slice(0, 1000));

        if (!Array.isArray(data)) {
            console.error('Kaggle search failed: unexpected response shape', { data });
            return [];
        }

        const scored = data.map((item: any) => computeDatasetRelevance(item, analysis));
        const unique = deduplicateDatasets(scored);
        const ranked = unique.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
        console.info('KAGGLE PARSED RESULTS COUNT', ranked.length);
        return ranked.slice(0, 10);
    } catch (error) {
        console.error('Kaggle search failed:', error);
        return [];
    }
}

export async function POST(req: Request) {
    let rawBody = '';

    try {
        rawBody = await req.text();
        const body = parseSearchPayload(rawBody);
        const query = body?.query?.trim();

        if (!query) {
            return NextResponse.json({ message: 'Missing query' }, { status: 400 });
        }

        const geminiAnalysis = await fetchGeminiAnalysis(query);
        const analysis = geminiAnalysis || buildFallbackAnalysis(query);
        const recommendationKeywords = analysis.keywords.length > 0 ? analysis.keywords : buildFallbackKeywords(query);

        const [kaggle, { hfDatasets, hfModels: hfModelsRaw }] = await Promise.all([
            searchKaggleDatasets(analysis.keywords, analysis),
            searchHuggingFace(analysis.keywords),
        ]);

        const hfModels = rankHuggingFaceModels(hfModelsRaw, analysis);
        const summary = buildProjectSummary({ kaggle, hfModels }, analysis);
        const feasibility = buildFeasibility(analysis, kaggle, hfModels);
        const hardware = buildHardwareRecommendations(analysis, hfModels[0], kaggle[0]);

        return NextResponse.json({
            analysis,
            recommendationKeywords,
            summary,
            feasibility,
            hardware,
            results: {
                kaggle,
                hfModels,
                hfDatasets,
            },
        });
    } catch (error) {
        console.error('Search API failed:', error, { rawBody });
        if (rawBody) {
            try {
                JSON.parse(rawBody);
            } catch (parseError) {
                return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
            }
        }

        return NextResponse.json({ message: 'Search failed' }, { status: 500 });
    }
}
