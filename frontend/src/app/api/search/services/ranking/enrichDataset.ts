/**
 * Enriches a scored dataset with additional computed fields for the new UI features.
 * All computed values are labeled in the 'source' field of each enrichment.
 */

export interface DatasetRisk {
    level: 'Low' | 'Medium' | 'High';
    warnings: Array<{ code: string; message: string; details?: string }>;
}

export interface DatasetQualityAnalysis {
    classBalance: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
    annotationQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
    dataDiversity: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
    metadataQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
    splitQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
    documentationQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
    licenseAccessibility: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
    overallQuality: number; // 0-100, Calculated
}

export interface TrainabilityEstimate {
    cpuTraining: 'Possible' | 'Not Recommended' | 'Not Feasible';
    ram8gb: 'Yes' | 'Maybe' | 'No';
    ram16gb: 'Yes' | 'Recommended' | 'No';
    gpu: 'Required' | 'Recommended' | 'Optional';
    colabFree: 'Yes' | 'Maybe' | 'No';
    colabPro: 'Yes' | 'Recommended' | 'No';
    localTraining: 'Yes' | 'Maybe' | 'No';
    estimatedStorageGB: number | null;
    minimumRam: string;
    recommendedRam: string;
    recommendedGpu: string;
    difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
    difficultyScore: number; // 0-100, Calculated
}

export interface AccessibilityInfo {
    downloadAvailable: 'Available' | 'Restricted' | 'Requires Request' | 'Unknown';
    registrationRequired: 'Yes' | 'No' | 'Unknown';
    directAccess: 'Open' | 'Restricted' | 'Unknown';
    commercialUse: 'Allowed' | 'Restricted' | 'Unknown';
    licenseType: string;
}

export interface DatasetDifficultyLevel {
    level: 'Beginner' | 'Beginner–Intermediate' | 'Intermediate' | 'Advanced';
    score: number; // 0-100, Calculated
    explanation: string;
}

function qualityRating(score: number): 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown' {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    if (score >= 0)  return 'Poor';
    return 'Unknown';
}

export function analyzeDatasetRisk(dataset: any, project: any): DatasetRisk {
    const warnings: DatasetRisk['warnings'] = [];

    // Small dataset check
    const bytes = dataset.sizeBytes || 0;
    if (bytes > 0 && bytes < 5_000_000) {
        warnings.push({ code: 'SMALL_DATASET', message: 'Very small dataset', details: 'Dataset is under 5 MB which may be insufficient for training.' });
    } else if (bytes > 0 && bytes < 50_000_000) {
        warnings.push({ code: 'MODERATE_SIZE', message: 'Moderate dataset size', details: 'Dataset may be small for deep learning. Consider augmentation.' });
    }

    // License restrictions
    const lic = (dataset.license || '').toLowerCase();
    if (lic.includes('unknown') || !dataset.license) {
        warnings.push({ code: 'UNKNOWN_LICENSE', message: 'License unclear', details: 'Dataset license is not specified. Verify before commercial use.' });
    } else if (lic.includes('nc') || lic.includes('non-commercial') || lic.includes('noncommercial')) {
        warnings.push({ code: 'NONCOMMERCIAL', message: 'Non-commercial license restriction', details: 'This dataset may not be used for commercial applications.' });
    }

    // Missing metadata
    if (!dataset.description || dataset.description.length < 20) {
        warnings.push({ code: 'POOR_DOCS', message: 'Poor documentation', details: 'Dataset has minimal description or documentation.' });
    }

    // Low downloads may indicate limited community validation
    if (dataset.downloads !== null && dataset.downloads !== undefined && dataset.downloads < 50) {
        warnings.push({ code: 'LOW_USAGE', message: 'Low download count', details: 'Dataset has very few downloads — may lack community validation.' });
    }

    // Modality mismatch
    const projectMod = (project.data_modality || '').toLowerCase();
    const dsMod = (dataset.modality || '').toLowerCase();
    if (projectMod && dsMod && !dsMod.includes(projectMod.split('/')[0].trim()) && !projectMod.includes(dsMod.split('/')[0].trim())) {
        warnings.push({ code: 'MODALITY_MISMATCH', message: 'Potential modality mismatch', details: `Project requires ${project.data_modality} but dataset modality is ${dataset.modality}.` });
    }

    // Audio/speech specific checks — only warn for emotion/sentiment projects
    const isAudioProject = /(audio|speech|sound)/i.test(project.data_modality || '');
    const isEmotionProject = /(emotion|sentiment|affective|mood)/i.test(String(project.task || '') + ' ' + String(project.subdomain || ''));
    if (isAudioProject && isEmotionProject) {
        warnings.push({ code: 'ACTED_EMOTIONS', message: 'Likely contains acted/scripted recordings', details: 'Most public speech emotion datasets use professional actors. Real-world performance may be lower than benchmark accuracy. Verify recording conditions before use.' });
        warnings.push({ code: 'SPEAKER_INDEPENDENT', message: 'Speaker-independent split required', details: 'To avoid data leakage, ensure recordings from the same speaker do not appear in both training and test sets. This is critical for emotion recognition.' });
    }

    // Determine risk level
    const criticalCodes = ['MODALITY_MISMATCH', 'SMALL_DATASET'];
    const hasCritical = warnings.some(w => criticalCodes.includes(w.code));
    const level: DatasetRisk['level'] = hasCritical ? 'High' : warnings.length >= 3 ? 'Medium' : warnings.length >= 1 ? 'Medium' : 'Low';

    return { level, warnings };
}

