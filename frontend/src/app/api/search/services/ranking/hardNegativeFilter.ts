/**
 * Hard-Negative Filtering
 * 
 * Rejects datasets that are fundamentally incompatible with the project task/domain/modality.
 * A hard-negative dataset gets score = 0 regardless of keyword overlap.
 * 
 * Rules are applied BEFORE scoring so no keyword similarity can override them.
 */

export interface HardNegativeResult {
    rejected: boolean;
    rejectionReason?: string;
}

// ── Domain exclusion pairs ────────────────────────────────────────────────────
// [projectDomainKeyword, incompatibleDatasetKeyword]
const DOMAIN_EXCLUSION_PAIRS: [string, string][] = [
    // Manufacturing defect detection vs medical imaging
    ['industrial defect', 'mri'],
    ['industrial defect', 'ct'],
    ['industrial defect', 'x-ray'],
    ['industrial defect', 'radiology'],
    ['industrial defect', 'medical imaging'],
    ['manufacturing', 'mri'],
    ['manufacturing', 'ct'],
    ['manufacturing', 'radiology'],
    ['quality inspection', 'mri'],
    ['quality inspection', 'medical imaging'],
    ['surface defect', 'mri'],
    ['surface defect', 'medical imaging'],
    ['defect detection', 'mri'],
    ['defect detection', 'ct'],
    ['defect detection', 'x-ray'],
    ['defect detection', 'radiology'],
    ['inspection', 'mri'],
    ['inspection', 'radiology'],
    // Medical vs non-medical
    ['mri', 'cctv'],
    ['mri', 'traffic'],
    ['mri', 'vehicle'],
    ['mri', 'skin lesion'],
    ['mri', 'dermoscop'],
    ['mri', 'retinal'],
    ['brain tumor', 'skin'],
    ['brain tumor', 'vehicle'],
    ['brain tumor', 'traffic'],
    ['dermatology', 'mri'],
    ['dermatology', 'traffic'],
    ['dermatology', 'vehicle'],
    ['skin disease', 'traffic'],
    ['skin disease', 'vehicle'],
    ['skin disease', 'brain'],
    ['chest x-ray', 'skin'],
    ['chest x-ray', 'vehicle'],
    ['chest x-ray', 'traffic'],
    // Vehicle vs medical
    ['vehicle', 'mri'],
    ['vehicle', 'brain tumor'],
    ['vehicle', 'skin lesion'],
    ['vehicle', 'dermoscop'],
    ['vehicle', 'chest x-ray'],
    ['traffic', 'mri'],
    ['traffic', 'brain'],
    ['traffic', 'dermoscop'],
    ['traffic', 'skin lesion'],
    // Text vs vision
    ['sentiment', 'image'],
    ['sentiment', 'video'],
    ['sentiment', 'mri'],
    ['sentiment', 'vehicle'],
    ['text classification', 'cctv'],
    ['text classification', 'image classification'],
    ['nlp', 'vehicle detection'],
    ['nlp', 'mri'],
    // Vision vs tabular
    ['object detection', 'tabular'],
    ['image classification', 'csv'],
    ['image segmentation', 'tabular'],
    // Time-series vs unrelated
    ['time series', 'image'],
    ['time series', 'video'],
    ['time series', 'mri'],
    ['forecasting', 'image'],
    ['forecasting', 'video'],
    // Speech vs vision
    ['speech recognition', 'image'],
    ['speech recognition', 'vehicle'],
    ['speech recognition', 'mri'],
    // Satellite vs medical
    ['remote sensing', 'mri'],
    ['remote sensing', 'skin'],
    ['satellite', 'mri'],
    ['satellite', 'sentiment'],
];

// ── Modality exclusion pairs ─────────────────────────────────────────────────
// [projectModality, incompatibleDatasetModality]
const MODALITY_EXCLUSION_PAIRS: [string, string][] = [
    ['video', 'tabular'],
    ['video', 'text'],
    ['video', 'audio'],
    ['image', 'tabular'],
    ['image', 'text'],
    ['image', 'time-series'],
    ['text', 'image'],
    ['text', 'video'],
    ['text', 'audio'],
    ['tabular', 'image'],
    ['tabular', 'video'],
    ['tabular', 'audio'],
    ['audio', 'image'],
    ['audio', 'video'],
    ['audio', 'tabular'],
    ['time-series', 'image'],
    ['time-series', 'video'],
    ['time-series', 'text'],
];

function normalize(s: string): string {
    return (s ?? '').toLowerCase().trim();
}

function containsAny(text: string, keywords: string[]): boolean {
    const t = normalize(text);
    return keywords.some(k => t.includes(normalize(k)));
}

export function applyHardNegativeFilter(
    dataset: {
        name?: string;
        title?: string;
        description?: string;
        tags?: string[];
        task?: string;
        modality?: string;
        domain?: string;
    },
    project: {
        task?: string | string[];
        data_modality?: string;
        domain?: string;
        subdomain?: string;
        input_type?: string;
    }
): HardNegativeResult {
    // Build searchable blobs
    const datasetBlob = [
        dataset.name,
        dataset.title,
        dataset.description,
        ...(dataset.tags ?? []),
        dataset.task,
        dataset.modality,
        dataset.domain,
    ].filter(Boolean).join(' ');

    const projectTaskArr = Array.isArray(project.task) ? project.task : [project.task ?? ''];
    const projectBlob = [
        ...projectTaskArr,
        project.data_modality,
        project.domain,
        project.subdomain,
        project.input_type,
    ].filter(Boolean).join(' ');

    // Whitelist: Manufacturing projects with manufacturing datasets should NOT be rejected
    const isManufacturingProject = containsAny(projectBlob, ['manufacturing', 'industrial', 'defect', 'quality control', 'inspection']);
    const isManufacturingDataset = containsAny(datasetBlob, ['mvtec', 'dagm', 'kolektor', 'industrial', 'manufacturing', 'defect']);
    if (isManufacturingProject && isManufacturingDataset) {
        return { rejected: false };
    }

    // Whitelist: Medical projects with medical datasets should NOT be rejected
    const isMedicalProject = containsAny(projectBlob, ['medical', 'mri', 'ct', 'x-ray', 'radiology', 'tumor', 'lesion', 'diagnosis']);
    const isMedicalDataset = containsAny(datasetBlob, ['medmnist', 'chest x-ray', 'brain tumor', 'medical', 'mri', 'radiology']);
    if (isMedicalProject && isMedicalDataset) {
        return { rejected: false };
    }

    // 1. Domain-pair exclusion
    for (const [projKeyword, dataKeyword] of DOMAIN_EXCLUSION_PAIRS) {
        if (
            containsAny(projectBlob, [projKeyword]) &&
            containsAny(datasetBlob, [dataKeyword])
        ) {
            return {
                rejected: true,
                rejectionReason: `Domain mismatch: project involves '${projKeyword}' but dataset relates to '${dataKeyword}'.`,
            };
        }
    }

    // 2. Modality-pair exclusion
    const projectModality = normalize(project.data_modality ?? '');
    const datasetModality = normalize(dataset.modality ?? dataset.task ?? '');

    for (const [projMod, dataMod] of MODALITY_EXCLUSION_PAIRS) {
        if (
            projectModality.includes(projMod) &&
            datasetModality.includes(dataMod)
        ) {
            return {
                rejected: true,
                rejectionReason: `Modality mismatch: project uses '${projectModality}' data but dataset is '${datasetModality}'.`,
            };
        }
    }

    return { rejected: false };
}
