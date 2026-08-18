import { NormalizedModel, ProjectSpec } from '../../schemas/types';

/**
 * Split a compound architecture string like "YOLOv8 + ByteTrack / RT-DETR"
 * into individual tokens for matching.
 */
function splitArchTokens(arch: string): string[] {
    return arch
        .toLowerCase()
        .split(/[\s+\/,|]+/)
        .map(t => t.trim())
        .filter(t => t.length > 1);
}

export function scoreModel(model: Partial<NormalizedModel>, spec: ProjectSpec): NormalizedModel {
    const mod = { ...model } as NormalizedModel;
    mod.scoreBreakdown = { task: 0, modality: 0, architecture: 0, benchmark: 0, efficiency: 0, popularity: 0 };
    mod.rejected = false;
    mod.rejectionReason = null;

    const taskText = Array.isArray(spec.task) ? spec.task.join(' ') : String(spec.task || '');
    const primaryArchText = String(spec.primary_architecture || '');
    const modalityText = String(spec.data_modality || '');

    const modelText = `${mod.name ?? ''} ${mod.task ?? ''} ${mod.architecture ?? ''}`.toLowerCase();
    const specTaskLower = taskText.toLowerCase();
    const specModalityLower = modalityText.toLowerCase();

    // Split compound architecture into individual tokens
    const primaryArchTokens = splitArchTokens(primaryArchText);
    const altArchTokens = (spec.alternative_architectures ?? []).flatMap(a => splitArchTokens(a));

    // Hard reject: project is NLP/text but model is a vision-only model
    const isTextProject = /(text|nlp|sentiment|document|language|review)/.test(specTaskLower);
    const isVisionOnlyModel = /^(yolo|detr|efficientdet|faster.?rcnn|convnext|vit|resnet|unet)/.test(modelText);
    if (isTextProject && isVisionOnlyModel) {
        mod.rejected = true;
        mod.rejectionReason = 'Vision-only architecture selected for a text/NLP task';
        mod.matchScore = 0;
        return mod;
    }

    // Name-based domain rejection for vision projects
    // Rejects models whose name contains clearly irrelevant domain keywords
    const modelNameLower = String(mod.name || mod.id || '').toLowerCase();
    const isVisionProject = /(detect|track|segment|classif|count)/.test(specTaskLower) && !isTextProject;
    if (isVisionProject) {
        const irrelevant = [/table.?extract/, /anime/, /face.?(detect|recog|swap|generat)/, /stock.?market|trading|finance/, /sentiment|product.?review/, /speech|whisper/, /depth.?estim/, /generat|diffusion|stable.?diff|inpaint/];
        const projectCtx = String(spec.domain||'').toLowerCase() + ' ' + String(spec.subdomain||'').toLowerCase() + ' ' + specTaskLower;
        const needsFace = /(face|pedestrian|person|human)/.test(projectCtx);
        if (!needsFace && irrelevant.some(re => re.test(modelNameLower))) {
            mod.rejected = true;
            mod.rejectionReason = 'Model name suggests unrelated domain: ' + modelNameLower.split('/').pop()?.slice(0, 40);
            mod.matchScore = 0;
            return mod;
        }
    }

    // Determine task intent categories
    const isDetectionTask = /(object detection|defect detection|bounding box|detect)/.test(specTaskLower);
    const isTrackingTask = /(tracking|mot|multi.?object)/.test(specTaskLower);
    const isSegmentationTask = /(segment)/.test(specTaskLower);
    const isClassificationTask = /(classification|classify)/.test(specTaskLower) && !isDetectionTask;
    const isForecastingTask = /(forecast|time.?series|temporal)/.test(specTaskLower);
    const isTabularTask = /(tabular|xgboost|lightgbm|regression)/.test(specTaskLower) || /(tabular|structured)/.test(specModalityLower);
    const candidateTaskLower = String(mod.task || '').toLowerCase();

    // TASK (30 pts)
    if (modelText.includes(specTaskLower)) {
        mod.scoreBreakdown.task = 30;
    } else if (isDetectionTask || isTrackingTask) {
        // object-detection models are valid for both detection and tracking tasks
        mod.scoreBreakdown.task = /(object.?detection|detection|yolo|detr|faster.?rcnn|rcnn)/.test(candidateTaskLower) ? 30 : 10;
    } else if (isSegmentationTask) {
        mod.scoreBreakdown.task = /(segment|mask|unet|panoptic)/.test(candidateTaskLower) ? 30 : 10;
    } else if (isClassificationTask && /(image|vision|mri|medical|radiology)/.test(specModalityLower)) {
        mod.scoreBreakdown.task = /(image.?classification|classification|vision)/.test(candidateTaskLower) ? 30 : 10;
    } else if (/(sentiment|review|text|document|nlp)/.test(specTaskLower)) {
        mod.scoreBreakdown.task = /(sentiment|review|text|document|nlp|classification)/.test(candidateTaskLower) ? 30 : 10;
    } else if (isForecastingTask) {
        mod.scoreBreakdown.task = /(forecast|time.?series|temporal)/.test(candidateTaskLower) ? 30 : 10;
    } else if (isTabularTask) {
        mod.scoreBreakdown.task = /(tabular|regression|classification|xgboost|lightgbm)/.test(candidateTaskLower) ? 30 : 10;
    } else {
        mod.scoreBreakdown.task = 10;
    }

    // MODALITY (20 pts)
    const modModalityLower = String(mod.modality || '').toLowerCase();
    if (modModalityLower === specModalityLower ||
        (specModalityLower.includes(modModalityLower) && modModalityLower.length > 2)) {
        mod.scoreBreakdown.modality = 20;
    } else if (specModalityLower.includes('video') && modModalityLower.includes('image')) {
        // video projects can use image-based models (frame-by-frame)
        mod.scoreBreakdown.modality = 15;
    } else {
        mod.scoreBreakdown.modality = 10;
    }

    // ARCHITECTURE (20 pts) — match any token from the compound primary arch
    if (primaryArchTokens.some(tok => tok.length > 1 && modelText.includes(tok))) {
        mod.scoreBreakdown.architecture = 20;
    } else if (altArchTokens.some(tok => tok.length > 1 && modelText.includes(tok))) {
        mod.scoreBreakdown.architecture = 15;
    } else {
        mod.scoreBreakdown.architecture = 5;
    }

    // BENCHMARK (15 pts)
    mod.scoreBreakdown.benchmark = (mod.benchmarkEvidence && mod.benchmarkEvidence.length > 0) ? 15 : 5;

    // EFFICIENCY (10 pts) — parameter count heuristic
    if (mod.parameters) {
        if (mod.parameters < 1_000_000_000) mod.scoreBreakdown.efficiency = 10;
        else if (mod.parameters < 7_000_000_000) mod.scoreBreakdown.efficiency = 7;
        else mod.scoreBreakdown.efficiency = 3;
    } else {
        mod.scoreBreakdown.efficiency = 5;
    }

    // POPULARITY (5 pts)
    if (mod.downloads && mod.downloads > 100_000) mod.scoreBreakdown.popularity = 5;
    else if (mod.downloads && mod.downloads > 1_000) mod.scoreBreakdown.popularity = 3;
    else mod.scoreBreakdown.popularity = 1;

    mod.matchScore = Math.min(100, Math.round(
        mod.scoreBreakdown.task +
        mod.scoreBreakdown.modality +
        mod.scoreBreakdown.architecture +
        mod.scoreBreakdown.benchmark +
        mod.scoreBreakdown.efficiency +
        mod.scoreBreakdown.popularity
    ));

    mod.matchReason = [
        `Task: ${mod.scoreBreakdown.task}/30`,
        `Arch: ${mod.scoreBreakdown.architecture}/20`,
        `Modality: ${mod.scoreBreakdown.modality}/20`,
    ].join(', ') + '.';

    return mod;
}