export function analyzeDatasetQuality(dataset: any): DatasetQualityAnalysis {
    // License accessibility
    const lic = (dataset.license || '').toLowerCase();
    const licScore = !lic || lic === 'unknown' ? 30 :
        (lic.includes('cc0') || lic.includes('public domain') || lic.includes('mit') || lic.includes('apache')) ? 100 :
        (lic.includes('cc by') && !lic.includes('nc') && !lic.includes('nd')) ? 90 :
        (lic.includes('nc')) ? 50 : 70;

    // Metadata quality
    const hasDescription = (dataset.description || '').length > 30;
    const hasLicense = !!(dataset.license && dataset.license !== 'Unknown');
    const hasTags = (dataset.tags || []).length > 2;
    const hasCreator = !!(dataset.creator && dataset.creator !== 'Unknown');
    const metaScore = (hasDescription ? 30 : 0) + (hasLicense ? 30 : 0) + (hasTags ? 20 : 0) + (hasCreator ? 20 : 0);

    // Data diversity (approximated from tags/downloads)
    const downloads = dataset.downloads || 0;
    const diversityScore = downloads > 10000 ? 85 : downloads > 1000 ? 70 : downloads > 100 ? 55 : downloads > 0 ? 40 : 30;

    // Documentation quality
    const descLen = (dataset.description || '').length;
    const docScore = descLen > 500 ? 90 : descLen > 200 ? 75 : descLen > 50 ? 55 : descLen > 0 ? 35 : 10;

    // Overall quality: weighted average
    const overallQuality = Math.round(
        licScore * 0.20 + metaScore * 0.25 + diversityScore * 0.20 + docScore * 0.20 +
        (dataset.sizeBytes ? Math.min(100, (dataset.sizeBytes / 1_000_000_000) * 20 + 50) : 30) * 0.15
    );

    return {
        classBalance: 'Unknown', // cannot determine without class distribution data
        annotationQuality: 'Unknown', // cannot determine without annotation metadata
        dataDiversity: qualityRating(diversityScore),
        metadataQuality: qualityRating(metaScore),
        splitQuality: 'Unknown', // cannot determine without split metadata
        documentationQuality: qualityRating(docScore),
        licenseAccessibility: qualityRating(licScore),
        overallQuality,
    };
}

