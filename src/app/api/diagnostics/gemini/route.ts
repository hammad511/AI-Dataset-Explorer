import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getHuggingFaceToken } from '@/server/providers/huggingface';
import { isKaggleConfigured } from '@/server/providers/kaggle';
import { getGeminiApiKey, DEFAULT_GEMINI_MODEL } from '@/server/assistant/llmProvider';
import { getNcbiApiKey } from '@/server/papers/pubmed';
import { getSemanticScholarApiKey } from '@/server/papers/semanticScholar';
import { getOpenAlexApiKey, getOpenAlexEmail } from '@/server/papers/openAlex';
import { getPoliteContactEmail } from '@/server/papers/arxiv';

// Diagnostics endpoint — DISABLED in production.
// Requires: NODE_ENV=development AND DEBUG_API_TRACE=true AND valid auth session.
export async function GET(req: Request) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    if (process.env.DEBUG_API_TRACE !== 'true') {
        return NextResponse.json({ error: 'Not available.' }, { status: 404 });
    }

    const token = await getToken({ req: req as any, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const politeEmail = getPoliteContactEmail();

    return NextResponse.json({
        gemini:          { configured: !!getGeminiApiKey(), model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL },
        kaggle:          { configured: isKaggleConfigured() },
        huggingface:     { configured: !!getHuggingFaceToken() },
        pubmed:          { configured: !!getNcbiApiKey() },
        semanticScholar: { configured: !!getSemanticScholarApiKey() },
        openAlex:        { configured: !!(getOpenAlexApiKey() || getOpenAlexEmail()), hasApiKey: !!getOpenAlexApiKey() },
        arxiv:           { configured: process.env.ARXIV_ENABLED !== 'false', requiresKey: false },
        crossref:        { configured: !!politeEmail, requiresKey: false },
    });
}
