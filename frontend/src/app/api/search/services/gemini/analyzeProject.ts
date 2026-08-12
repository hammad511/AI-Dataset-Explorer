async function parseModelJsonFromText(text: string) {
    if (!text || typeof text !== 'string') return null;

    const candidates: string[] = [];
    const cleaned = text
        .replace(/```json\s*/gi, '```')
        .replace(/```/g, '')
        .trim();

    if (cleaned) candidates.push(cleaned);

    const objectBlocks = [...cleaned.matchAll(/\{[^{}]*\}/g)];
    for (const match of objectBlocks) {
        candidates.push(match[0]);
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            // continue scanning
        }
    }

    let braceStart = cleaned.indexOf('{');
    while (braceStart !== -1) {
        let depth = 0;
        let foundEnd = -1;
        for (let i = braceStart; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (ch === '{') depth += 1;
            else if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    foundEnd = i;
                    break;
                }
            }
        }
        if (foundEnd === -1) break;
        const chunk = cleaned.slice(braceStart, foundEnd + 1);
        try {
            const parsed = JSON.parse(chunk);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            // continue scanning for a valid object chunk
        }
        braceStart = cleaned.indexOf('{', braceStart + 1);
    }

    return null;
}

function coerceProjectAnalysis(raw: any, fallbackQuery: string) {
    if (!raw || typeof raw !== 'object') return null;

    let candidate = raw;
    if ('analysis' in candidate && candidate.analysis && typeof candidate.analysis === 'object') candidate = candidate.analysis;
    if ('result' in candidate && candidate.result && typeof candidate.result === 'object') candidate = candidate.result;
    if ('content' in candidate && candidate.content && typeof candidate.content === 'object') candidate = candidate.content;
    if ('message' in candidate && candidate.message && typeof candidate.message === 'object') candidate = candidate.message;
    if ('data' in candidate && candidate.data && typeof candidate.data === 'object') candidate = candidate.data;

    if (Array.isArray(candidate)) {
        const firstObject = candidate.find(item => item && typeof item === 'object');
        if (firstObject) candidate = firstObject;
    }

    if (!candidate || typeof candidate !== 'object') return null;

    const query = (fallbackQuery || '').trim();
    const taskValue = Array.isArray(candidate.task) ? candidate.task : [candidate.task || 'General AI task'];
    const normalizedTask = taskValue.filter(Boolean).map(String);

    const defaultTitle = query ? query.slice(0, 80) || 'AI Project Analysis' : 'AI Project Analysis';
    const defaultDomain = candidate.domain || candidate.field || 'General AI';

    return {
        problem_statement: candidate.problem_statement || query || defaultTitle,
        title: candidate.title || defaultTitle,
        domain: candidate.domain || candidate.field || defaultDomain,
        subdomain: candidate.subdomain || 'General',
        data_modality: candidate.data_modality || candidate.modality || candidate.input_type || 'Text',
        input_type: candidate.input_type || candidate.data_modality || 'Unknown',
        task: normalizedTask.length ? normalizedTask : ['General AI task'],
        secondary_tasks: Array.isArray(candidate.secondary_tasks) ? candidate.secondary_tasks : [],
        target_type: candidate.target_type || 'categorical',
        target_labels: Array.isArray(candidate.target_labels) ? candidate.target_labels : [],
        expected_output: candidate.expected_output || 'Project output',
        constraints: Array.isArray(candidate.constraints) ? candidate.constraints : [],
        explicit_facts: Array.isArray(candidate.explicit_facts) ? candidate.explicit_facts : [],
        inferred_facts: Array.isArray(candidate.inferred_facts) ? candidate.inferred_facts : [],
        unknown_facts: Array.isArray(candidate.unknown_facts) ? candidate.unknown_facts : [],
        ambiguity_notes: Array.isArray(candidate.ambiguity_notes) ? candidate.ambiguity_notes : [],
        primary_architecture: candidate.primary_architecture || 'Custom transformer / CNN',
        alternative_architectures: Array.isArray(candidate.alternative_architectures) ? candidate.alternative_architectures : [],
        architecture_reasoning: candidate.architecture_reasoning || 'Selected based on project task and modality requirements.',
        pipeline_stages: Array.isArray(candidate.pipeline_stages) ? candidate.pipeline_stages : [],
        required_dataset_properties: Array.isArray(candidate.required_dataset_properties) ? candidate.required_dataset_properties : [],
        confidence: candidate.confidence || {
            score: 0.5,
            components: {
                clarity: 0.5,
                task: 0.5,
                modality: 0.5,
                domain: 0.5,
                target: 0.5,
                output: 0.5,
                architecture: 0.5,
            },
            reason: 'Model returned a partial but usable project summary.',
        },
    };
}

export async function analyzeProjectSemantics(query: string, apiKey: string, model?: string, provider: 'openrouter' = 'openrouter') {
    if (!apiKey) {
        throw new Error(JSON.stringify({ type: 'PROVIDER_API_ERROR', status: 401, message: 'Missing API key for provider' }));
    }

    const prompt = `Return only valid JSON with no markdown fences, no commentary, and no extra text.

You are extracting a normalized project specification from the user's idea.

Output a JSON object with these exact keys and types:
{
  "problem_statement": "string",
  "title": "string",
  "domain": "string",
  "subdomain": "string",
  "data_modality": "string",
  "input_type": "string",
  "task": ["string"],
  "secondary_tasks": ["string"],
  "target_type": "string",
  "target_labels": ["string"],
  "expected_output": "string",
  "constraints": ["string"],
  "explicit_facts": ["string"],
  "inferred_facts": ["string"],
  "unknown_facts": ["string"],
  "ambiguity_notes": ["string"],
  "primary_architecture": "string",
  "alternative_architectures": ["string"],
  "architecture_reasoning": "string",
  "pipeline_stages": ["string"],
  "required_dataset_properties": ["string"],
  "confidence": {
    "score": 0,
    "components": {
      "clarity": 0,
      "task": 0,
      "modality": 0,
      "domain": 0,
      "target": 0,
      "output": 0,
      "architecture": 0
    },
    "reason": "string"
  }
}

User Request:
${query}`;

    if (provider === 'openrouter') {
        const OPENROUTER_MODEL = model || process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini';
        const OPENROUTER_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
        const resp = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
                'X-Title': 'AI Dataset Explorer',
            },
            cache: 'no-store',
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0,
                max_tokens: 1536,
                response_format: { type: 'json_object' },
            }),
        });

        if (!resp.ok) {
            const text = await resp.text();
            let message = 'OpenRouter model returned an error.';
            try { const parsed = JSON.parse(text); message = parsed.error?.message || parsed.message || message; } catch {}
            const status = resp.status || 500;
            throw new Error(JSON.stringify({ type: 'OPENROUTER_API_ERROR', status, message }));
        }

        const data = await resp.json();
        const messageContent = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.output?.[0]?.content?.[0]?.text ?? '';

        let contentText = '';
        if (Array.isArray(messageContent)) {
            contentText = messageContent
                .map((item: any) => {
                    if (typeof item === 'string') return item;
                    if (typeof item?.text === 'string') return item.text;
                    if (typeof item?.content === 'string') return item.content;
                    if (item && typeof item === 'object') return JSON.stringify(item);
                    return '';
                })
                .join('');
        } else if (typeof messageContent === 'string') {
            contentText = messageContent;
        } else if (messageContent && typeof messageContent === 'object') {
            contentText = JSON.stringify(messageContent);
        }

        if (!contentText || !contentText.trim()) {
            console.error('[OpenRouter] Empty response payload:', JSON.stringify(data).slice(0, 1500));
            throw new Error(JSON.stringify({ type: 'OPENROUTER_API_ERROR', status: 502, message: 'OpenRouter returned an empty response body.' }));
        }

        console.warn('[OpenRouter] Raw content preview:', contentText.slice(0, 1500));

        const parsed = await parseModelJsonFromText(contentText);
        const normalized = coerceProjectAnalysis(parsed ?? contentText, query);

        if (!normalized) {
            throw new Error(JSON.stringify({ type: 'OPENROUTER_API_ERROR', status: 502, message: 'OpenRouter response did not include a usable project-analysis JSON schema.' }));
        }

        return normalized;
    }

    throw new Error(JSON.stringify({ type: 'OPENROUTER_API_ERROR', status: 500, message: 'Unsupported provider configuration.' }));
}

export default analyzeProjectSemantics;
