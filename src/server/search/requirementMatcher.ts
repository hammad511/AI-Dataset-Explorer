/**
 * Requirement Matcher
 *
 * For every candidate, evaluates each requirement in the RequirementProfile and
 * produces a RequirementMatch array with explicit SATISFIED / PARTIAL / NOT_SATISFIED /
 * UNKNOWN / CONFLICT states.
 *
 * Scientific principle: UNKNOWN != SATISFIED. Missing metadata stays UNKNOWN.
 * A high embedding score CANNOT override a NOT_SATISFIED or CONFLICT hard requirement.
 */

import { UnifiedCandidate } from "./types";
import { RequirementProfile, RequirementMatch, RequirementSatisfaction } from "./types";
import { DOMAIN_ANCHOR_SYNONYMS } from "./queryUnderstanding";

function clean(s?: unknown): string {
    if (Array.isArray(s)) return (s as unknown[]).map((x) => String(x ?? "")).join(" ").toLowerCase();
    return String(s ?? "").toLowerCase();
}

function buildBlob(candidate: UnifiedCandidate): string {
    const parts = [
        candidate.title,
        candidate.name,
        candidate.description,
        Array.isArray(candidate.tags) ? candidate.tags.join(" ") : "",
        clean(candidate.modality),
        clean(candidate.task),
        candidate.pipelineTag,
        candidate.architecture,
        JSON.stringify(candidate.metadata ?? {}),
        JSON.stringify(candidate.rawMetadata ?? {}),
    ];
    return parts.map(clean).join(" ");
}

function matchGenericRequirement(candidate: UnifiedCandidate, req: RequirementProfile['requirements'][number], blob: string): RequirementMatch {
    const values = req.detectedValue.split(/[,;]|\s+or\s+/i).map(value => value.trim()).filter(Boolean);
    const negative = req.id === 'req_negative';
    const matched = values.filter(value => blob.includes(value.toLowerCase()));
    if (negative && matched.length > 0) {
        return { requirementId: req.id, status: 'CONFLICT', evidence: matched.join(', '), confidence: 0.9, explanation: `Excluded concept found in resource metadata: ${matched.join(', ')}` };
    }
    if (negative) return { requirementId: req.id, status: 'SATISFIED', evidence: null, confidence: 0.7, explanation: 'No excluded concept found in available metadata' };
    if (matched.length === values.length && values.length > 0) return { requirementId: req.id, status: 'SATISFIED', evidence: matched.join(', '), confidence: 0.8, explanation: 'Requirement confirmed in resource metadata' };
    if (matched.length > 0) return { requirementId: req.id, status: 'PARTIAL', evidence: matched.join(', '), confidence: 0.5, explanation: 'Some requirement terms found in resource metadata' };
    return { requirementId: req.id, status: 'UNKNOWN', evidence: null, confidence: 0, explanation: 'Requirement is not specified in available resource metadata' };
}

// ── Domain matching ────────────────────────────────────────────────────────────

interface DomainMatcher {
    domainId: string;
    satisfiedPatterns: RegExp[];
    conflictPatterns: RegExp[];
    conflictDescription: string;
}

