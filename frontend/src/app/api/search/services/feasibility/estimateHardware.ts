import { HardwareEstimate, NormalizedDataset, NormalizedModel } from '../../schemas/types';

export function estimateHardware(
    ds: NormalizedDataset | null,
    mod: NormalizedModel | null,
    task: string,
    modality: string
): HardwareEstimate {
    // Dataset size in GB — default 2 GB if unknown
    let sizeGB = 2.0;
    if (ds && ds.sizeBytes && ds.sizeBytes > 0) {
        sizeGB = ds.sizeBytes / (1024 * 1024 * 1024);
    }

    const taskLower  = task.toLowerCase();
    const modLower   = modality.toLowerCase();

    // Task categories
    const isDetection    = taskLower.includes('detect') || taskLower.includes('track') || taskLower.includes('count');
    const isSegmentation = taskLower.includes('segment');
    const isVideoStream  = (modLower.includes('video') || modLower.includes('3d')) && !isDetection && !isSegmentation;
    const isVideoDetect  = (modLower.includes('video') || modLower.includes('cctv') || modLower.includes('surveillance')) && (isDetection || isSegmentation);
    const isLargeVision  = modLower.includes('image') && isSegmentation;
    const isVision       = modLower.includes('image') || isDetection;
    const isLLM          = modLower.includes('text') || taskLower.includes('generation') || taskLower.includes('language model');
    const isTabular      = modLower.includes('tabular') || modLower.includes('time-series') || modLower.includes('structured') || modLower.includes('csv');

    // Storage working space = dataset size * multiplier for preprocessing/augmentation
    const storageMultiplier = isVideoStream ? 5 : isVideoDetect ? 3 : isVision ? 2.5 : isLLM ? 3 : 2;
    const workingGB = Math.max(4, Math.ceil(sizeGB * storageMultiplier));
    const datasetSizeStr = sizeGB < 0.01 ? '<0.01 GB' : sizeGB.toFixed(2) + ' GB';

    // ── Video Detection / Tracking (YOLO, RT-DETR on video frames) ───────────
    // e.g. CCTV vehicle detection — processes frame-by-frame, single GPU is sufficient
    if (isVideoDetect) {
        return {
            gpu: {
                recommendedClass: 'NVIDIA RTX 3080 / RTX 4080 (16 GB) or cloud T4',
                vramRequirement: '10 GB - 16 GB',
            },
            ram: { minimum: '16 GB', recommended: '32 GB' },
            storage: { dataset: datasetSizeStr, workingSpace: workingGB + ' GB' },
            cloudAlternative: 'AWS g4dn.xlarge (T4 16GB) / Paperspace A4000 / Colab Pro A100',
        };
    }

    // ── Large-Scale Video Generation / 3D (not detection) ────────────────────
    if (isVideoStream) {
        return {
            gpu: {
                recommendedClass: 'NVIDIA RTX 4090 / A6000 or multi-GPU setup',
                vramRequirement: '24 GB - 48 GB',
            },
            ram: { minimum: '32 GB', recommended: '64 GB' },
            storage: { dataset: datasetSizeStr, workingSpace: workingGB + ' GB' },
            cloudAlternative: 'AWS p3.2xlarge (V100 32GB) / RunPod A6000 / Lambda A100',
        };
    }

    // ── Segmentation (U-Net, Mask R-CNN, SegFormer) ───────────────────────────
    if (isLargeVision) {
        return {
            gpu: {
                recommendedClass: 'NVIDIA RTX 3090 / RTX 4080 (16 GB)',
                vramRequirement: '16 GB - 24 GB',
            },
            ram: { minimum: '16 GB', recommended: '32 GB' },
            storage: { dataset: datasetSizeStr, workingSpace: workingGB + ' GB' },
            cloudAlternative: 'AWS g5.xlarge (A10G 24GB) / Paperspace RTX 4000',
        };
    }

    // ── LLM / Text Generation (BERT, GPT-style fine-tuning) ──────────────────
    if (isLLM) {
        return {
            gpu: {
                recommendedClass: 'NVIDIA RTX 4090 (24 GB) or A10G',
                vramRequirement: '16 GB - 40 GB',
            },
            ram: { minimum: '32 GB', recommended: '64 GB' },
            storage: { dataset: datasetSizeStr, workingSpace: workingGB + ' GB' },
            cloudAlternative: 'AWS g5.2xlarge (A10G) / GCP a2-highgpu-1g (A100)',
        };
    }

    // ── Image Classification / Object Detection (ResNet, EfficientNet, YOLO) ──
    if (isVision) {
        return {
            gpu: {
                recommendedClass: 'NVIDIA RTX 3070 / RTX 4070 (8-12 GB)',
                vramRequirement: '8 GB - 12 GB',
            },
            ram: { minimum: '16 GB', recommended: '32 GB' },
            storage: { dataset: datasetSizeStr, workingSpace: workingGB + ' GB' },
            cloudAlternative: 'AWS g4dn.xlarge (T4) / Paperspace RTX 4000 / Colab T4',
        };
    }

    // ── Tabular / Time-Series (XGBoost, LightGBM, LSTM) ──────────────────────
    if (isTabular) {
        return {
            gpu: {
                recommendedClass: 'CPU sufficient / NVIDIA GTX 1660 for acceleration',
                vramRequirement: '4 GB - 8 GB (optional)',
            },
            ram: { minimum: '8 GB', recommended: '16 GB' },
            storage: { dataset: datasetSizeStr, workingSpace: workingGB + ' GB' },
            cloudAlternative: 'AWS c5.xlarge (CPU) / GCP n1-standard-4',
        };
    }

    // ── Default fallback ──────────────────────────────────────────────────────
    return {
        gpu: {
            recommendedClass: 'NVIDIA RTX 3070 / T4 (8 GB) — general purpose',
            vramRequirement: '8 GB',
        },
        ram: { minimum: '16 GB', recommended: '32 GB' },
        storage: { dataset: datasetSizeStr, workingSpace: workingGB + ' GB' },
        cloudAlternative: 'AWS g4dn.xlarge (T4) / Google Colab Pro',
    };
}