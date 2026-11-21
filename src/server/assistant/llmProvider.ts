/**
 * Unified LLM Provider
 *
 * Supports:
 * 1) Google Gemini API (direct native REST endpoint — `AQ.` and `AIza` keys via `x-goog-api-key`)
 * 2) Optional Groq / OpenRouter / Hugging Face Inference (`GROQ_API_KEY` / `OPENROUTER_API_KEY` / `HF_TOKEN`)
 * 3) Zero-config Free OpenAI-compatible AI Fallback (`https://text.pollinations.ai/openai`) when Gemini returns 403/429
 *
 * Hardened with prompt injection shielding, token limits, and output guardrails.
 */

import { scanAndShieldPrompt, getHardenedSystemInstruction, guardrailOutput } from '../security/promptShield';
import { capOutputTokens } from '../security/usageLimiter';
import { getHuggingFaceToken } from '../providers/huggingface';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
];

export interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LlmCallOptions {
    systemPrompt?: string;
    userPrompt?: string;
    messages?: LlmMessage[];
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    model?: string;
    timeoutMs?: number;
}

export interface LlmResponse {
    text: string;
    provider: 'gemini' | 'groq' | 'openrouter' | 'huggingface' | 'free-llm';
    model: string;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
}

export interface LlmProviderStatus {
    hasGemini: boolean;
    hasFallbackLlm: boolean;
    activeProvider: 'gemini' | 'groq' | 'openrouter' | 'free-llm' | 'none';
    geminiModel: string;
}

// Circuit-breaker when a Gemini key returns 403 project-billing-disabled so subsequent calls don't waste 2s on 403
let geminiBillingBlockedUntil = 0;

export function getGeminiApiKey(): string {
    return (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
}

export function isSupportedGeminiKey(key?: string): boolean {
    if (!key) return false;
    const trimmed = key.trim();
    // Accept both new Google AI Studio `AQ.` keys, standard `AIza` keys, and any non-empty configured key
    return trimmed.length > 0;
}

export function getLlmStatus(): LlmProviderStatus {
    const apiKey = getGeminiApiKey();
    const hasGemini = isSupportedGeminiKey(apiKey) && Date.now() >= geminiBillingBlockedUntil;
    const hasGroq = Boolean((process.env.GROQ_API_KEY || '').trim());
    const hasOpenRouter = Boolean((process.env.OPENROUTER_API_KEY || '').trim());
    const hasFallbackLlm = true; // Free OpenAI-compatible fallback is always available without billing

    let activeProvider: LlmProviderStatus['activeProvider'] = 'free-llm';
    if (hasGemini) {
        activeProvider = 'gemini';
    } else if (hasGroq) {
        activeProvider = 'groq';
    } else if (hasOpenRouter) {
        activeProvider = 'openrouter';
    }

    const configuredModel = (process.env.GEMINI_MODEL || '').trim();

    return {
        hasGemini: isSupportedGeminiKey(apiKey),
        hasFallbackLlm,
        activeProvider,
        geminiModel: configuredModel || DEFAULT_GEMINI_MODEL,
    };
}

function normalizeModelName(rawModel: string): string {
    let modelName = rawModel.trim();
    if (modelName.startsWith('google/')) {
        modelName = modelName.replace('google/', '');
    }
    if (modelName.startsWith('models/')) {
        modelName = modelName.replace('models/', '');
    }
    return modelName || DEFAULT_GEMINI_MODEL;
}

function buildModelFallbackChain(primaryModel: string): string[] {
    const chain: string[] = [];
    const normalizedPrimary = normalizeModelName(primaryModel);
    if (normalizedPrimary) {
        chain.push(normalizedPrimary);
    }
    for (const candidate of GEMINI_FALLBACK_MODELS) {
        if (!chain.includes(candidate)) {
            chain.push(candidate);
        }
    }
    return chain;
}

function buildChatMessages(options: LlmCallOptions): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
        messages.push({
            role: 'system',
            content: getHardenedSystemInstruction(options.systemPrompt),
        });
    }
    if (options.messages && options.messages.length > 0) {
        for (const m of options.messages) {
            if (m.role === 'system') continue;
            messages.push({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
            });
        }
    } else if (options.userPrompt) {
        messages.push({
            role: 'user',
            content: options.userPrompt,
        });
    }
    return messages;
}