const DOMAIN_MATCHERS: DomainMatcher[] = [
    {
        domainId: "req_domain_copd",
        satisfiedPatterns: [
            /\bCOPD\b|chronic\s*obstructive|emphysema|spirometry|fev1|fev\/fvc|exacerbation|bronchodilator|copd\s*severity|gold\s*stage/i,
        ],
        conflictPatterns: [
            /lung\s*cancer|non.small\s*cell|nsclc|adenocarcinoma|squamous\s*cell.*lung|lung\s*nodule.*cancer/i,
        ],
        conflictDescription: "Candidate is lung cancer / oncology, not COPD",
    },
    {
        domainId: "req_domain_alzheimer",
        satisfiedPatterns: [/alzheimer|dementia|\bmci\b|adni|oasis|apoe|cognitive\s*decline/i],
        conflictPatterns: [/brain\s*tumor|glioma|glioblastoma|cardiac|heart/i],
        conflictDescription: "Candidate is oncology/cardiac, not Alzheimer",
    },
    {
        domainId: "req_domain_cardiac",
        satisfiedPatterns: [/cardiac|heart|coronary|cardiovascular|aorta|myocard/i],
        conflictPatterns: [/lung\s*cancer|brain\s*tumor|glioma|retinopathy|melanoma/i],
        conflictDescription: "Candidate primary subject conflicts with cardiac requirement",
    },
    {
        domainId: "req_domain_brain_tumor",
        satisfiedPatterns: [/brain\s*tumor|glioma|glioblastoma|meningioma|\bbrats\b|neuro.onco/i],
        conflictPatterns: [/alzheimer|cardiac|lung\s*cancer|melanoma/i],
        conflictDescription: "Candidate conflicts with brain tumor requirement",
    },
    {
        domainId: "req_domain_retinopathy",
        satisfiedPatterns: [/retinopath|diabetic\s*retinopathy|fundus|retina|ophthalm|eyepacs|messidor/i],
        conflictPatterns: [/cardiac|brain\s*tumor|lung|skin\s*cancer/i],
        conflictDescription: "Candidate conflicts with retinopathy requirement",
    },
    {
        domainId: "req_domain_skin",
        satisfiedPatterns: [/skin\s*lesion|melanoma|dermoscop|isic|ham10000|dermatol/i],
        conflictPatterns: [/cardiac|brain\s*tumor|lung\s*cancer|retinopathy/i],
        conflictDescription: "Candidate conflicts with skin/melanoma requirement",
    },
    {
        domainId: "req_domain_lung_nodule",
        satisfiedPatterns: [/lung\s*nodule|lung\s*cancer|pulmonary\s*nodule|nlst|lidc/i],
        conflictPatterns: [],
        conflictDescription: "",
    },
    {
        domainId: "req_domain_seizure",
        satisfiedPatterns: [/seizure|epilepsy|\beeg\b|\bieeg\b|chb.mit|tusz|epileptic/i],
        conflictPatterns: [/cardiac|lung|skin|retina/i],
        conflictDescription: "Candidate conflicts with seizure/EEG requirement",
    },
    {
        domainId: "req_domain_medical",
        satisfiedPatterns: [/medical|clinical|patient|hospital|radiology|scan/i],
        conflictPatterns: [],
        conflictDescription: "",
    },
];

function matchDomain(blob: string, title: string, reqId: string, detectedValue = ""): RequirementMatch {
    const domainContext = `${reqId} ${detectedValue}`.toLowerCase();
    const matcher =
        DOMAIN_MATCHERS.find((m) => m.domainId === reqId) ||
        DOMAIN_MATCHERS.find((m) => m.satisfiedPatterns.some((sp) => sp.test(domainContext)));

    if (!matcher) {
        // Fallback: evaluate detected domain tokens + synonyms directly against title & blob
        const tokens = detectedValue
            .toLowerCase()
            .split(/[\s,;/]+/)
            .filter((t) => t.length > 2);
        if (tokens.length === 0) {
            return { requirementId: reqId, status: "UNKNOWN", evidence: null, confidence: 0, explanation: "No domain matcher found" };
        }
        const matched = tokens.filter((t) => {
            const syns = [t, ...(DOMAIN_ANCHOR_SYNONYMS[t] || [])];
            return syns.some((s) => blob.includes(s.toLowerCase()));
        });
        if (matched.length === tokens.length) {
            return { requirementId: reqId, status: "SATISFIED", evidence: matched.join(", "), confidence: 0.85, explanation: `Domain terms confirmed: ${matched.join(", ")}` };
        }
        if (matched.length > 0) {
            return { requirementId: reqId, status: "PARTIAL", evidence: matched.join(", "), confidence: 0.55, explanation: `Partial domain alignment: ${matched.join(", ")}` };
        }
        return { requirementId: reqId, status: "NOT_SATISFIED", evidence: null, confidence: 0, explanation: `Domain "${detectedValue}" not found in candidate metadata` };
    }
    // Check conflict first (title-primary)
    for (const cp of matcher.conflictPatterns) {
        if (cp.test(title)) {
            const match = title.match(cp);
            return {
                requirementId: reqId,
                status: "CONFLICT",
                evidence: match ? match[0] : title.slice(0, 60),
                confidence: 0.92,
                explanation: matcher.conflictDescription,
            };
        }
    }
    // Check conflict in blob (less certain)
    for (const cp of matcher.conflictPatterns) {
        if (cp.test(blob) && !matcher.satisfiedPatterns.some((sp) => sp.test(title))) {
            return {
                requirementId: reqId,
                status: "CONFLICT",
                evidence: null,
                confidence: 0.6,
                explanation: `${matcher.conflictDescription} (inferred from description)`,
            };
        }
    }
    // Check satisfaction
    for (const sp of matcher.satisfiedPatterns) {
        if (sp.test(title)) {
            const match = title.match(sp);
            return {
                requirementId: reqId,
                status: "SATISFIED",
                evidence: match ? match[0] : title.slice(0, 60),
                confidence: 0.95,
                explanation: `Domain keyword confirmed in title: "${match ? match[0] : "match"}"`,
            };
        }
    }
    for (const sp of matcher.satisfiedPatterns) {
        if (sp.test(blob)) {
            const match = blob.match(sp);
            return {
                requirementId: reqId,
                status: "PARTIAL",
                evidence: match ? match[0].slice(0, 80) : null,
                confidence: 0.6,
                explanation: "Domain keyword found in description (not title/tags)",
            };
        }
    }
    return {
        requirementId: reqId,
        status: "UNKNOWN",
        evidence: null,
        confidence: 0,
        explanation: "No evidence of required disease domain found in candidate metadata",
    };
}

