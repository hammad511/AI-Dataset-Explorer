import { HardwareEstimate, NormalizedDataset, NormalizedModel } from '../../schemas/types';

export function estimateHardware(ds: NormalizedDataset | null, mod: NormalizedModel | null, task: string, modality: string): HardwareEstimate {
    let sizeGB = 1.0;
    if (ds && ds.sizeBytes) {
        sizeGB = ds.sizeBytes / (1024 * 1024 * 1024);
    }

    const taskLower = task.toLowerCase();
    const modLower = modality.toLowerCase();

    let isVideo = modLower.includes('video') || modLower.includes('3d');
    let isLLM = modLower.includes('text') || taskLower.includes('generation');
    let isVision = modLower.includes('image') || taskLower.includes('segment') || taskLower.includes('detect');
    let isTabular = modLower.includes('tabular') || modLower.includes('time-series') || modLower.includes('structured');

    let gpuClass = "Standard 8GB Desktop GPU / Base Colab";
    let vram = "8 GB";
    let ramMin = "16 GB";
    let ramRec = "32 GB";
    let workingSpaceStr = `${Math.ceil(sizeGB * 2.5)} GB`;
    let cloud = "AWS g4dn.xlarge (T4) / GCP n1-standard-4 + T4";

    if (isVideo) {
        gpuClass = "High-End Multi-GPU or Professional Ampere";
        vram = "24 GB - 48 GB";
        ramMin = "32 GB";
        ramRec = "128 GB";
        workingSpaceStr = `${Math.ceil(sizeGB * 4)} GB`;
        cloud = "AWS p3.2xlarge (V100) / p4d.24xlarge (A100) / RunPod A6000";
    } else if (isLLM) {
        gpuClass = "Heavy Server GPU (Ampere/Hopper)";
        vram = "16 GB - 40 GB";
        ramMin = "32 GB";
        ramRec = "64 GB";
        workingSpaceStr = `${Math.ceil(sizeGB * 3)} GB`;
        cloud = "AWS g5.2xlarge (A10g) / GCP a2-highgpu-1g (A100)";
    } else if (isVision) {
        gpuClass = "Mid-to-High Desktop GPU";
        vram = "12 GB - 24 GB";
        ramMin = "16 GB";
        ramRec = "32 GB";
        workingSpaceStr = `${Math.ceil(sizeGB * 3)} GB`;
        cloud = "AWS g4dn.xlarge (T4) / Paperspace RTX 4000";
    } else if (isTabular) {
        gpuClass = "CPU / Lightweight GPU Inference";
        vram = "4 GB - 8 GB";
        ramMin = "8 GB";
        ramRec = "16 GB";
        workingSpaceStr = `${Math.ceil(sizeGB * 1.5)} GB`;
        cloud = "AWS c5.xlarge (CPU Optimized)";
    }

    return {
        gpu: {
            recommendedClass: gpuClass,
            vramRequirement: vram
        },
        ram: {
            minimum: ramMin,
            recommended: ramRec
        },
        storage: {
            dataset: `${sizeGB.toFixed(2)} GB`,
            workingSpace: workingSpaceStr
        },
        cloudAlternative: cloud
    };
}