export function estimateTrainability(dataset: any, task: string, modality: string): TrainabilityEstimate {
    const sizeBytes = dataset?.sizeBytes || 0;
    const sizeGB = sizeBytes > 0 ? sizeBytes / (1024 * 1024 * 1024) : 2.0;
    const taskLower = task.toLowerCase();
    const modLower = modality.toLowerCase();

    const isAudio = /(audio|speech|sound)/.test(modLower);
    const isVideo = /(video|3d)/.test(modLower);
    const isImage = /(image|vision)/.test(modLower) && !isAudio;
    const isText = /(text|nlp)/.test(modLower);
    const isTabular = /(tabular|structured|csv)/.test(modLower);
    const isAdvancedModel = /(wav2vec|hubert|wavlm|bert|gpt|llm|transformer)/.test(taskLower);

    // suppress unused variable warning
    void isText;
    void isTabular;

    let difficultyScore = 40; // baseline
    if (isVideo) difficultyScore += 30;
    if (isAudio && isAdvancedModel) difficultyScore += 25;
    if (isImage) difficultyScore += 15;
    if (isAdvancedModel) difficultyScore += 20;
    if (sizeGB > 10) difficultyScore += 10;
    difficultyScore = Math.min(100, difficultyScore);

    const difficulty: TrainabilityEstimate['difficulty'] =
        difficultyScore < 40 ? 'Beginner' :
        difficultyScore < 65 ? 'Intermediate' : 'Advanced';

    const workingGB = Math.max(4, Math.ceil(sizeGB * (isVideo ? 5 : isAudio ? 2 : 2.5)));
    const estimatedStorageGB = Math.round(sizeGB + workingGB);

    return {
        cpuTraining: isVideo || (isAudio && isAdvancedModel) ? 'Not Recommended' : isImage ? 'Possible' : 'Possible',
        ram8gb: isVideo ? 'No' : 'Yes',
        ram16gb: isVideo ? 'No' : 'Recommended',
        gpu: isVideo || (isAudio && isAdvancedModel) ? 'Required' : isImage ? 'Recommended' : 'Optional',
        colabFree: isVideo ? 'Maybe' : 'Yes',
        colabPro: 'Yes',
        localTraining: sizeGB > 20 ? 'Maybe' : 'Yes',
        estimatedStorageGB,
        minimumRam: isVideo ? '32 GB' : isAudio ? '8 GB' : '8 GB',
        recommendedRam: isVideo ? '64 GB' : isAudio ? '16 GB' : isImage ? '16 GB' : '8 GB',
        recommendedGpu: isVideo ? 'NVIDIA RTX 4080+ or A100' : isAudio && isAdvancedModel ? 'NVIDIA T4 / RTX 3070+' : isImage ? 'NVIDIA T4 / RTX 3060+' : 'Any GPU or CPU',
        difficulty,
        difficultyScore,
    };
}

export function classifyDifficulty(dataset: any, task: string, modality: string, targetLabels: string[]): DatasetDifficultyLevel {
    const trainability = estimateTrainability(dataset, task, modality);
    const score = trainability.difficultyScore;
    const numClasses = targetLabels.length;

    let explanation = '';
    if (score < 40) {
        explanation = 'Beginner-friendly: standard tabular or simple classification task with small dataset and low preprocessing overhead.';
    } else if (score < 55) {
        explanation = `Beginner to intermediate: ${numClasses > 0 ? numClasses + ' classes' : 'classification task'} with manageable preprocessing. Google Colab Free is sufficient.`;
    } else if (score < 70) {
        explanation = `Intermediate: requires GPU training and preprocessing pipeline. ${numClasses > 5 ? 'Multiple classes increase complexity.' : ''}`;
    } else {
        explanation = 'Advanced: requires significant GPU resources, complex preprocessing, and likely pretrained model fine-tuning.';
    }

    return {
        level: score < 40 ? 'Beginner' : score < 55 ? 'Beginner–Intermediate' : score < 70 ? 'Intermediate' : 'Advanced',
        score,
        explanation,
    };
}

