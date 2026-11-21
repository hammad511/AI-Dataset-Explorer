import { NextResponse } from "next/server";
import { getHuggingFaceToken } from "@/server/providers/huggingface";
import { isKaggleConfigured } from "@/server/providers/kaggle";
import { getLlmStatus } from "@/server/assistant/llmProvider";
import { getNcbiApiKey } from "@/server/papers/pubmed";
import { getSemanticScholarApiKey } from "@/server/papers/semanticScholar";
import { getOpenAlexApiKey, getOpenAlexEmail } from "@/server/papers/openAlex";
import { getPoliteContactEmail } from "@/server/papers/arxiv";

export const dynamic = "force-dynamic";

/**
 * Non-secret live telemetry endpoint exposing provider readiness and active LLM backend.
 * Zero credentials, tokens, or env secrets are ever serialized here.
 */
export async function GET() {
    const llm = getLlmStatus();
    const politeEmail = getPoliteContactEmail();

    return NextResponse.json(
        {
            status: "ok",
            timestamp: Date.now(),
            providers: {
                huggingface: { online: Boolean(getHuggingFaceToken()), label: "Hugging Face" },
                kaggle: { online: isKaggleConfigured(), label: "Kaggle" },
                openalex: { online: Boolean(getOpenAlexApiKey() || getOpenAlexEmail()), label: "OpenAlex" },
                arxiv: { online: process.env.ARXIV_ENABLED !== "false", label: "arXiv" },
                pubmed: { online: true, enhancedRateLimit: Boolean(getNcbiApiKey()), label: "PubMed" },
                semanticScholar: { online: Boolean(getSemanticScholarApiKey()), optionalKey: !getSemanticScholarApiKey(), label: "Semantic Scholar" },
                crossref: { online: Boolean(politeEmail), label: "Crossref" },
            },
            llm: {
                activeProvider: llm.activeProvider,
                model: llm.geminiModel,
                hasGemini: llm.hasGemini,
                hasFallbackLlm: llm.hasFallbackLlm,
            },
        },
        {
            headers: {
                "Cache-Control": "no-store, max-age=0",
            },
        }
    );
}