// ── Known model VRAM requirements ────────────────────────────────────────────

interface ModelVramEstimate {
    pattern: RegExp;
    estimatedVramGb: number;
    note: string;
    patchFeasible: boolean; // can patch-based inference reduce VRAM?
}

const MODEL_VRAM_DB: ModelVramEstimate[] = [
    { pattern: /swin.unetr.*large|swin.*unetr.*large/i, estimatedVramGb: 16, note: "Swin UNETR Large ~16GB training", patchFeasible: true },
    { pattern: /swin.unetr|swin_unetr/i, estimatedVramGb: 8, note: "Swin UNETR Base ~6-8GB training", patchFeasible: true },
    { pattern: /nnunet|nn-unet/i, estimatedVramGb: 8, note: "nnU-Net ~8GB training", patchFeasible: true },
    { pattern: /unet3d|3d\s*unet|3dunet/i, estimatedVramGb: 6, note: "3D U-Net ~6GB", patchFeasible: true },
    { pattern: /resnet.*3d|3d.*resnet/i, estimatedVramGb: 8, note: "3D ResNet ~8GB", patchFeasible: true },
    { pattern: /vit.*3d|3d.*vit/i, estimatedVramGb: 20, note: "3D ViT ~20GB+", patchFeasible: false },
    { pattern: /segresnet|seg.res.net/i, estimatedVramGb: 8, note: "SegResNet ~8GB", patchFeasible: true },
    { pattern: /llama.*70b|70b/i, estimatedVramGb: 140, note: "LLaMA 70B ~140GB", patchFeasible: false },
    { pattern: /llama.*7b|7b.*llama/i, estimatedVramGb: 14, note: "LLaMA 7B ~14GB", patchFeasible: false },
    { pattern: /efficientnet|efficient.net/i, estimatedVramGb: 4, note: "EfficientNet ~4GB", patchFeasible: false },
    { pattern: /resnet.50|resnet50/i, estimatedVramGb: 4, note: "ResNet-50 ~4GB", patchFeasible: false },
    { pattern: /densenet/i, estimatedVramGb: 5, note: "DenseNet ~5GB", patchFeasible: false },
];

function estimateModelVram(blob: string, candidate: UnifiedCandidate): { estimatedGb: number | null; note: string; patchFeasible: boolean } {
    const combinedText = `${clean(candidate.title)} ${clean(candidate.name)} ${clean(candidate.architecture)} ${blob}`;
    for (const entry of MODEL_VRAM_DB) {
        if (entry.pattern.test(combinedText)) {
            return { estimatedGb: entry.estimatedVramGb, note: entry.note, patchFeasible: entry.patchFeasible };
        }
    }
    // Estimate from parameter count
    const params = candidate.parameters;
    if (typeof params === "number" && params > 0) {
        const gb = Math.round((params * 4) / 1e9 + 1); // fp32 estimate + activations
        return { estimatedGb: gb, note: `Estimated from ${params.toLocaleString()} params`, patchFeasible: true };
    }
    return { estimatedGb: null, note: "VRAM unknown", patchFeasible: true };
}

