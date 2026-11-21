/**
 * Universal Modality Compatibility Matrix
 *
 * Defines a domain-agnostic, orthogonal schema of mutually exclusive modality groups.
 * This is a HARD REJECTION GATE — incompatibility can never be overridden by keyword
 * similarity, semantic scores, or any other scoring factor.
 *
 * Rule: If checkModalityCompatibility() returns compatibilityScore = 0,
 * the candidate must be rejected or assigned FinalScore = 0 immediately.
 * No downstream scorer may compensate for a modality incompatibility.
 */

// ── Canonical Modality Groups ─────────────────────────────────────────────────

export type ModalityGroup =
    | 'AUDIO'                      // Speech, sound, WAV, acoustic signals
    | 'MEDICAL_ACOUSTIC'           // Ultrasound, echocardiography, acoustic-based medical
    | 'VISION_NATURAL'             // Natural RGB images, photos, video (non-medical)
    | 'VISION_MEDICAL'             // MRI, CT, X-ray, PET, medical imaging
    | 'VISION_INFRARED'            // Thermal/infrared video or images
    | 'VIDEO_NATURAL'              // Natural RGB video (dash cam, CCTV, driving)
    | 'TABULAR'                    // CSV, spreadsheet, structured records (non-time-series)
    | 'TIME_SERIES'                // Sensor time-series, EEG/ECG signals, tabular temporal data
    | 'TEXT_NLP'                   // Text documents, corpora, natural language
    | 'ROBOTICS_SENSOR'            // Robot proprioception, joint angles, camera+sensor fusion
    | 'POINT_CLOUD_3D'             // LiDAR, 3D mesh, point cloud
    | 'GENOMICS'                   // RNA-seq, genomic sequences
    | 'MULTIMODAL'                 // Explicitly combines multiple modalities
    | 'UNKNOWN';                   // Not determinable from metadata

// ── Mutual Incompatibility Table ─────────────────────────────────────────────
//
// An entry [A, B] means: if the query requests modality A and the candidate
// has modality B (or vice versa), the candidate is fundamentally incompatible.
//
// This table is symmetric — the check function handles both directions.

const INCOMPATIBLE_PAIRS: [ModalityGroup, ModalityGroup][] = [
    // Natural vision (RGB photography, industrial imaging) is mutually exclusive with Medical imaging (CT, MRI, X-ray)
    ['VISION_NATURAL', 'VISION_MEDICAL'],
    // Natural vision is mutually exclusive with text NLP and tabular
    ['VISION_NATURAL', 'TEXT_NLP'],
    ['VISION_NATURAL', 'TABULAR'],

    // Audio is mutually exclusive with all visual and tabular modalities
    ['AUDIO', 'VISION_NATURAL'],
    ['AUDIO', 'VISION_MEDICAL'],
    ['AUDIO', 'VISION_INFRARED'],
    ['AUDIO', 'VIDEO_NATURAL'],
    ['AUDIO', 'TABULAR'],
    ['AUDIO', 'TEXT_NLP'],
    ['AUDIO', 'POINT_CLOUD_3D'],
    ['AUDIO', 'GENOMICS'],

    // Medical acoustic (ultrasound) is incompatible with natural RGB vision
    ['MEDICAL_ACOUSTIC', 'VISION_NATURAL'],
    ['MEDICAL_ACOUSTIC', 'VIDEO_NATURAL'],
    ['MEDICAL_ACOUSTIC', 'VISION_INFRARED'],
    ['MEDICAL_ACOUSTIC', 'TABULAR'],
    ['MEDICAL_ACOUSTIC', 'TEXT_NLP'],
    ['MEDICAL_ACOUSTIC', 'GENOMICS'],
    ['MEDICAL_ACOUSTIC', 'AUDIO'],  // Ultrasound ≠ audio/speech

    // Structural medical imaging (MRI, CT) is incompatible with audio, NLP, tabular
    ['VISION_MEDICAL', 'AUDIO'],
    ['VISION_MEDICAL', 'TEXT_NLP'],
    ['VISION_MEDICAL', 'TABULAR'],
    ['VISION_MEDICAL', 'GENOMICS'],
    ['VISION_MEDICAL', 'POINT_CLOUD_3D'],

    // Natural video is incompatible with medical imaging, audio-only, and tabular
    ['VIDEO_NATURAL', 'VISION_MEDICAL'],
    ['VIDEO_NATURAL', 'AUDIO'],
    ['VIDEO_NATURAL', 'TABULAR'],
    ['VIDEO_NATURAL', 'TEXT_NLP'],
    ['VIDEO_NATURAL', 'GENOMICS'],

    // Tabular / time-series is incompatible with all 2D/3D imaging
    ['TABULAR', 'VISION_NATURAL'],
    ['TABULAR', 'VISION_MEDICAL'],
    ['TABULAR', 'VISION_INFRARED'],
    ['TABULAR', 'VIDEO_NATURAL'],
    ['TABULAR', 'POINT_CLOUD_3D'],
    ['TIME_SERIES', 'VISION_NATURAL'],
    ['TIME_SERIES', 'VISION_MEDICAL'],
    ['TIME_SERIES', 'VIDEO_NATURAL'],
    ['TIME_SERIES', 'POINT_CLOUD_3D'],

    // NLP/text is incompatible with imaging and audio
    ['TEXT_NLP', 'VISION_NATURAL'],
    ['TEXT_NLP', 'VISION_MEDICAL'],
    ['TEXT_NLP', 'VIDEO_NATURAL'],
    ['TEXT_NLP', 'AUDIO'],
    ['TEXT_NLP', 'POINT_CLOUD_3D'],

    // Robotics sensor fusion is incompatible with medical imaging, audio-only, NLP
    ['ROBOTICS_SENSOR', 'VISION_MEDICAL'],
    ['ROBOTICS_SENSOR', 'AUDIO'],
    ['ROBOTICS_SENSOR', 'TEXT_NLP'],
    ['ROBOTICS_SENSOR', 'TABULAR'],
    ['ROBOTICS_SENSOR', 'GENOMICS'],

    // Genomics is incompatible with visual, audio, and robotics
    ['GENOMICS', 'VISION_NATURAL'],
    ['GENOMICS', 'VISION_MEDICAL'],
    ['GENOMICS', 'VIDEO_NATURAL'],
    ['GENOMICS', 'AUDIO'],
    ['GENOMICS', 'ROBOTICS_SENSOR'],
    ['GENOMICS', 'POINT_CLOUD_3D'],
];

