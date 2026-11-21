import { IntentClassification, VALID_INTENTS, SEARCH_INTENTS, IntentType } from './types';
import { callLlm } from './llmProvider';
import { extractCoreSearchKeywords, isTechnicalOrDataQuery } from './keywordExtractor';

const GREETING_PATTERNS = /^\s*(hi|hello|hey|howdy|hola|yo|sup|good\s*(morning|afternoon|evening)|greetings|what'?s\s*up)\s*[!?.]*\s*$/i;

function isGreeting(query: string): boolean {
    return GREETING_PATTERNS.test(query) && query.trim().length < 30;
}

const INTENT_SYSTEM_PROMPT = `You are the Intent Classification engine for AI Dataset & Research Explorer.
Classify the user's message into exactly ONE of the following precise categories:

1. GREETING: "hi", "hello".
2. GENERAL_AI: "What is backpropagation?", "Explain Adam vs SGD" (pure conversational/concept definition ONLY without specific domain data targets).
3. EXPLAIN_CONCEPT: "Explain transfer learning" (pure concept explanation ONLY).
4. DATASET_SEARCH: "Find MRI brain tumor datasets", "Multimodal real-time seizure detection and onset zone localization using continuous 64-channel intracranial EEG and synchronized infrared video streams", "Real-time seizure detection with EEG" (any query describing an ML task, data modality, sensor streams, feature set, clinical target, or engineering objective).
5. MODEL_SEARCH: "Best model for sentiment analysis", "SmolVLA for SO-101".
6. PROJECT_ANALYSIS: "I want to build a system to detect manufacturing defects in steel surfaces. What do I need?".
7. HYBRID: "Explain CNNs and find image classification datasets".
8. COMPARISON: "Compare BERT vs GPT".
9. DATASET_ANALYSIS: "Explain this dataset".
10. MODEL_ANALYSIS: "What architecture is this model?".
11. DATASET_COMPARISON: "Compare these two datasets".
12. MODEL_COMPARISON: "Compare SmolVLA and Pi0.5 for SO-101".
13. DATASET_MODEL_MATCHING: "What model should I use for this dataset?".
14. TRAINING_ADVICE: "How do I train SmolVLA on this dataset?".
15. ARCHITECTURE_ANALYSIS: "What architecture does the best Project-IRA model use?".
16. HARDWARE_RECOMMENDATION: "What GPU do I need for a 7B parameter model?".
17. RESEARCH_SEARCH: "Latest research on vision language action robotics", "What research has been done on SO-101?".
18. EXACT_DATASET_RESEARCH: "Find papers using this dataset", "What research papers cite Project-IRA?".

Output a strict JSON object (no markdown, no code fences):
{
  "intent": "<one of the 18 intents>",
  "confidence": 0.95,
  "datasetRequired": true,
  "generalAnswerRequired": false,
  "searchQuery": "<concise 2-5 word core search query, e.g. 'seizure detection intracranial EEG'>",
  "reason": "<1-sentence classification reason>",
  "requirements": {
    "entity_type": "<'dataset' | 'model' | 'paper' | 'architecture' | 'unknown'>",
    "domain": "<broad domain e.g. 'medical imaging', 'neurology', 'robotics' or 'unknown'>",
    "subdomain": "<e.g. 'epileptology', 'cardiovascular', 'manufacturing' or 'unknown'>",
    "task": "<e.g. 'seizure detection', 'segmentation', 'localization', 'imitation learning', 'classification' or 'unknown'>",
    "target": "<e.g. 'seizure', 'coronary arteries', 'brain tumor', 'SO-101' or 'unknown'>",
    "modality": "<e.g. 'EEG', 'CT', 'MRI', 'infrared video', 'time-series', 'tabular', 'video' or 'unknown'>",
    "keywords": ["<keyword1>", "<keyword2>"]
  }
}

CRITICAL RULES:
1. BROADEN DATASET SEARCH INTENT: Any query describing an ML task, data modality (e.g., EEG, CT, MRI, audio, video, time-series, tabular, sensor data), feature set, or machine learning objective MUST be classified as DATASET_SEARCH (or PROJECT_ANALYSIS / RESEARCH_SEARCH), even if it does not explicitly say "find dataset" or "search for".
2. IMPLICIT TECHNICAL INTENT: Treat technical problem statements (e.g., "Real-time seizure detection with EEG", "Multimodal real-time seizure detection and onset zone localization using continuous 64-channel intracranial EEG and synchronized infrared video streams") as implicit requests to discover compatible datasets, baseline architectures, and benchmark literature.
3. REFINED CONCEPT HEURISTICS: Classify as GENERAL_AI or EXPLAIN_CONCEPT ONLY if the input is purely conversational or an abstract concept definition (e.g. "hi", "how does backpropagation work", "explain Adam optimizer vs SGD") without specific domain data targets or sensors.
4. SUB-STRING KEYWORD EXTRACTION: In "searchQuery", extract top core keywords (e.g. "seizure detection intracranial EEG") rather than passing the entire 20-word string verbatim.
5. If fields are unknown, output the string "unknown". Do NOT guess or hallucinate.
`;

/** Normalize common LLM intent aliases into valid system IntentType */
function normalizeIntentAlias(rawIntent: string): IntentType | null {
    const i = (rawIntent || '').toUpperCase().trim();
    if (VALID_INTENTS.includes(i as IntentType)) return i as IntentType;

    if (i === 'ASSET_DISCOVERY' || i === 'DATASET_DISCOVERY' || i === 'SEARCH_DATASET') return 'DATASET_SEARCH';
    if (i === 'GENERAL_EXPLANATION' || i === 'CONCEPT_EXPLANATION') return 'EXPLAIN_CONCEPT';
    if (i === 'CONCEPT_STATEMENT' || i === 'GENERAL_CONCEPT' || i === 'GENERAL_INQUIRY') return 'GENERAL_AI';
    if (i === 'PAPER_SEARCH' || i === 'LITERATURE_SEARCH' || i === 'SCHOLARLY_SEARCH') return 'RESEARCH_SEARCH';
    if (i === 'MODEL_DISCOVERY' || i === 'SEARCH_MODEL') return 'MODEL_SEARCH';

    return null;
}

export async function classifyIntent(query: string, apiKey?: string, model?: string): Promise<IntentClassification> {
    if (isGreeting(query)) {
        return {
            intent: 'GREETING', confidence: 1.0, datasetRequired: false, generalAnswerRequired: false,
            searchQuery: '', reason: 'Detected as a simple greeting',
        };
    }

    const extracted = extractCoreSearchKeywords(query);
    const isResearchQuery = /\b(paper|papers|research|literature|study|studies|arxiv|publications?|citations?)\b/i.test(query);
    const hasSearchVerbs = /\b(dataset|datasets|model|models|find|search|discover|recommend|explore)\b/i.test(query);
    const isTechnicalOrData = extracted.isTechnicalOrData || hasSearchVerbs;

    const fallbackIntent: IntentClassification = {
        intent: isResearchQuery ? 'RESEARCH_SEARCH' : isTechnicalOrData ? 'DATASET_SEARCH' : 'GENERAL_AI',
        confidence: isTechnicalOrData ? 0.85 : 0.5,
        datasetRequired: isTechnicalOrData || isResearchQuery,
        generalAnswerRequired: !isTechnicalOrData && !isResearchQuery,
        searchQuery: isTechnicalOrData ? extracted.primaryQuery : '',
        reason: isTechnicalOrData
            ? 'Classified as technical problem statement / ML task requesting asset discovery'
            : isResearchQuery
            ? 'Classified as scientific research literature query'
            : 'Fallback to conversational AI query',
        requirements: {
            domain: undefined,
            modality: extracted.modality,
            task: extracted.task,
            target: extracted.target,
            keywords: extracted.keywords,
        } as any,
    };

    try {
        const response = await callLlm({
            systemPrompt: INTENT_SYSTEM_PROMPT,
            userPrompt: query,
            temperature: 0.1,
            maxTokens: 350,
            jsonMode: true,
            model,
        });

        let content = (response.text || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            content = jsonMatch[0];
        }

        try {
            const parsed = JSON.parse(content);
            const normalizedIntent = normalizeIntentAlias(parsed.intent);

            if (normalizedIntent && typeof parsed.confidence === 'number') {
                let intent = normalizedIntent;
                let datasetRequired = SEARCH_INTENTS.includes(intent);
                let generalAnswerRequired = !SEARCH_INTENTS.includes(intent) || intent === 'HYBRID';
                let reason = parsed.reason || '';

                // HEURISTIC ENFORCEMENT:
                // If query is technical / clinical / modality / sensor / task statement,
                // do NOT allow it to be classified as pure GENERAL_AI / EXPLAIN_CONCEPT.
                if (isTechnicalOrData && (intent === 'GENERAL_AI' || intent === 'EXPLAIN_CONCEPT')) {
                    intent = isResearchQuery ? 'RESEARCH_SEARCH' : 'DATASET_SEARCH';
                    datasetRequired = true;
                    generalAnswerRequired = false;
                    reason = `Technical problem statement with domain modalities/tasks routed to multi-source discovery pipeline (${reason || 'broadened search intent'})`;
                }

                // Sub-string search query sanitization (ensure concise 2-5 words)
                let searchQuery = (parsed.searchQuery || '').trim();
                if (!searchQuery || searchQuery.split(/\s+/).length > 6 || searchQuery.toLowerCase() === query.toLowerCase().trim()) {
                    searchQuery = extracted.primaryQuery || query;
                }

                const result: IntentClassification = {
                    intent,
                    confidence: Math.max(0, Math.min(1, parsed.confidence)),
                    datasetRequired,
                    generalAnswerRequired,
                    searchQuery,
                    reason,
                };

                if (parsed.requirements) {
                    result.requirements = {
                        domain: parsed.requirements.domain === 'unknown' ? undefined : parsed.requirements.domain,
                        modality: parsed.requirements.modality === 'unknown' ? (extracted.modality || undefined) : parsed.requirements.modality,
                        task: typeof parsed.requirements.task === 'string' && parsed.requirements.task !== 'unknown' ? parsed.requirements.task : (extracted.task || undefined),
                        keywords: Array.isArray(parsed.requirements.keywords) && parsed.requirements.keywords.length > 0
                            ? parsed.requirements.keywords
                            : extracted.keywords,
                    };
                    const reqs: any = result.requirements;
                    reqs.target = parsed.requirements.target === 'unknown' ? (extracted.target || undefined) : parsed.requirements.target;
                    reqs.subdomain = parsed.requirements.subdomain === 'unknown' ? undefined : parsed.requirements.subdomain;
                    reqs.entity_type = parsed.requirements.entity_type === 'unknown' ? undefined : parsed.requirements.entity_type;
                } else {
                    result.requirements = {
                        modality: extracted.modality,
                        task: extracted.task,
                        target: extracted.target,
                        keywords: extracted.keywords,
                    } as any;
                }

                if (result.confidence < 0.4 && result.intent !== 'GREETING') {
                    result.intent = isTechnicalOrData ? 'DATASET_SEARCH' : 'GENERAL_AI';
                    result.datasetRequired = isTechnicalOrData;
                    result.generalAnswerRequired = !isTechnicalOrData;
                    result.confidence = 0.6;
                }

                console.log(`[INTENT] ${result.intent} (${result.confidence}) -> ${result.reason} [via ${response.provider}:${response.model}]`);
                return result;
            }
        } catch (e: any) {
            console.error('[INTENT] JSON Parse Failed:', e?.message || e, '| Raw content:', content.slice(0, 300));
        }
        return fallbackIntent;
    } catch (e: any) {
        console.error(
            `[INTENT] Gemini LLM Call Failed (status=${e?.status ?? 'N/A'}, model=${e?.model ?? 'N/A'}):`,
            e?.message || e,
            e?.responseBody ? `| Response Body: ${String(e.responseBody).slice(0, 300)}` : ''
        );
        return fallbackIntent;
    }
}