// ── Main requirement matcher ──────────────────────────────────────────────────

export function matchCandidateRequirements(
    candidate: UnifiedCandidate,
    profile: RequirementProfile
): RequirementMatch[] {
    const blob = buildBlob(candidate);
    const title = clean(candidate.title || candidate.name);
    const tags = Array.isArray(candidate.tags) ? candidate.tags.map(clean).join(" ") : "";
    const matches: RequirementMatch[] = [];

    for (const req of profile.requirements) {
        let m: RequirementMatch;

        switch (req.category) {
            // ── Domain ────────────────────────────────────────────────────────
            case "DOMAIN": {
                m = matchDomain(blob, title, req.id, req.detectedValue);
                break;
            }

            // ── Modality ─────────────────────────────────────────────────────
            case "MODALITY": {
                const vals = req.detectedValue.toLowerCase().split(",").map((v) => v.trim());
                const primary = vals[0];
                let status: RequirementSatisfaction = "UNKNOWN";
                let evidence: string | null = null;
                let explanation = "";

                if (primary === "3d ct" || primary === "ct" || primary === "cta") {
                    const hasCT = /\bct\b|\bcta\b|\bccta\b|computed\s*tomography|chest\s*ct|3d\s*ct|ct\s*scan|dicom\s*ct|ct\s*volume/i.test(blob);
                    const has3D = /3d|volumetric|nifti|\.nii|3\s*d\s*volume/i.test(blob);
                    if (hasCT && (primary !== "3d ct" || has3D)) {
                        status = "SATISFIED";
                        evidence = "CT confirmed";
                        explanation = "CT modality confirmed in metadata";
                    } else if (hasCT) {
                        status = "PARTIAL";
                        evidence = "CT found";
                        explanation = "CT modality found but 3D volumetric not verified";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "CT modality not found in metadata";
                    }
                } else if (primary === "mri" || primary === "3d mri") {
                    if (/\bmri\b|\bfmri\b|magnetic\s*resonance|mr\s*imaging|nifti|\.nii/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "MRI confirmed";
                        explanation = "MRI modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "MRI not found in metadata";
                    }
                } else if (/^x[- ]?ray$|^cxr$/i.test(primary)) {
                    if (/x[- ]?ray|\bcxr\b|radiograph|chexpert|mimic[- ]cxr/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "X-ray confirmed";
                        explanation = "X-ray / radiograph modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "X-ray modality not found";
                    }
                } else if (primary === "ultrasound") {
                    if (/ultrasound|echocardio|sonograph/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Ultrasound confirmed";
                        explanation = "Ultrasound modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Ultrasound modality not found";
                    }
                } else if (primary === "eeg" || primary === "ieeg") {
                    if (/\beeg\b|\bieeg\b|\becog\b|electroencephalog|seizure/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "EEG confirmed";
                        explanation = "EEG modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "EEG modality not found";
                    }
                } else if (primary === "audio" || primary === "speech" || primary === "voice") {
                    if (/audio|speech|wav|sound|acoustic|voice|utterance|asr/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Audio/speech confirmed";
                        explanation = "Audio modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Audio modality not found";
                    }
                } else if (primary === "video") {
                    if (/video|cctv|dash\s*cam|surveillance|mp4|avi|frame\s*sequence/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Video confirmed";
                        explanation = "Video modality confirmed";
                    } else if (/image|vision|detection|tracking/i.test(blob)) {
                        status = "PARTIAL";
                        evidence = "Visual frame modality";
                        explanation = "Image/frame modality compatible with video pipeline";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Video modality not found";
                    }
                } else if (/^(?:text|multilingual|language|notes?|documents?|nlp)$/i.test(primary)) {
                    if (/\btext\b|\bnlp\b|language|multilingual|corpus|token|sentence|document|notes?|bert|roberta|llm|ner\b|rag\b|question[- ]answering|translation|summariz/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Text/NLP confirmed";
                        explanation = "Text / NLP modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Text / NLP modality not found";
                    }
                } else if (primary === "tabular" || primary === "csv") {
                    if (/tabular|\.csv\b|structured\s*data|dataframe|table|transaction|xgboost|lightgbm|tabnet|credit|fraud|ehr|clinical\s*record/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Tabular/CSV confirmed";
                        explanation = "Tabular modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Tabular modality not found";
                    }
                } else if (/time[- ]series|sensor/i.test(primary)) {
                    if (/time[- ]series|temporal|sensor|forecasting|eeg|ecg|imu|sequential/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Time-series confirmed";
                        explanation = "Time-series / sensor modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Time-series modality not found";
                    }
                } else if (/satellite|multispectral|hyperspectral|geospatial/i.test(primary)) {
                    if (/satellite|multispectral|hyperspectral|remote\s*sensing|aerial|geospatial|earth\s*observation|sentinel|landsat|sar\b/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Satellite/Remote Sensing confirmed";
                        explanation = "Satellite / multispectral modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Satellite / multispectral modality not found";
                    }
                } else if (/thermal|infrared/i.test(primary)) {
                    if (/thermal|infrared|\bir\b|thermograph|electroluminescen|solar\s*panel|pv\b/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Thermal/Infrared confirmed";
                        explanation = "Thermal / infrared imaging confirmed";
                    } else if (/image|vision|defect|detection/i.test(blob)) {
                        status = "PARTIAL";
                        evidence = "Visual inspection modality";
                        explanation = "Visual imaging found (thermal/IR not explicitly tagged)";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Thermal / imaging modality not found";
                    }
                } else if (/microscop|histolog/i.test(primary)) {
                    if (/microscop|histolog|histopatholog|fluorescence|nuclei|cell|monuseg|pathology|slide|wsi\b/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Microscopy/Histology confirmed";
                        explanation = "Microscopy / histopathology modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Microscopy modality not found";
                    }
                } else if (/dermoscop|fundus/i.test(primary)) {
                    if (/dermoscop|isic|ham10000|skin\s*lesion|melanoma|fundus|retina|eyepacs|messidor/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = `${primary} confirmed`;
                        explanation = `${primary} modality confirmed`;
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = `${primary} modality not found`;
                    }
                } else if (/lidar|point[- ]cloud/i.test(primary)) {
                    if (/lidar|point[- ]cloud|3d\s*object|kitti|nuscenes|waymo|velodyne/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "LiDAR / Point-cloud confirmed";
                        explanation = "LiDAR / 3D point-cloud modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "LiDAR / point-cloud modality not found";
                    }
                } else if (/image|photo|rgb/i.test(primary)) {
                    if (/image|photo|vision|rgb|png|jpg|jpeg|coco|yolo|vit\b|resnet|convnext|segmentation|detection|classification|ocr|scanned|receipt|invoice|document|donut|layoutlm|trocr|vqa|florence|qwen2[- ]?vl|pixel|visual/i.test(blob)) {
                        status = "SATISFIED";
                        evidence = "Image/Vision confirmed";
                        explanation = "Image modality confirmed";
                    } else {
                        status = "NOT_SATISFIED";
                        explanation = "Image modality not found";
                    }
                } else {
                    const hasGeneric = blob.includes(primary);
                    status = hasGeneric ? "SATISFIED" : "UNKNOWN";
                    evidence = hasGeneric ? primary : null;
                    explanation = hasGeneric ? `Modality "${primary}" confirmed` : "Modality presence uncertain";
                }

                m = { requirementId: req.id, status, evidence, confidence: status === "SATISFIED" ? 0.92 : status === "PARTIAL" ? 0.6 : 0, explanation };
                break;
            }

            // ── Task ─────────────────────────────────────────────────────────
            case "TASK": {
                const tasks = req.detectedValue.split(",").map((t) => t.trim().toLowerCase());
                let matched = 0;
                const evidenceParts: string[] = [];
                for (const task of tasks) {
                    const taskRe = new RegExp(`\\b${task.replace(/\s+/g, "\\s*")}\\b`, "i");
                    if (taskRe.test(blob) || taskRe.test(tags)) {
                        matched++;
                        evidenceParts.push(task);
                    }
                }
                const ratio = tasks.length > 0 ? matched / tasks.length : 0;
                m = {
                    requirementId: req.id,
                    status: ratio >= 0.8 ? "SATISFIED" : ratio >= 0.4 ? "PARTIAL" : tasks.length > 0 ? "NOT_SATISFIED" : "UNKNOWN",
                    evidence: evidenceParts.length > 0 ? `Tasks found: ${evidenceParts.join(", ")}` : null,
                    confidence: ratio,
                    explanation: ratio > 0 ? `${matched}/${tasks.length} required tasks found in metadata` : "Required tasks not found in metadata",
                };
                break;
            }

            // ── Longitudinal ─────────────────────────────────────────────────
            case "LONGITUDINAL": {
                const isExplicitCrossSectional = /\bcross[- ]sectional\b|\bsingle[- ]timepoint\b|\bsingle[- ]visit\b|\bone[- ]time\s*snapshot\b/i.test(blob);
                if (isExplicitCrossSectional) {
                    m = {
                        requirementId: req.id,
                        status: "CONFLICT",
                        evidence: "Explicitly cross-sectional dataset",
                        confidence: 1.0,
                        explanation: "CONTRADICTION: Candidate metadata explicitly states 'cross-sectional' / single-timepoint structure, directly conflicting with the required longitudinal multi-timepoint data structure."
                    };
                    break;
                }
                const hasLong = /longitudinal|multi.?timepoint|follow.?up|visit|timepoint|serial\s*scan|repeat\s*scan|progression.*scan|longitudinal\s*cohort/i.test(blob);
                const inTitle = /longitudinal|follow.?up|multi.?time/i.test(title);
                m = {
                    requirementId: req.id,
                    status: inTitle ? "SATISFIED" : hasLong ? "PARTIAL" : "NOT_SATISFIED",
                    evidence: hasLong ? "Longitudinal keyword found" : null,
                    confidence: inTitle ? 0.95 : hasLong ? 0.65 : 0,
                    explanation: inTitle
                        ? "Longitudinal structure confirmed in title"
                        : hasLong
                        ? "Longitudinal data mentioned in description (not title)"
                        : "No evidence of longitudinal/multi-timepoint data structure",
                };
                break;
            }

            // ── Multimodal ────────────────────────────────────────────────────
            case "MULTIMODAL": {
                const hasImaging = /\bct\b|\bmri\b|imaging|scan|x.?ray/i.test(blob);
                const hasClinical = /clinical|tabular|ehr|demographic|biomarker|lab|spirometry/i.test(blob);
                const hasMultimodal = /multimodal|multi.?modal|fusion/i.test(blob);
                if ((hasImaging && hasClinical) || hasMultimodal) {
                    m = {
                        requirementId: req.id,
                        status: hasMultimodal ? "SATISFIED" : "PARTIAL",
                        evidence: hasMultimodal ? "Multimodal explicitly mentioned" : "Imaging + clinical keywords found",
                        confidence: hasMultimodal ? 0.85 : 0.6,
                        explanation: hasMultimodal
                            ? "Multimodal fusion explicitly mentioned"
                            : "Both imaging and clinical data present (fusion not explicitly confirmed)",
                    };
                } else {
                    m = {
                        requirementId: req.id,
                        status: "NOT_SATISFIED",
                        evidence: null,
                        confidence: 0,
                        explanation: "No evidence of multimodal CT + clinical data combination",
                    };
                }
                break;
            }

            // ── Clinical ──────────────────────────────────────────────────────
            case "CLINICAL": {
                const isExplicitlySynthetic = /\b(?:synthetic\s*(?:patient|data|dataset|cohort|images?)|in[- ]silico\s*(?:generated|patient|data)|diffusion[- ]generated\s*patient|artificially\s*synthesized)\b/i.test(blob);
                if (isExplicitlySynthetic) {
                    m = {
                        requirementId: req.id,
                        status: "CONFLICT",
                        evidence: "Explicitly synthetic / in-silico data",
                        confidence: 1.0,
                        explanation: "CONTRADICTION: Candidate is synthetic / simulated data, directly contradicting the requirement for real patient clinical cohort data."
                    };
                    break;
                }
                const hasClinical = /clinical|tabular|ehr|demographic|biomarker|lab\s*value|spirometry|questionnaire|patient\s*record/i.test(blob);
                m = {
                    requirementId: req.id,
                    status: hasClinical ? "SATISFIED" : "UNKNOWN",
                    evidence: hasClinical ? "Clinical/tabular data mentioned" : null,
                    confidence: hasClinical ? 0.7 : 0,
                    explanation: hasClinical
                        ? "Clinical metadata / tabular features found"
                        : "Clinical / tabular data presence not confirmed in metadata",
                };
                break;
            }

            // ── Target / Subject Anchor ────────────────────────────────────────
            case "TARGET": {
                const rawTargets = req.detectedValue
                    .split(/[;,]/)
                    .map((t) => t.trim().toLowerCase())
                    .filter((t) => t.length >= 2);

                let satisfiedGroups = 0;
                let titleHits = 0;
                const found: string[] = [];

                for (const t of rawTargets) {
                    const words = t.split(/\s+/).filter((w) => w.length >= 2);
                    const synPool = new Set<string>(words);
                    for (const w of words) {
                        for (const syn of DOMAIN_ANCHOR_SYNONYMS[w] || []) {
                            synPool.add(syn.toLowerCase());
                        }
                    }

                    const synList = Array.from(synPool);
                    const matchedInTitle = synList.some((s) => title.includes(s) || tags.includes(s));
                    const matchedInBlob = matchedInTitle || synList.some((s) => blob.includes(s));

                    if (matchedInTitle) titleHits++;
                    if (matchedInBlob) {
                        satisfiedGroups++;
                        found.push(t);
                    }
                }

                const ratio = rawTargets.length > 0 ? satisfiedGroups / rawTargets.length : 0;
                let status: RequirementSatisfaction;

                if (ratio >= 0.6 || (titleHits >= 1 && ratio >= 0.45)) {
                    status = "SATISFIED";
                } else if (satisfiedGroups >= 1) {
                    status = "PARTIAL";
                } else if (
                    candidate.type === "model" &&
                    /\b(?:yolov8|yolov9|yolov10|detr|segformer|swin|unetr|unet|vit|convnext|resnet|efficientnet|densenet|roberta|deberta|biobert|pubmedbert|legal-bert|bge-m3|wav2vec|hubert|whisper|tabnet|xgboost)\b/i.test(blob)
                ) {
                    // Transfer-learning foundation backbone for the target task
                    status = "PARTIAL";
                    found.push("transfer-learning backbone");
                } else {
                    status = "NOT_SATISFIED";
                }

                m = {
                    requirementId: req.id,
                    status,
                    evidence: found.length > 0 ? `Matched subject concepts: ${found.join(", ")}` : null,
                    confidence: status === "SATISFIED" ? Math.max(0.75, ratio) : status === "PARTIAL" ? Math.max(0.45, ratio) : 0,
                    explanation:
                        status !== "NOT_SATISFIED"
                            ? `${satisfiedGroups}/${rawTargets.length} core subject concepts matched (${found.join(", ")})`
                            : `Candidate does not match core problem subject (${rawTargets.join(", ")})`,
                };
                break;
            }

            // ── GPU / VRAM ─────────────────────────────────────────────────────
            case "GPU": {
                if (candidate.type !== "model") {
                    m = { requirementId: req.id, status: "UNKNOWN", evidence: null, confidence: 0, explanation: "GPU requirement only applies to models" };
                    break;
                }
                const limitGb = profile.gpuVramLimitGb ?? 12;
                const { estimatedGb, note, patchFeasible } = estimateModelVram(blob, candidate);
                if (estimatedGb === null) {
                    m = { requirementId: req.id, status: "UNKNOWN", evidence: null, confidence: 0, explanation: `VRAM requirements unknown (${note})` };
                } else if (estimatedGb <= limitGb) {
                    m = { requirementId: req.id, status: "SATISFIED", evidence: note, confidence: 0.8, explanation: `Estimated ${estimatedGb}GB VRAM ≤ ${limitGb}GB limit` };
                } else if (patchFeasible && estimatedGb <= limitGb * 2) {
                    m = {
                        requirementId: req.id,
                        status: "PARTIAL",
                        evidence: note,
                        confidence: 0.5,
                        explanation: `Model needs ~${estimatedGb}GB; feasible with patch-based inference / mixed precision at ${limitGb}GB`,
                    };
                } else {
                    m = {
                        requirementId: req.id,
                        status: "NOT_SATISFIED",
                        evidence: note,
                        confidence: 0.9,
                        explanation: `Model requires ~${estimatedGb}GB VRAM — exceeds ${limitGb}GB limit even with optimization`,
                    };
                }
                break;
            }

            // ── Class imbalance, Missing data, Pretraining, Population ────────
            case "CLASS_IMBALANCE": {
                const has = /imbalance|imbalanced|class\s*weight|smote|oversampling|undersampling|focal\s*loss|weighted/i.test(blob);
                m = { requirementId: req.id, status: has ? "PARTIAL" : "UNKNOWN", evidence: has ? "Imbalance handling mentioned" : null, confidence: has ? 0.55 : 0, explanation: has ? "Class imbalance handling found in description" : "Class imbalance handling not verified" };
                break;
            }

            case "MISSING_DATA": {
                const has = /missing|imputation|incomplete|mask.*missing|nan|null\s*value/i.test(blob);
                m = { requirementId: req.id, status: has ? "PARTIAL" : "UNKNOWN", evidence: has ? "Missing data handling mentioned" : null, confidence: has ? 0.5 : 0, explanation: has ? "Missing data handling mentioned" : "Missing data handling not verified in metadata" };
                break;
            }

            case "PRETRAINING": {
                const has = /pretrained|checkpoint|weights|transfer\s*learning|fine.?tun/i.test(blob);
                m = { requirementId: req.id, status: has ? "SATISFIED" : "UNKNOWN", evidence: has ? "Pretrained checkpoint mentioned" : null, confidence: has ? 0.75 : 0, explanation: has ? "Pretrained weights available" : "Pretraining availability not confirmed" };
                break;
            }

            case "POPULATION":
            case "TEMPORAL":
            case "DATA_SIZE":
            case "LABEL_AVAILABILITY":
            case "COMPUTE":
            case "OTHER":
            default:
                m = matchGenericRequirement(candidate, req, blob);
                break;
        }

        matches.push(m);
    }

    return matches;
}