// ── Modality Signal Patterns → ModalityGroup ─────────────────────────────────
//
// Each entry maps a regex pattern (tested against the candidate's full text blob)
// to a canonical ModalityGroup.

const CANDIDATE_MODALITY_SIGNALS: [RegExp, ModalityGroup][] = [
    // Document AI / OCR / Vision-Language (bridges Document Image + Structured Text)
    [/\b(?:receipts?|invoices?|ocr|optical\s*character|scanned\s*(?:document|receipt|invoice|form|image)|docvqa|sroie|cord\b|funsd|rvl[- ]?cdip|donut|layoutlm\w*|trocr|nougat|florence|qwen2[- ]?vl|paligemma|pix2struct|image[- ]to[- ]text|document[- ]question[- ]answering|visual[- ]question[- ]answering|vision[- ]language|\bvlm\b|\bvqa\b)\b/i, 'MULTIMODAL'],
    // Audio / Speech
    [/\baudio\b|\bspeech\b|\bwav\b|\bsound\b|\bacoustic\b|\bvoice\b|\bspeaker\b|\bphone\b|\basr\b/i, 'AUDIO'],
    // Medical Acoustic (Ultrasound)
    [/ultrasound|echocardio|echocardiograph|acoustic\s*(?:imaging|medical)|sonograph/i, 'MEDICAL_ACOUSTIC'],
    // Medical Imaging (MRI, CT, X-ray, PET)
    [/\bmri\b|\bfmri\b|magnetic\s*resonance|computed\s*tomograph|\bct\s*scan\b|\bcta\b|\bx.?ray\b|radiograph|\bpet\b\s*scan|mammograph|fluoroscop|dicom|nifti|\.nii|scintigraph/i, 'VISION_MEDICAL'],
    // Infrared / Thermal
    [/infrared|thermal\s*(?:camera|video|image)|ir\s*camera|night\s*vision\s*infrared/i, 'VISION_INFRARED'],
    // Natural Video (non-medical)
    [/video\s*(?:dataset|stream|surveillance|classification|recognition)|dash\s*cam|cctv|surveillance\s*video|driving\s*video|dashcam/i, 'VIDEO_NATURAL'],
    // Point Cloud / LiDAR / 3D
    [/point\s*cloud|lidar|3d\s*(?:mesh|model|scan)|velodyne/i, 'POINT_CLOUD_3D'],
    // Robotics Sensor
    [/robot(?:ics?|arm)|propriocep|joint\s*angle|teleoperat|manipulation\s*(?:task|dataset)|lerobot/i, 'ROBOTICS_SENSOR'],
    // Genomics
    [/rna.?seq|genomic|transcriptom|single.?cell\s*rna|dna\s*seq|genome/i, 'GENOMICS'],
    // Time-series (EEG, ECG, sensor)
    [/\beeg\b|\becg\b|\bekg\b|time.?series|sensor\s*data|accelerometer|gyroscope|imu\b/i, 'TIME_SERIES'],
    // Tabular (pure structured / CSV)
    [/\btabular\b|\.csv|health\s*survey|questionnaire|nhanes|brfss|ehr\b|electronic\s*health\s*record|clinical\s*trial\s*data/i, 'TABULAR'],
    // NLP / Text
    [/\bnlp\b|natural\s*language|text\s*classif|sentiment|document\s*classif|question\s*answer|summar|\bmultilingual\b|\btext\b|\bcorpus\b|\btickets?\b/i, 'TEXT_NLP'],
    // Natural Vision (generic images / photos / satellite / industrial)
    [/image\s*(?:dataset|classif)|photo|visual|rgb\s*image|natural\s*image|imagenet|coco|cifar|2d\s*rgb|\bsatellite\b|\bmultispectral\b|\bhyperspectral\b|remote\s*sensing/i, 'VISION_NATURAL'],
];

