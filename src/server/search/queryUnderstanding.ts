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
        domain: 'Biomedical / Cellular Biology & Digital Pathology',
        subdomains: ['Nuclei Segmentation', 'Fluorescence Microscopy', 'Histopathology'],
        test: (q) => /nuclei|cellular|fluorescence|histolog|monuseg|stardist/i.test(q),
    },
    {
        domain: 'Biomedical / Neurology & Neuroimaging',
        subdomains: ['Brain MRI', 'Neuroimaging', 'Neuro-oncology', 'Brain Tumor'],
        test: (q) => /brain|cerebr|hippocamp|glioma|stroke|epilep|eeg|ieeg|ecog|cranial|neuro/i.test(q),
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
        test: (q) => /audio|speech|voice|wav|acoustic|sound|speaker/i.test(q),
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
];

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

    if (/cta|coronary\s*cta|ct\b|computed\s*tomography/i.test(qLower) && !/pc.?mri/i.test(qLower)) {
        modalities.push('CT');
        if (/cta/i.test(qLower)) modalitySubtypes.push('CTA', 'Computed Tomography Angiography');
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
    if (/text|multilingual|\bnlp\b|language|sentences?|documents?|tickets?/i.test(qLower)) {
        modalities.push('Text / Multilingual');
    }
    if (/retin|fundus|photo|dermoscop|image|camera|picture|cats?\s*and\s*dogs|vehicle/i.test(qLower) && !modalities.includes('Microscopy') && !modalities.includes('Image') && !modalities.includes('MRI') && !modalities.includes('CT') && !modalities.includes('X-ray') && !modalities.includes('2D RGB') && !modalities.includes('Satellite / Multispectral')) {
        modalities.push('Image');
    }
    if (/audio|speech|voice|wav|acoustic/i.test(qLower)) {
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
    if (/object\s*detection|detect|bounding\s*box|yolo/i.test(qLower)) {
        predictionTasks.push('Object Detection');
    }
    if (/classif|diagnos|early\s*detection|disease\s*detection/i.test(qLower)) {
        predictionTasks.push('Classification');
    }
    if (/named\s*entity\s*recognition|\bner\b/i.test(qLower)) {
        predictionTasks.push('Named Entity Recognition (NER)');
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

    // 6. Generic Target Entities & Outputs
    const physiologicalTargets: string[] = [];
    const targetEntities: string[] = [];
    const targetOutputs: string[] = [];

    // Domain-agnostic entity extraction: parse the core problem clauses
    const clauses = q.split(/[/+(),-]/).map(s => s.trim()).filter(s => s.length > 2 && !/^\d+\s*gb$/i.test(s));
    for (const clause of clauses) {
        if (!/classification|segmentation|detection|regression|summarization|ner|priority|3d|2d|4d|rgb/i.test(clause)) {
            targetEntities.push(clause);
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
    } else if (primaryDomain === 'Agriculture & Plant Pathology') {
        datasetQueries.push('plant disease classification dataset', 'crop leaf disease images', 'plantvillage dataset');
        modelQueries.push('plant disease classification model', 'resnet50 plant disease');
        paperQueries.push('deep learning crop disease classification', 'plant pathology image classification');
        benchmarkQueries.push('PlantVillage', 'Plant Pathology Challenge');
    } else {
        const primaryAnatomy = anatomy.find(a => !a.includes('_') && a !== a.toUpperCase()) || anatomy[1] || anatomy[0];
        const primaryTarget = targetEntities[0] || primaryAnatomy || (q.split(/[,\.]/)[0] || q).split(' ').slice(0, 4).join(' ');
        const primaryMod = modalities[0] && modalities[0] !== 'Multimodal / General' ? modalities[0] : '';
        const primaryTsk = (reconstructionTasks[0] || predictionTasks[0] || estimationTasks[0] || '').split(' ')[0];
        datasetQueries.push(`${primaryTarget} ${primaryMod} ${primaryTsk}`.trim(), `${primaryTarget} ${primaryMod}`.trim(), `${primaryTarget} dataset`.trim());
        modelQueries.push(`${primaryTarget} ${primaryTsk} model`.trim(), `${primaryTarget} model`.trim());
        paperQueries.push(`${primaryTarget} deep learning`.trim(), `${primaryTarget} ${primaryTsk}`.trim());
        benchmarkQueries.push(`${primaryTarget} benchmark`.trim(), `${primaryTarget} challenge`.trim());
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
