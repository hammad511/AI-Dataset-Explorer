import { ProjectFeasibility, NormalizedDataset, NormalizedModel } from '../../schemas/types';

export function calculateFeasibility(
    dsCandidates: NormalizedDataset[],
    modCandidates: NormalizedModel[],
    expectedTask: string,
    expectedModality: string
): ProjectFeasibility {
    const validDs = dsCandidates.filter(d => !d.rejected && d.matchScore > 60);
    const validMod = modCandidates.filter(m => !m.rejected && m.matchScore > 60);

    // Dataset Availability (20%)
    let dsAvail = 0;
    if (validDs.length > 10) dsAvail = 100;
    else if (validDs.length > 5) dsAvail = 80;
    else if (validDs.length > 0) dsAvail = 50;

    // Model Availability (20%)
    let modAvail = 0;
    if (validMod.length > 10) modAvail = 100;
    else if (validMod.length > 5) modAvail = 80;
    else if (validMod.length > 0) modAvail = 50;

    // Computational Feasibility (20%) — higher = easier / more accessible
    let compFeasibility = 100;
    const task = expectedTask.toLowerCase();
    const mod = expectedModality.toLowerCase();
    if (mod.includes('video') || mod.includes('3d')) compFeasibility = 30;       // very demanding
    else if (mod.includes('image') && task.includes('segment')) compFeasibility = 50; // demanding
    else if (mod.includes('image') || task.includes('detect') || task.includes('track')) compFeasibility = 60;
    else if (task.includes('language') || mod.includes('text')) compFeasibility = 70;
    else if (mod.includes('tabular') || mod.includes('structured') || mod.includes('time')) compFeasibility = 95;
    else compFeasibility = 50;

    // Documentation (15%)
    let docScore = 0;
    if (validDs.length > 0) {
        const top = validDs[0];
        if (top.description && top.description.length > 200) docScore += 40;
        if (top.license) docScore += 30;
        if (top.files && top.files.length > 0) docScore += 30;
    }

    // Dataset Quality (25%)
    let metaScore = 0;
    if (validDs.length > 0) {
        const top = validDs[0];
        if (top.sizeBytes && top.sizeBytes > 10_000_000) metaScore += 40;
        if (top.downloads && top.downloads > 500) metaScore += 40;
        if (top.tags && top.tags.length > 2) metaScore += 20;
    }

    const overallScore = Math.round(
        dsAvail * 0.20 +
        modAvail * 0.20 +
        compFeasibility * 0.20 +
        docScore * 0.15 +
        metaScore * 0.25
    );

    let level = 'Excellent';
    if (overallScore < 85) level = 'Good';
    if (overallScore < 70) level = 'Moderate';
    if (overallScore < 50) level = 'Difficult';
    if (overallScore < 30) level = 'Poor';

    return {
        datasetAvailability: dsAvail,
        modelAvailability: modAvail,
        computationalFeasibility: compFeasibility,
        documentation: docScore,
        datasetQuality: metaScore,
        overallScore,
        level,
    };
}