// ── Query → ModalityGroup mapping ─────────────────────────────────────────────

const QUERY_MODALITY_SIGNALS: [RegExp, ModalityGroup][] = [
    [/\b(?:receipts?|invoices?|ocr|optical\s*character|scanned\s*(?:document|receipt|invoice|form|image)|docvqa|sroie|cord\b|funsd|rvl[- ]?cdip|donut|layoutlm\w*|trocr|nougat|florence|qwen2[- ]?vl|paligemma|pix2struct|image[- ]to[- ]text|document[- ]question[- ]answering|visual[- ]question[- ]answering|vision[- ]language|\bvlm\b|\bvqa\b)\b/i, 'MULTIMODAL'],
    [/\baudio\b|\bspeech\b|\bsound\b|\bwav\b|\bacoustic\b|\bvoice\b|\basr\b/i, 'AUDIO'],
    [/ultrasound|echocardio|sonograph|acoustic\s*(?:imaging|medical)/i, 'MEDICAL_ACOUSTIC'],
    [/\bmri\b|\bfmri\b|magnetic\s*resonance|computed\s*tomograph|\bct\b|\bcta\b|\bx.?ray\b|radiograph|\bpet\b\s*scan|dicom|nifti/i, 'VISION_MEDICAL'],
    [/infrared|thermal\s*(?:camera|video|image)/i, 'VISION_INFRARED'],
    [/\bvideo\b(?!\s*eeg)|dash\s*cam|cctv|surveillance/i, 'VIDEO_NATURAL'],
    [/point\s*cloud|lidar|3d\s*scan/i, 'POINT_CLOUD_3D'],
    [/robot(?:ics?|arm)|teleoperat|manipulation\s*task/i, 'ROBOTICS_SENSOR'],
    [/rna.?seq|genomic|transcriptom/i, 'GENOMICS'],
    [/\beeg\b|\becg\b|\bekg\b|time.?series|sensor\s*data/i, 'TIME_SERIES'],
    [/\btabular\b|\.csv|health\s*survey|questionnaire/i, 'TABULAR'],
    [/\bnlp\b|natural\s*language|text\s*classif|sentiment|document|\bmultilingual\b|\btext\b|\btickets?\b/i, 'TEXT_NLP'],
    [/2d\s*rgb|\brgb\b|\bphoto(?:graph)?s?\b|\bvisual\b|\bnatural\s*images?|\bcamera\b|\bimages?\b/i, 'VISION_NATURAL'],
    [/\bmultispectral\b|\bhyperspectral\b|\bsatellite\b|\bremote\s*sensing\b|\bearth\s*observation\b/i, 'VISION_NATURAL'],
];

// ── Public API ────────────────────────────────────────────────────────────────

export interface ModalityCompatibilityResult {
    /** 0 = fundamentally incompatible; 1 = compatible or unknown */
    compatibilityScore: 0 | 1;
    queryModalityGroup: ModalityGroup;
    candidateModalityGroup: ModalityGroup;
    rejectionReason?: string;
}

// Groups that belong to the same physical family and should NOT trigger MULTIMODAL
// when co-occurring in the same blob.
const SAME_FAMILY_GROUPS: ModalityGroup[][] = [
    ['TABULAR', 'TIME_SERIES'],           // Both are structured/non-visual data
    ['VISION_NATURAL', 'VIDEO_NATURAL'],  // Both are natural RGB visual
    ['VISION_MEDICAL', 'MEDICAL_ACOUSTIC'], // Both are medical imaging
    ['AUDIO', 'MEDICAL_ACOUSTIC'],        // Acoustic family (ultrasound ≠ audio but grouped conservatively)
];

function areSameFamily(a: ModalityGroup, b: ModalityGroup): boolean {
    return SAME_FAMILY_GROUPS.some(family => family.includes(a) && family.includes(b));
}

