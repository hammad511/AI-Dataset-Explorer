export interface ConfidenceBreakdown {
    task_certainty: number;
    domain_certainty: number;
    modality_certainty: number;
    target_certainty: number;
    architecture_certainty: number;
    score: number;
    reason: string;
}

export function calculateDeterministicConfidence(analysis, queryLength) {
    const tasks = Array.isArray(analysis && analysis.task) ? analysis.task.filter(Boolean) : [analysis && analysis.task].filter(Boolean);
    const unknowns = (analysis && analysis.unknown_facts) || [];
    const explicitFacts = (analysis && analysis.explicit_facts) || [];
    const ambiguities = (analysis && analysis.ambiguity_notes) || [];
    let taskCertainty = 40;
    if (tasks.length > 0 && tasks[0] !== 'Unknown' && tasks[0] !== 'General AI task') taskCertainty += 40;
    if (tasks.length > 1) taskCertainty += 10;
    if (ambiguities.length === 0) taskCertainty += 10;
    taskCertainty = Math.min(100, taskCertainty);
    let domainCertainty = 40;
    if (analysis && analysis.domain && analysis.domain !== 'General' && analysis.domain !== 'General AI') domainCertainty += 30;
    if (analysis && analysis.subdomain && analysis.subdomain !== 'General') domainCertainty += 30;
    domainCertainty = Math.min(100, domainCertainty);
    let modalityCertainty = 40;
    if (analysis && analysis.data_modality && analysis.data_modality !== 'Unknown') modalityCertainty += 30;
    if (analysis && analysis.input_type && analysis.input_type !== 'Unknown') modalityCertainty += 30;
    modalityCertainty = Math.min(100, modalityCertainty);
    let targetCertainty = 30;
    const labels = (analysis && analysis.target_labels) || [];
    if (labels.length > 0) targetCertainty += 50;
    if (analysis && analysis.target_type && analysis.target_type !== 'unknown') targetCertainty += 20;
    targetCertainty = Math.min(100, targetCertainty);
    let archCertainty = 40;
    if (analysis && analysis.primary_architecture && analysis.primary_architecture !== 'Unknown' && analysis.primary_architecture !== 'Custom model') archCertainty += 35;
    if (Array.isArray(analysis && analysis.alternative_architectures) && analysis.alternative_architectures.length > 0) archCertainty += 15;
    if (analysis && analysis.architecture_reasoning) archCertainty += 10;
    archCertainty = Math.min(100, archCertainty);
    const unknownPenalty = Math.min(30, unknowns.length * 5);
    const explicitBonus = Math.min(15, explicitFacts.length * 3);
    const rawScore = taskCertainty*0.30 + domainCertainty*0.20 + modalityCertainty*0.20 + targetCertainty*0.15 + archCertainty*0.15;
    const finalScore = Math.max(0, Math.min(100, Math.round(rawScore - unknownPenalty + explicitBonus)));
    const reasons = [];
    if (taskCertainty >= 80) reasons.push('task clearly defined');
    if (domainCertainty >= 80) reasons.push('domain and subdomain confirmed');
    if (modalityCertainty >= 80) reasons.push('data modality confirmed');
    if (labels.length > 0) reasons.push(labels.length + ' target labels identified');
    if (unknowns.length > 0) reasons.push(unknowns.length + ' unknown details reduce confidence');
    return { task_certainty: taskCertainty, domain_certainty: domainCertainty, modality_certainty: modalityCertainty, target_certainty: targetCertainty, architecture_certainty: archCertainty, score: finalScore, reason: reasons.length > 0 ? reasons.join('; ') + '.' : 'Calculated from explicit and inferred project facts.' };
}