export function computeAccessibility(dataset: any): AccessibilityInfo {
    const lic = (dataset.license || '').toLowerCase();
    const licRaw = dataset.license || '';
    // Only mark as explicitly permissive if we have a recognised open license identifier
    const isExplicitlyPermissive = lic.includes('cc0') || lic.includes('public domain') ||
        lic.includes('mit') || lic.includes('apache') ||
        lic.includes('cc by 4') || lic.includes('cc-by-4') ||
        lic.includes('cc by 3') || lic.includes('cc-by-3');
    const isNonCommercial = lic.includes('nc') || lic.includes('non-commercial') || lic.includes('noncommercial');
    const isAmbiguous = !licRaw || lic === 'unknown' || lic === 'other' || lic.trim() === '';

    return {
        downloadAvailable: dataset.url ? 'Available' : 'Unknown',
        registrationRequired: dataset.source === 'Kaggle' ? 'Yes' : 'No',
        directAccess: isExplicitlyPermissive ? 'Open' : isAmbiguous ? 'Unknown' : 'Restricted',
        // IMPORTANT: Never claim "Allowed" unless license explicitly confirms it
        commercialUse: isNonCommercial ? 'Restricted' :
            isExplicitlyPermissive ? 'Unknown' :
            'Unknown',
        licenseType: licRaw || 'Not specified',
    };
}

export function computeSearchCoverage(rawKaggle: any[], rawHfDatasets: any[], rawHfModels: any[]) {
    return {
        kaggle: rawKaggle.length,
        huggingFaceDatasets: rawHfDatasets.length,
        huggingFaceModels: rawHfModels.length,
        total: rawKaggle.length + rawHfDatasets.length,
        note: 'Matching results retrieved — not an exhaustive search. Results deduplicated within each source.',
        bySource: [
            { source: 'Kaggle', label: 'Kaggle Datasets', count: rawKaggle.length, type: 'dataset', searched: true },
            { source: 'Hugging Face', label: 'HF Datasets', count: rawHfDatasets.length, type: 'dataset', searched: true },
            { source: 'Hugging Face', label: 'HF Models', count: rawHfModels.length, type: 'model', searched: true },
        ],
    };
}

export function analyzeDatasetCompatibility(datasets: any[]): Array<{ pair: string[]; compatibility: 'High' | 'Medium' | 'Low'; score: number; reason: string }> {
    const results = [];
    for (let i = 0; i < datasets.length; i++) {
        for (let j = i + 1; j < datasets.length; j++) {
            const a = datasets[i];
            const b = datasets[j];
            let score = 0;
            const reasons: string[] = [];

            // Same modality
            const modA = (a.modality || '').toLowerCase();
            const modB = (b.modality || '').toLowerCase();
            if (modA && modB && (modA.includes(modB.split('/')[0]) || modB.includes(modA.split('/')[0]))) {
                score += 30; reasons.push('same data modality');
            }

            // Same task domain (check tags/description overlap)
            const tagsA = (a.tags || []).join(' ').toLowerCase();
            const tagsB = (b.tags || []).join(' ').toLowerCase();
            const wordsA = new Set(tagsA.split(/\W+/).filter((w: string) => w.length > 3));
            const wordsB = tagsB.split(/\W+/).filter((w: string) => w.length > 3);
            const tagOverlap = wordsB.filter((w: string) => wordsA.has(w)).length;
            if (tagOverlap > 3) { score += 25; reasons.push('overlapping tags/keywords'); }
            else if (tagOverlap > 1) { score += 10; }

            // Same source platform
            if (a.source === b.source) { score += 10; reasons.push('same platform'); }

            // License compatibility
            const licA = (a.license || '').toLowerCase();
            const licB = (b.license || '').toLowerCase();
            const openA = licA.includes('cc') || licA.includes('open') || licA.includes('mit');
            const openB = licB.includes('cc') || licB.includes('open') || licB.includes('mit');
            if (openA && openB) { score += 15; reasons.push('both open-licensed'); }

            // Domain overlap
            if (a.domain && b.domain && a.domain.toLowerCase() === b.domain.toLowerCase()) {
                score += 20; reasons.push('same domain');
            }

            const compat: 'High' | 'Medium' | 'Low' = score >= 60 ? 'High' : score >= 35 ? 'Medium' : 'Low';
            results.push({
                pair: [a.name || a.id, b.name || b.id],
                compatibility: compat,
                score,
                reason: reasons.length > 0
                    ? (compat === 'High' ? 'High' : compat === 'Medium' ? 'Medium' : 'Low') + ' compatibility because ' + reasons.join(', ') + '.'
                    : 'Limited information available to assess compatibility.',
            });
        }
    }
    return results;
}