/**
 * Classify a text blob into a ModalityGroup.
 * Uses the first matching signal pattern.
 * Falls back to 'UNKNOWN' if no signal matches.
 *
 * MULTIMODAL is only declared when TWO signals from DIFFERENT physical families
 * both match. Co-occurring signals within the same family (e.g., TABULAR + TIME_SERIES)
 * do NOT trigger MULTIMODAL — the first matched group wins.
 */
export function classifyModalityGroup(
    textBlob: string,
    signals: [RegExp, ModalityGroup][] = CANDIDATE_MODALITY_SIGNALS
): ModalityGroup {
    const matched: ModalityGroup[] = [];
    for (const [rx, group] of signals) {
        if (rx.test(textBlob) && !matched.includes(group)) {
            matched.push(group);
        }
    }

    if (matched.length === 0) return 'UNKNOWN';
    if (matched.length === 1) return matched[0];

    // Check if any two matched groups are from different physical families
    for (let i = 0; i < matched.length; i++) {
        for (let j = i + 1; j < matched.length; j++) {
            if (!areSameFamily(matched[i], matched[j])) {
                return 'MULTIMODAL';
            }
        }
    }

    // All matched groups are from the same family — return the first (highest priority) one
    return matched[0];
}


/**
 * Classify the query's requested modality group.
 */
export function classifyQueryModalityGroup(queryText: string): ModalityGroup {
    return classifyModalityGroup(queryText.toLowerCase(), QUERY_MODALITY_SIGNALS);
}

/**
 * Hard modality compatibility check.
 *
 * @param candidateBlob — full text blob of the candidate (title + tags + desc + modality field)
 * @param queryText — the raw user query text
 * @param explicitCandidateModality — the candidate's parsed modality field (if available)
 * @returns ModalityCompatibilityResult with compatibilityScore = 0 if incompatible
 */
export function checkModalityCompatibility(
    candidateBlob: string,
    queryText: string,
    explicitCandidateModality?: string | string[]
): ModalityCompatibilityResult {
    // Determine query modality group
    const queryGroup = classifyQueryModalityGroup(queryText);

    // If query modality is unknown or multimodal → no hard rejection
    if (queryGroup === 'UNKNOWN' || queryGroup === 'MULTIMODAL') {
        return { compatibilityScore: 1, queryModalityGroup: queryGroup, candidateModalityGroup: 'UNKNOWN' };
    }

    // Build candidate blob including explicit modality field
    const explicitMod = Array.isArray(explicitCandidateModality)
        ? explicitCandidateModality.join(' ')
        : (explicitCandidateModality || '');
    const fullCandidateText = `${candidateBlob} ${explicitMod}`.toLowerCase();

    // Determine candidate modality group
    const candidateGroup = classifyModalityGroup(fullCandidateText);

    // If candidate is MULTIMODAL → generally compatible (multimodal datasets can serve many tasks)
    if (candidateGroup === 'MULTIMODAL') {
        return { compatibilityScore: 1, queryModalityGroup: queryGroup, candidateModalityGroup: candidateGroup };
    }

    // If candidate modality is UNKNOWN → no hard rejection (defer to scorer)
    if (candidateGroup === 'UNKNOWN') {
        return { compatibilityScore: 1, queryModalityGroup: queryGroup, candidateModalityGroup: candidateGroup };
    }

    // Check incompatibility table (symmetric)
    for (const [a, b] of INCOMPATIBLE_PAIRS) {
        if ((a === queryGroup && b === candidateGroup) || (b === queryGroup && a === candidateGroup)) {
            return {
                compatibilityScore: 0,
                queryModalityGroup: queryGroup,
                candidateModalityGroup: candidateGroup,
                rejectionReason: `Modality incompatibility: Query requires [${queryGroup}] data but candidate provides [${candidateGroup}] data. These are physically mutually exclusive — no semantic score can compensate.`,
            };
        }
    }

    return { compatibilityScore: 1, queryModalityGroup: queryGroup, candidateModalityGroup: candidateGroup };
}

/**
 * Map an HF pipeline_tag string to a ModalityGroup.
 * Used for explicit compatibility gating on structured metadata.
 */
export function pipelineTagToModalityGroup(pipelineTag: string): ModalityGroup {
    const t = pipelineTag.toLowerCase();
    if (/audio|speech|automatic-speech|sound|text-to-speech|voice/i.test(t)) return 'AUDIO';
    if (/image-classif|image-segment|object-detect|image-to|depth|video-classif|visual/i.test(t)) return 'VISION_NATURAL';
    if (/text-classif|token-classif|question-answer|summar|translat|fill-mask|text-generat|nlp/i.test(t)) return 'TEXT_NLP';
    if (/tabular|structured/i.test(t)) return 'TABULAR';
    if (/time-series|sensor/i.test(t)) return 'TIME_SERIES';
    if (/robotics|manipulat/i.test(t)) return 'ROBOTICS_SENSOR';
    return 'UNKNOWN';
}