// ── Google Gemini Native REST API ──────────────────────────────────────────────

async function callSingleGeminiModel(
    options: LlmCallOptions,
    apiKey: string,
    modelName: string
): Promise<LlmResponse> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    const contents: Array<{ role?: string; parts: Array<{ text: string }> }> = [];

    if (options.messages && options.messages.length > 0) {
        for (const m of options.messages) {
            if (m.role === 'system') continue;
            contents.push({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            });
        }
    } else if (options.userPrompt) {
        contents.push({
            role: 'user',
            parts: [{ text: options.userPrompt }],
        });
    }

    const payload: Record<string, any> = {
        contents,
        generationConfig: {
            temperature: options.temperature ?? 0.1,
            maxOutputTokens: capOutputTokens(options.maxTokens),
            ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
    };

    if (options.systemPrompt) {
        payload.systemInstruction = {
            parts: [{ text: getHardenedSystemInstruction(options.systemPrompt) }],
        };
    }

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 20000);

    console.log(`[Gemini API] Requesting generateContent with model: "${modelName}"`);

    try {
        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
            cache: 'no-store',
        });

        clearTimeout(timeout);
        console.log(`[Gemini API] Status (${modelName}): ${resp.status}`);

        if (!resp.ok) {
            const errText = await resp.text();
            console.error(
                `[Gemini API] HTTP ${resp.status} failure for model "${modelName}":`,
                errText.slice(0, 500)
            );
            const error: any = new Error(
                `Gemini API error (HTTP ${resp.status} on ${modelName}): ${errText.slice(0, 300)}`
            );
            error.status = resp.status;
            error.responseBody = errText;
            error.model = modelName;
            throw error;
        }

        const data = await resp.json();
        const candidate = data?.candidates?.[0];
        const rawText = candidate?.content?.parts?.[0]?.text ?? '';
        const text = guardrailOutput(rawText);

        const promptTokens = data?.usageMetadata?.promptTokenCount;
        const completionTokens = data?.usageMetadata?.candidatesTokenCount;
        console.log(
            `[Gemini API] Success (${modelName}): generated response (${completionTokens ?? 'N/A'} completion tokens)`
        );

        return {
            text,
            provider: 'gemini',
            model: modelName,
            usage: {
                promptTokens,
                completionTokens,
                totalTokens: data?.usageMetadata?.totalTokenCount,
            },
        };
    } catch (e: any) {
        clearTimeout(timeout);
        throw e;
    }
}

async function callGeminiApiWithFallback(
    options: LlmCallOptions,
    apiKey: string,
    defaultModel: string
): Promise<LlmResponse> {
    const requestedModel = options.model || defaultModel || DEFAULT_GEMINI_MODEL;
    const candidateModels = buildModelFallbackChain(requestedModel);
    let lastError: any = null;

    for (let i = 0; i < candidateModels.length; i++) {
        const modelName = candidateModels[i];
        try {
            return await callSingleGeminiModel(options, apiKey, modelName);
        } catch (err: any) {
            lastError = err;
            const status = err?.status;
            const body = String(err?.responseBody || '');

            // If 403 indicates billing/free-tier disabled on the project, trip circuit breaker for 10 mins
            // and immediately delegate to the free fallback provider instead of retrying 4 Gemini models
            if (status === 403 && /billing|free tier is not available/i.test(body)) {
                geminiBillingBlockedUntil = Date.now() + 10 * 60 * 1000;
                console.warn('[Gemini API] Project requires billing (HTTP 403). Switching to free fallback LLM provider...');
                break;
            }

            const isRetryableModelOrQuotaError =
                status === 404 || status === 429 || status === 503 || status === 500 || status === 400;

            if (isRetryableModelOrQuotaError && i < candidateModels.length - 1) {
                const nextModel = candidateModels[i + 1];
                console.warn(
                    `[Gemini API] Model "${modelName}" failed with HTTP ${status ?? 'ERR'}. Falling back to "${nextModel}"...`
                );
                continue;
            }
            break;
        }
    }

    throw lastError || new Error('Gemini API request failed across all candidate models.');
}

// ── Free / Alternative LLM Fallback Providers (No Billing Required) ────────────

