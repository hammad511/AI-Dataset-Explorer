import { NextResponse } from "next/server";

export async function GET() {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
    const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";

    try {
        if (!OPENROUTER_API_KEY) {
            return NextResponse.json({
                provider: "openrouter",
                apiKeyConfigured: false,
                modelConfigured: !!process.env.OPENROUTER_MODEL,
                configuredModel: OPENROUTER_MODEL,
                connectionTest: "failed - no api key",
                error: "Missing OPENROUTER_API_KEY",
            }, { status: 401 });
        }

        return NextResponse.json({
            provider: "openrouter",
            apiKeyConfigured: true,
            modelConfigured: !!process.env.OPENROUTER_MODEL,
            configuredModel: OPENROUTER_MODEL,
            connectionTest: "ready",
            message: "OpenRouter is the active provider.",
        });
    } catch (e: any) {
        return NextResponse.json({
            provider: "openrouter",
            apiKeyConfigured: !!OPENROUTER_API_KEY,
            modelConfigured: !!process.env.OPENROUTER_MODEL,
            configuredModel: OPENROUTER_MODEL,
            connectionTest: "failed",
            error: e.message,
        }, { status: 500 });
    }
}