/**
 * Compute weighted requirement coverage score (0–100).
 * SATISFIED = full weight, PARTIAL = 50%, NOT_SATISFIED / CONFLICT = 0%, UNKNOWN = 0%.
 */
export function computeRequirementCoverage(
    matches: RequirementMatch[],
    profile: RequirementProfile
): number {
    if (matches.length === 0 || profile.requirements.length === 0) return 50;
    let weighted = 0;
    let totalWeight = 0;
    for (const match of matches) {
        const req = profile.requirements.find((r) => r.id === match.requirementId);
        if (!req) continue;
        const w = req.weight;
        totalWeight += w;
        if (match.status === "SATISFIED") weighted += w * 1.0;
        else if (match.status === "PARTIAL") weighted += w * 0.5;
        else if (match.status === "UNKNOWN") weighted += w * 0.1; // slight credit for unknown vs explicit miss
        // CONFLICT and NOT_SATISFIED = 0
    }
    return totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 50;
}

/**
 * Compute hard constraint satisfaction score (0–100).
 * Returns 0 if any CRITICAL hard requirement is CONFLICT or NOT_SATISFIED.
 */
export function computeHardConstraintScore(
    matches: RequirementMatch[],
    profile: RequirementProfile
): number {
    const hardMatches = matches.filter((m) => profile.hardRequirementIds.includes(m.requirementId));
    if (hardMatches.length === 0) return 100;

    let violations = 0;
    let criticalViolations = 0;
    for (const m of hardMatches) {
        const req = profile.requirements.find((r) => r.id === m.requirementId);
        const isCritical = req?.importance === "CRITICAL";
        if (m.status === "CONFLICT" || m.status === "NOT_SATISFIED") {
            violations++;
            if (isCritical) criticalViolations++;
        }
    }
    if (criticalViolations >= 2) return 0;
    if (criticalViolations === 1) return 20;
    if (violations >= 2) return 40;
    if (violations === 1) return 60;
    return 100;
}