async function callOpenAiCompatibleFallback(options: LlmCallOptions): Promise<LlmResponse> {
    const messages = buildChatMessages(options);
    const maxTokens = capOutputTokens(options.maxTokens);

    // 1. Optional Groq API (if GROQ_API_KEY is configured)
    const groqKey = (process.env.GROQ_API_KEY || '').trim();
    if (groqKey) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 15000);
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${groqKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages,
                    temperature: options.temperature ?? 0.1,
                    max_tokens: maxTokens,
                    ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
                }),
                signal: ctrl.signal,
                cache: 'no-store',
            });
            clearTimeout(tid);
            if (res.ok) {
                const data = await res.json();
                const rawText = data?.choices?.[0]?.message?.content ?? '';
                return {
                    text: guardrailOutput(rawText),
                    provider: 'groq',
                    model: 'llama-3.3-70b-versatile',
                };
            }
        } catch (e: any) {
            console.warn('[LLM Fallback] Groq fallback failed:', e?.message || e);
        }
    }

    // 2. Optional Hugging Face Router (if HF_TOKEN has inference credits)
    const hfToken = getHuggingFaceToken();
    if (hfToken && process.env.ENABLE_HF_LLM_INFERENCE === 'true') {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${hfToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'Qwen/Qwen2.5-72B-Instruct',
                    messages,
                    temperature: options.temperature ?? 0.1,
                    max_tokens: maxTokens,
                }),
                signal: ctrl.signal,
                cache: 'no-store',
            });
            clearTimeout(tid);
            if (res.ok) {
                const data = await res.json();
                const rawText = data?.choices?.[0]?.message?.content ?? '';
                return {
                    text: guardrailOutput(rawText),
                    provider: 'huggingface',
                    model: 'Qwen/Qwen2.5-72B-Instruct',
                };
            }
        } catch {
            // Continue to zero-config free LLM fallback
        }
    }

    // 3. Zero-Config Free OpenAI-Compatible Endpoint (No Billing / No Key Required)
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 20000);
    try {
        console.log('[LLM Fallback] Calling free zero-billing OpenAI-compatible provider...');
        const res = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'openai',
                messages,
                temperature: options.temperature ?? 0.1,
                max_tokens: maxTokens,
                ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
            }),
            signal: ctrl.signal,
            cache: 'no-store',
        });
        clearTimeout(tid);

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Free LLM fallback error (HTTP ${res.status}): ${errText.slice(0, 200)}`);
        }

        const data = await res.json();
        const rawText = data?.choices?.[0]?.message?.content ?? '';
        const text = guardrailOutput(rawText);
        console.log(`[LLM Fallback] Success: generated response (${text.length} chars)`);

        return {
            text,
            provider: 'free-llm',
            model: data?.model || 'openai-free',
            usage: {
                promptTokens: data?.usage?.prompt_tokens,
                completionTokens: data?.usage?.completion_tokens,
                totalTokens: data?.usage?.total_tokens,
            },
        };
    } catch (e: any) {
        clearTimeout(tid);
        throw e;
    }
}

// ── Unified Call Handler ───────────────────────────────────────────────────────

export async function callLlm(options: LlmCallOptions): Promise<LlmResponse> {
    // Sanitize user inputs in options
    if (options.userPrompt) {
        const shield = scanAndShieldPrompt(options.userPrompt);
        if (!shield.safe) {
            throw new Error('Request blocked by AI Safety Shield: prompt injection or unsafe content detected.');
        }
        options.userPrompt = shield.sanitizedInput;
    }

    if (options.messages && options.messages.length > 0) {
        for (const m of options.messages) {
            if (m.role === 'user') {
                const shield = scanAndShieldPrompt(m.content);
                if (!shield.safe) {
                    throw new Error('Request blocked by AI Safety Shield: prompt injection or unsafe content detected.');
                }
                m.content = shield.sanitizedInput;
            }
        }
    }

    const status = getLlmStatus();
    const geminiKey = getGeminiApiKey();

    // Try Gemini first if configured and not circuit-broken by 403 billing disablement
    if (geminiKey && Date.now() >= geminiBillingBlockedUntil) {
        try {
            return await callGeminiApiWithFallback(options, geminiKey, status.geminiModel);
        } catch (geminiErr: any) {
            console.warn(
                `[LLM Provider] Gemini failed (${geminiErr?.message || geminiErr}). Automatically falling back to free LLM provider...`
            );
        }
    }

    // Automatic fallback to free zero-billing LLM provider
    return await callOpenAiCompatibleFallback(options);
}