export function suggestLabelMapping(datasets: any[]): Array<{ from: string; to: string; dataset: string; confidence: 'High' | 'Medium' | 'Low' }> {
    // Common emotion label aliases
    const LABEL_ALIASES: Record<string, string> = {
        'happiness': 'happy', 'joy': 'happy', 'joyful': 'happy', 'delighted': 'happy',
        'sadness': 'sad', 'sorrow': 'sad', 'unhappy': 'sad', 'grief': 'sad',
        'anger': 'angry', 'rage': 'angry', 'furious': 'angry', 'mad': 'angry',
        'fear': 'fearful', 'scared': 'fearful', 'afraid': 'fearful', 'terror': 'fearful',
        'surprise': 'surprised', 'shock': 'surprised', 'astonished': 'surprised',
        'disgust': 'disgust', 'repulsion': 'disgust',
        'calm': 'neutral', 'boredom': 'neutral',
    };
    const suggestions = [];
    for (const ds of datasets) {
        const labels: string[] = ds.targetLabels || ds.target_labels || [];
        for (const label of labels) {
            const normalized = label.toLowerCase().trim();
            const canonical = LABEL_ALIASES[normalized];
            if (canonical && canonical !== normalized) {
                suggestions.push({
                    from: label,
                    to: canonical,
                    dataset: ds.name || ds.id || 'Unknown',
                    confidence: 'High' as const,
                });
            }
        }
    }
    return suggestions;
}

export function generateRecommendationCategories(datasets: any[], spec: any): Array<{ category: string; emoji: string; datasetId: string; reason: string }> {
    if (datasets.length === 0) return [];
    const nonRejected = datasets.filter(d => !d.rejected);
    if (nonRejected.length === 0) return [];

    const categories = [];
    const sorted = [...nonRejected].sort((a, b) => b.matchScore - a.matchScore);
    const best = sorted[0];

    // Best overall
    if (best) categories.push({ category: 'Best Overall', emoji: '🏆', datasetId: best.id || best.name, reason: 'Highest combined match score across all criteria.' });

    // Best task match
    const bestTask = [...nonRejected].sort((a, b) => (b.scoreBreakdown?.task || 0) - (a.scoreBreakdown?.task || 0))[0];
    if (bestTask && bestTask.id !== best?.id)
        categories.push({ category: 'Best Task Match', emoji: '🎯', datasetId: bestTask.id || bestTask.name, reason: 'Highest task compatibility score.' });

    // Best for beginners (small size, open license)
    const beginnerDs = nonRejected.find(d => {
        const lic = (d.license || '').toLowerCase();
        const isOpen = lic.includes('cc') || lic.includes('open') || lic.includes('mit');
        return isOpen && (d.sizeBytes || 0) < 2_000_000_000;
    });
    if (beginnerDs && beginnerDs.id !== best?.id)
        categories.push({ category: 'Best for Beginners', emoji: '🟢', datasetId: beginnerDs.id || beginnerDs.name, reason: 'Open license and manageable size — ideal for getting started.' });

    // Best open/accessible
    const openDs = nonRejected.find(d => {
        const lic = (d.license || '').toLowerCase();
        return lic.includes('cc0') || lic.includes('public domain') || lic.includes('apache') || lic.includes('mit');
    });
    if (openDs && openDs.id !== best?.id)
        categories.push({ category: 'Best Open/Accessible Dataset', emoji: '🆓', datasetId: openDs.id || openDs.name, reason: 'Most permissive license — freely usable for research and commercial projects.' });

    // suppress unused param warning
    void spec;

    return categories;
}

