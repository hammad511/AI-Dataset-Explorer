import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Diagnostics endpoint — DISABLED in production.
// Requires: NODE_ENV=development AND DEBUG_API_TRACE=true AND valid auth session.
export async function GET(req: Request) {
    // Hard block in production — regardless of any other flag
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    // Require debug trace flag
    if (process.env.DEBUG_API_TRACE !== 'true') {
        return NextResponse.json({ error: 'Not available.' }, { status: 404 });
    }

    // Require authenticated session even in dev
    const token = await getToken({ req: req as any, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
        openrouter:   { configured: !!process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'not set' },
        kaggle:       { configured: !!(process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY) },
        huggingface:  { configured: !!process.env.HUGGING_FACE_TOKEN },
    });
}
