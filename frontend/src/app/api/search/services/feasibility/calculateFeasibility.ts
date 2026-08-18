import { ProjectFeasibility, NormalizedDataset, NormalizedModel } from '../../schemas/types';

export function calculateFeasibility(
    dsCandidates: NormalizedDataset[],
    modCandidates: NormalizedModel[],
    expectedTask: string,
    expectedModality: string
): ProjectFeasibility {
    // Threshold of 30 (not 60) — real API datasets score 30-70 with available metadata
    const validDs = dsCandidates.filter(d => !d.rejected && d.matchScore > 30);
    const validMod = modCandidates.filter(m => !m.rejected && m.matchScore > 30);
    const anyDs   = dsCandidates.filter(d => !d.rejected);
    const anyMod  = modCandidates.filter(m => !m.rejected);
    const topDs   = validDs.length > 0 ? validDs[0] : anyDs[0] ?? null;

    // Dataset Availability (20%)
    const dsCount = validDs.length > 0 ? validDs.length : anyDs.length;
    let dsAvail = 0;
    if (dsCount > 15)     dsAvail = 100;
    else if (dsCount > 8) dsAvail = 85;
    else if (dsCount > 3) dsAvail = 70;
    else if (dsCount > 0) dsAvail = 50;

    // Model Availability (20%)
    const modCount = validMod.length > 0 ? validMod.length : anyMod.length;
    let modAvail = 0;
    if (modCount > 15)      modAvail = 100;
    else if (modCount > 8)  modAvail = 85;
    else if (modCount > 3)  modAvail = 70;
    else if (modCount > 0)  modAvail = 50;

    // Computational Feasibility (20%) — higher = easier
    let compFeasibility = 100;
    const task = expectedTask.toLowerCase();
    const mod  = expectedModality.toLowerCase();
    if      (mod.includes('video') || mod.includes('3d'))                          compFeasibility = 30;
    else if (mod.includes('image') && task.includes('segment'))                    compFeasibility = 50;
    else if (mod.includes('image') || task.includes('detect') || task.includes('track')) compFeasibility = 60;
    else if (task.includes('language') || mod.includes('text'))                    compFeasibility = 70;
    else if (mod.includes('tabular') || mod.includes('structured') || mod.includes('time')) compFeasibility = 95;
    else compFeasibility = 50;

    // Documentation (15%) — lenient for real Kaggle/HF short descriptions
    let docScore = 0;
    if (topDs) {
        if (topDs.description && topDs.description.length > 20)          docScore += 30;
        else if ((topDs as any).subtitle && (topDs as any).subtitle.length > 10) docScore += 20;
        else if (topDs.name || topDs.title)                               docScore += 10;
        if (topDs.license && topDs.license !== 'Unknown')                 docScore += 40;
        else if (topDs.license)                                           docScore += 15;
        if (topDs.tags && topDs.tags.length > 2)                          docScore += 30;
        else if (topDs.tags && topDs.tags.length > 0)                     docScore += 15;
    }
    docScore = Math.min(100, docScore);

    // Dataset Quality (25%) — realistic thresholds for real Kaggle/HF data
    let metaScore = 0;
    if (topDs) {
        const bytes = topDs.sizeBytes || 0;
        if      (bytes > 100_000_000) metaScore += 40;
        else if (bytes > 1_000_000)   metaScore += 25;
        else if (bytes > 0)           metaScore += 10;
        const dl = topDs.downloads || 0;
        if      (dl > 1000)  metaScore += 40;
        else if (dl > 100)   metaScore += 25;
        else if (dl > 0)     metaScore += 10;
        if (topDs.tags && topDs.tags.length > 4)      metaScore += 20;
        else if (topDs.tags && topDs.tags.length > 1) metaScore += 10;
    }
    metaScore = Math.min(100, metaScore);

    const overallScore = Math.round(
        dsAvail         * 0.20 +
        modAvail        * 0.20 +
        compFeasibility * 0.20 +
        docScore        * 0.15 +
        metaScore       * 0.25
    );

    let level = 'Excellent';
    if (overallScore < 85) level = 'Good';
    if (overallScore < 70) level = 'Moderate';
    if (overallScore < 50) level = 'Difficult';
    if (overallScore < 30) level = 'Poor';

    return {
        datasetAvailability:    dsAvail,
        modelAvailability:      modAvail,
        computationalFeasibility: compFeasibility,
        documentation:          docScore,
        datasetQuality:         metaScore,
        overallScore,
        level,
    };
}