export function generateSmartRecommendation(spec: any, bestDataset: any, bestModel: any, hardware: any): {
    datasets: string[];
    model: string;
    hardware: string;
    difficulty: string;
    expectedChallenge: string;
    why: string;
    nextSteps: string[];
} {
    const task = (spec.task || '').toLowerCase();
    const modality = (spec.data_modality || '').toLowerCase();
    const isAudio = /(audio|speech)/.test(modality);
    const isImage = /(image|vision)/.test(modality);

    const datasets = bestDataset ? [bestDataset.name || bestDataset.id] : ['No dataset selected'];
    const model = bestModel ? (bestModel.id || bestModel.name) : spec.primary_architecture || 'See model recommendations';
    const hwStr = hardware ? hardware.gpu?.recommendedClass || 'Standard GPU' : 'Standard GPU (Estimated)';
    const diff = isAudio ? 'Intermediate' : isImage ? 'Intermediate' : 'Beginner–Intermediate';
    const challenge = isAudio ? 'Acted vs natural emotion data; speaker-independent evaluation required' :
        isImage ? 'Dataset quality and class balance are critical' :
        'Feature engineering and class imbalance handling';

    // suppress unused var
    void task;

    const isTabular = /(tabular|structured|csv|loan|credit|finance)/i.test(modality + ' ' + task);
    const isText = /(text|nlp|sentiment|document)/i.test(modality);
    const nextSteps = [
        '1. Download the selected dataset and verify its license',
        '2. Inspect all class labels and confirm they match your requirements',
        '3. Check class distribution for severe imbalance',
        ...(isAudio ? [
            '4. Convert all audio to uniform sample rate (16 kHz recommended)',
            '5. Trim silence and normalize clip length',
            '6. Create speaker-independent splits (same speaker must NOT appear in both train and test)',
            '7. Extract Mel-spectrograms (128 mel bands) or use raw waveforms for end-to-end models',
        ] : isImage ? [
            '4. Resize images to model input dimensions',
            '5. Apply data augmentation (flip, crop, brightness) to address class imbalance',
            '6. Create stratified train/validation/test splits',
            '7. Normalize pixel values (ImageNet mean/std or 0-1 range)',
        ] : isTabular ? [
            '4. Inspect and handle missing values',
            '5. Check for class imbalance — apply SMOTE or class weighting if severe',
            '6. Create stratified train/validation/test splits',
            '7. Encode categorical features and scale numerical features',
        ] : isText ? [
            '4. Clean and tokenize text data',
            '5. Check label distribution and address imbalance',
            '6. Create stratified train/validation/test splits',
        ] : [
            '4. Inspect data quality and handle missing values',
            '5. Create train/validation/test splits',
        ]),
        '8. Train a baseline model and record benchmark results',
        '9. Evaluate using: ' + (isAudio ? 'Weighted Accuracy, UAR, per-class F1, confusion matrix' : isTabular ? 'Accuracy, ROC-AUC, F1-score, confusion matrix' : 'Accuracy, Macro F1, confusion matrix'),
        '10. Compare baseline against an advanced model architecture',
        '11. Perform error analysis — identify which classes or samples fail most',
        '12. Document all dataset limitations and model constraints in your report',
    ];


    return {
        datasets,
        model,
        hardware: hwStr + ' (Estimated)',
        difficulty: diff,
        expectedChallenge: challenge,
        why: bestDataset
            ? `Dataset was selected based on task compatibility (${spec.task}), modality match (${spec.data_modality}), and relevance score.`
            : 'No strongly matching dataset found — consider broadening your search or combining datasets.',
        nextSteps,
    };
}

export function enrichDataset(dataset: any, project: any, task: string, modality: string): any {
    const risk = analyzeDatasetRisk(dataset, project);
    const quality = analyzeDatasetQuality(dataset);
    const trainability = estimateTrainability(dataset, task, modality);
    const accessibility = computeAccessibility(dataset);
    const difficulty = classifyDifficulty(dataset, task, modality, project.target_labels || []);

    return {
        ...dataset,
        _enriched: {
            risk,
            quality,
            trainability,
            accessibility,
            difficulty,
        },
    };
}
