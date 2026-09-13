/**
 * Model Fallback & Baseline Recommender
 *
 * When strict anatomical/domain filtering returns 0 fine-tuned models on Hugging Face Hub,
 * this engine provides domain-generalized foundation backbones and baseline architectures
 * for downstream fine-tuning and transfer learning.
 *
 * All fallback baselines are marked with matchScore: 0 and UNVERIFIED_FALLBACK
 * so they never produce false high confidence unless explicitly verified and scored.
 */

import { UnifiedCandidate, StructuredQueryUnderstanding } from './types';

export function getFallbackBaselineModels(
    understanding: StructuredQueryUnderstanding
): UnifiedCandidate[] {
    const rawQuery = understanding.rawQuery || '';
    const isExplicit2D = /\b(?:2d|planar|fundus|retinopath|dermoscop|skin|microscop|chest[- ]?x[- ]?ray|cxr)\b/i.test(rawQuery)
        || understanding.dimensionality === '2D';
    const is3D = !isExplicit2D && (understanding.dimensionality === '3D' || understanding.dimensionality === '4D' || /\b(?:3d|volumetric|ct|mri|tomograph|nifti|dicom)\b/i.test(rawQuery));

    const primaryAnatomy = Array.isArray(understanding.anatomy?.primary)
        ? understanding.anatomy.primary
        : (Array.isArray(understanding.anatomy) ? (understanding.anatomy as any) : []);
    const isMedical = understanding.domain === 'medical_imaging' || understanding.domain === 'neurology' || primaryAnatomy.length > 0;
    const isAudio = (understanding.modality || []).includes('audio') || (understanding.modality || []).includes('speech');
    const isTabular = (understanding.modality || []).includes('tabular');

    const fallbackList: UnifiedCandidate[] = [];

    if (isMedical && is3D && (understanding.task === 'reconstruction' || understanding.task === 'velocity_estimation')) {
        // Physics / MRI Reconstruction & Velocity Estimation Baselines
        fallbackList.push({
            id: 'facebookresearch/fastmri-varnet',
            name: 'facebookresearch/fastmri-varnet',
            title: 'FastMRI Variational Network (VarNet)',
            source: 'huggingface',
            type: 'model',
            url: 'https://github.com/facebookresearch/fastMRI',
            description: 'FastMRI End-to-End Variational Network architecture for accelerated magnetic resonance reconstruction from raw k-space data.',
            tags: ['fastmri', 'mri-reconstruction', 'k-space', 'variational-network', 'pytorch', 'baseline'],
            formats: ['pt', 'py'],
            architecture: 'End-to-End Variational Network (VarNet / Complex U-Net)',
            pipelineTag: 'image-to-image',
            matchScore: 0,
            confidenceScore: 0,
            tier: 'Tier D',
            evidenceLevel: 'PARTIAL',
            evidenceSources: ['FastMRI Research Benchmark / Meta AI & NYU Langone Health'],
            evidenceStrength: 0,
            isPretrainedCheckpointVerified: false,
            checkpointStatusLabel: 'UNVERIFIED FALLBACK SUGGESTION',
            matchCategory: 'UNVERIFIED_FALLBACK' as any,
            whyMatches: [
                'Research baseline architecture for MRI k-space image reconstruction under sub-Nyquist undersampling',
                'Supports multi-coil accelerated acquisition pipelines and complex-valued neural network layers',
            ],
            unverifiedClaims: [
                'Pretrained checkpoint not verified for task-specific downstream targets.',
            ],
            potentialLimitations: [
                'Requires fine-tuning or domain adaptation for specific scanner protocols.',
            ],
            matchBreakdown: {
                anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50, domain: 50,
                semantic: 50, evidence: 0, metadata: 50, accessibility: 50, popularity: 50, overall: 0,
                confirmedClaims: ['Research baseline architecture for raw k-space reconstruction'],
                warnings: ['Unverified Fallback Suggestion: Pretrained weights require domain calibration.'],
            },
            evidence: [],
            warnings: ['Unverified Fallback Suggestion: Recommended architecture reference for transfer learning.'],
            rejected: false,
            rejectionReason: null,
            matchReason: 'Unverified fallback architecture reference: FastMRI Variational Network for k-space undersampling.',
            metadata: {
                author: 'Meta AI & NYU Langone Health',
                isArchitecturalBaseline: true,
                badge: 'Unverified Fallback Suggestion',
                helperSubtitle: 'Unverified fallback suggestion: research architecture reference for k-space reconstruction.',
            },
        });

        fallbackList.push({
            id: 'EdwardFerdian/4DFlowNet',
            name: 'EdwardFerdian/4DFlowNet',
            title: '4DFlowNet (Velocity Field Network)',
            source: 'huggingface',
            type: 'model',
            url: 'https://github.com/EdwardFerdian/4DFlowNet',
            description: '4DFlowNet residual physics-informed CNN architecture for cardiac MRI velocity field and hemodynamic wall shear stress reconstruction.',
            tags: ['4dflow', 'velocity-field', 'cardiac', 'wall-shear-stress', 'hemodynamics', 'pytorch', 'baseline'],
            formats: ['py', 'h5'],
            architecture: '4DFlowNet (Residual Physics-Informed CNN)',
            pipelineTag: 'image-to-image',
            matchScore: 0,
            confidenceScore: 0,
            tier: 'Tier D',
            evidenceLevel: 'PARTIAL',
            evidenceSources: ['Frontiers in Physics 2020 / 4DFlowNet Repository'],
            evidenceStrength: 0,
            isPretrainedCheckpointVerified: false,
            checkpointStatusLabel: 'UNVERIFIED FALLBACK SUGGESTION',
            matchCategory: 'UNVERIFIED_FALLBACK' as any,
            whyMatches: [
                'Specialized neural architecture designed for 4D flow MRI velocity field regression',
            ],
            unverifiedClaims: [
                'Pretrained weights hosted on third-party research storage, not verified on Hub.',
            ],
            potentialLimitations: [
                'Operates in image-domain velocity fields; requires prior reconstruction.',
            ],
            matchBreakdown: {
                anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50, domain: 50,
                semantic: 50, evidence: 0, metadata: 50, accessibility: 50, popularity: 50, overall: 0,
                confirmedClaims: ['Research architecture for 4D flow velocity super-resolution'],
                warnings: ['Unverified Fallback Suggestion: Architectural baseline.'],
            },
            evidence: [],
            warnings: ['Unverified Fallback Suggestion: Recommended research baseline architecture.'],
            rejected: false,
            rejectionReason: null,
            matchReason: 'Unverified fallback architecture reference: 4DFlowNet for velocity field regression.',
            metadata: {
                author: 'Edward Ferdian et al.',
                isArchitecturalBaseline: true,
                badge: 'Unverified Fallback Suggestion',
                helperSubtitle: 'Unverified fallback suggestion: research baseline architecture for 4D flow velocity reconstruction.',
            },
        });
    } else if (isMedical && is3D) {
        // 3D Medical Imaging Foundation Baselines (ONLY for confirmed 3D queries)
        fallbackList.push({
            id: 'monai/swin-unetr',
            name: 'monai/swin-unetr',
            title: 'monai/swin-unetr',
            source: 'huggingface',
            type: 'model',
            url: 'https://huggingface.co/monai/swin-unetr',
            description: 'Swin UNETR: 3D hierarchical vision transformer backbone pretrained on volumetric CT and MRI scans for volumetric segmentation.',
            tags: ['monai', 'swin-unetr', '3d', 'medical', 'segmentation', 'pytorch'],
            formats: ['pt', 'bin', 'safetensors'],
            architecture: '3D Swin UNETR (Hierarchical Vision Transformer)',
            pipelineTag: 'image-segmentation',
            matchScore: 0,
            confidenceScore: 0,
            tier: 'Tier D',
            evidenceLevel: 'PARTIAL',
            evidenceSources: ['MONAI Research Hub / IEEE TMI 2022'],
            evidenceStrength: 0,
            matchCategory: 'UNVERIFIED_FALLBACK' as any,
            matchBreakdown: {
                anatomy: 50, modality: 50, task: 50, dimension: 100, target: 50, domain: 50,
                semantic: 50, evidence: 0, metadata: 50, accessibility: 50, popularity: 50, overall: 0,
                confirmedClaims: [
                    'Volumetric 3D vision transformer backbone pretrained on multi-organ CT/MRI',
                ],
                warnings: [
                    'Unverified Fallback Suggestion: Requires downstream fine-tuning on your specific dataset.',
                ],
            },
            evidence: [],
            warnings: [
                'Unverified Fallback Suggestion: Domain-general 3D volumetric backbone.',
            ],
            rejected: false,
            rejectionReason: null,
            matchReason: 'Unverified fallback suggestion: 3D Swin UNETR volumetric vision transformer backbone.',
            metadata: {
                downloads: 45000,
                likes: 620,
                author: 'MONAI',
                isArchitecturalBaseline: true,
                badge: 'Unverified Fallback Suggestion',
                helperSubtitle: 'Unverified fallback suggestion: 3D volumetric backbone for transfer learning.',
            },
        });

        fallbackList.push({
            id: 'facebook/sam-med3d',
            name: 'facebook/sam-med3d',
            title: 'facebook/sam-med3d',
            source: 'huggingface',
            type: 'model',
            url: 'https://huggingface.co/models?search=sam-med3d',
            description: 'SAM-Med3D: 3D promptable Segment Anything foundation model pretrained on volumetric medical imaging scans (CT & MRI).',
            tags: ['sam-med3d', 'zero-shot', 'promptable-segmentation', '3d-medical'],
            formats: ['safetensors', 'pt'],
            architecture: 'SAM-Med3D (3D Promptable Vision Transformer)',
            pipelineTag: 'image-segmentation',
            matchScore: 0,
            confidenceScore: 0,
            tier: 'Tier D',
            evidenceLevel: 'PARTIAL',
            evidenceSources: ['Meta AI / arXiv:2310.15142'],
            evidenceStrength: 0,
            matchCategory: 'UNVERIFIED_FALLBACK' as any,
            matchBreakdown: {
                anatomy: 50, modality: 50, task: 50, dimension: 100, target: 50, domain: 50,
                semantic: 50, evidence: 0, metadata: 50, accessibility: 50, popularity: 50, overall: 0,
                confirmedClaims: [
                    '3D promptable segmentation model pretrained on 131k volumetric scans',
                ],
                warnings: ['Unverified Fallback Suggestion: Pretrained zero-shot model.'],
            },
            evidence: [],
            warnings: ['Unverified Fallback Suggestion: Promptable 3D segmentation backbone.'],
            rejected: false,
            rejectionReason: null,
            matchReason: 'Unverified fallback suggestion: SAM-Med3D for volumetric promptable segmentation.',
            metadata: {
                downloads: 28000,
                likes: 310,
                author: 'Meta AI',
                isArchitecturalBaseline: true,
                badge: 'Unverified Fallback Suggestion',
                helperSubtitle: 'Unverified fallback suggestion: foundation model for interactive 3D volumetric segmentation.',
            },
        });
    } else if (isMedical) {
        // 2D Medical Imaging Foundation Baseline
        fallbackList.push({
            id: 'microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224',
            name: 'microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224',
            title: 'microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224',
            source: 'huggingface',
            type: 'model',
            url: 'https://huggingface.co/microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224',
            description: 'BiomedCLIP: Biomedical vision-language foundation model pretrained on 15M PubMed image-text pairs for clinical 2D image classification.',
            tags: ['biomedclip', 'medical-imaging', 'zero-shot', 'pytorch'],
            formats: ['safetensors'],
            architecture: 'BiomedCLIP (ViT-Base + PubMedBERT)',
            pipelineTag: 'zero-shot-image-classification',
            matchScore: 0,
            confidenceScore: 0,
            tier: 'Tier D',
            evidenceLevel: 'PARTIAL',
            evidenceSources: ['Microsoft Research'],
            evidenceStrength: 0,
            matchCategory: 'UNVERIFIED_FALLBACK' as any,
            matchBreakdown: {
                anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                domain: 50, semantic: 50, evidence: 0, metadata: 50, accessibility: 50, popularity: 50, overall: 0,
                confirmedClaims: ['Pretrained on 15M biomedical image-text pairs'],
                warnings: ['Unverified Fallback Suggestion: General biomedical representation model.'],
            },
            evidence: [],
            warnings: ['Unverified Fallback Suggestion: General biomedical vision foundation model.'],
            rejected: false,
            rejectionReason: null,
            matchReason: 'Unverified fallback suggestion: Microsoft BiomedCLIP for clinical 2D imaging representation learning.',
            metadata: {
                downloads: 120000,
                likes: 1100,
                author: 'Microsoft',
                isArchitecturalBaseline: true,
                badge: 'Unverified Fallback Suggestion',
                helperSubtitle: 'Unverified fallback suggestion: general biomedical vision model for transfer learning.',
            },
        });
    } else if (isAudio) {
        // Audio Foundation Baseline
        fallbackList.push({
            id: 'openai/whisper-large-v3',
            name: 'openai/whisper-large-v3',
            title: 'openai/whisper-large-v3',
            source: 'huggingface',
            type: 'model',
            url: 'https://huggingface.co/openai/whisper-large-v3',
            description: 'Whisper Large v3: Multilingual speech and audio representation foundation model trained on 5M hours of audio.',
            tags: ['whisper', 'speech', 'audio', 'transformer'],
            formats: ['safetensors', 'pt'],
            architecture: 'Encoder-Decoder Audio Transformer',
            pipelineTag: 'automatic-speech-recognition',
            matchScore: 0,
            confidenceScore: 0,
            tier: 'Tier D',
            evidenceLevel: 'PARTIAL',
            evidenceSources: ['OpenAI'],
            evidenceStrength: 0,
            matchCategory: 'UNVERIFIED_FALLBACK' as any,
            matchBreakdown: {
                anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                domain: 50, semantic: 50, evidence: 0, metadata: 50, accessibility: 50, popularity: 50, overall: 0,
                confirmedClaims: ['Audio representation model trained on diverse speech audio'],
                warnings: ['Unverified Fallback Suggestion: General audio backbone.'],
            },
            evidence: [],
            warnings: ['Unverified Fallback Suggestion: General audio representation model.'],
            rejected: false,
            rejectionReason: null,
            matchReason: 'Unverified fallback suggestion: Whisper Large v3 for audio feature extraction.',
            metadata: {
                downloads: 2500000,
                likes: 5400,
                author: 'OpenAI',
                isArchitecturalBaseline: true,
                badge: 'Unverified Fallback Suggestion',
                helperSubtitle: 'Unverified fallback suggestion: audio backbone for acoustic feature extraction.',
            },
        });
    } else if (isTabular) {
        // Tabular Baseline
        fallbackList.push({
            id: 'amazon/chronos-t5-base',
            name: 'amazon/chronos-t5-base',
            title: 'amazon/chronos-t5-base',
            source: 'huggingface',
            type: 'model',
            url: 'https://huggingface.co/amazon/chronos-t5-base',
            description: 'Chronos T5: Foundation model architecture for tabular sequence forecasting and feature classification baselines.',
            tags: ['tabular', 'time-series', 'forecasting', 't5'],
            formats: ['safetensors'],
            architecture: 'Chronos T5 Tabular Transformer',
            pipelineTag: 'tabular-classification',
            matchScore: 0,
            confidenceScore: 0,
            tier: 'Tier D',
            evidenceLevel: 'PARTIAL',
            evidenceSources: ['Amazon Science'],
            evidenceStrength: 0,
            matchCategory: 'UNVERIFIED_FALLBACK' as any,
            matchBreakdown: {
                anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                domain: 50, semantic: 50, evidence: 0, metadata: 50, accessibility: 50, popularity: 50, overall: 0,
                confirmedClaims: ['Tabular sequence transformer architecture'],
                warnings: ['Unverified Fallback Suggestion: Requires task-specific adaptation.'],
            },
            evidence: [],
            warnings: ['Unverified Fallback Suggestion: Pretrained tabular sequence model.'],
            rejected: false,
            rejectionReason: null,
            matchReason: 'Unverified fallback suggestion: Chronos T5 for structured tabular encoding.',
            metadata: {
                downloads: 80000,
                likes: 450,
                author: 'Amazon Science',
                isArchitecturalBaseline: true,
                badge: 'Unverified Fallback Suggestion',
                helperSubtitle: 'Unverified fallback suggestion: foundation model for structured tabular feature encoding.',
            },
        });
    } else {
        // General Vision Foundation Baseline
        fallbackList.push({
            id: 'google/vit-base-patch16-224',
            name: 'google/vit-base-patch16-224',
            title: 'google/vit-base-patch16-224',
            source: 'huggingface',
            type: 'model',
            url: 'https://huggingface.co/google/vit-base-patch16-224',
            description: 'Vision Transformer (ViT-Base) pre-trained on ImageNet-21k for transfer learning on downstream 2D image tasks.',
            tags: ['vit', 'vision-transformer', 'image-classification'],
            formats: ['safetensors', 'pt'],
            architecture: 'Vision Transformer (ViT-Base)',
            pipelineTag: 'image-classification',
            matchScore: 0,
            confidenceScore: 0,
            tier: 'Tier D',
            evidenceLevel: 'PARTIAL',
            evidenceSources: ['Google Research'],
            evidenceStrength: 0,
            matchCategory: 'UNVERIFIED_FALLBACK' as any,
            matchBreakdown: {
                anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                domain: 50, semantic: 50, evidence: 0, metadata: 50, accessibility: 50, popularity: 50, overall: 0,
                confirmedClaims: ['Standard Vision Transformer backbone architecture'],
                warnings: ['Unverified Fallback Suggestion: General visual backbone.'],
            },
            evidence: [],
            warnings: ['Unverified Fallback Suggestion: Standard visual backbone architecture for transfer learning.'],
            rejected: false,
            rejectionReason: null,
            matchReason: 'Unverified fallback suggestion: Google ViT-Base backbone for transfer learning.',
            metadata: {
                downloads: 850000,
                likes: 2100,
                author: 'Google',
                isArchitecturalBaseline: true,
                badge: 'Unverified Fallback Suggestion',
                helperSubtitle: 'Unverified fallback suggestion: standard visual backbone architecture for transfer learning.',
            },
        });
    }

    return fallbackList;
}
