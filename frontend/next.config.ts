import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    // Prevent MIME-type sniffing
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    // Prevent clickjacking
                    { key: 'X-Frame-Options', value: 'DENY' },
                    // Control referrer information
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    // Restrict browser feature access
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                    // DNS prefetch control
                    { key: 'X-DNS-Prefetch-Control', value: 'on' },
                    // Force HTTPS for 1 year including subdomains
                    // NOTE: only activate HSTS once your domain has a valid TLS certificate in production.
                    // For local development this header is ignored by browsers over HTTP.
                    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
                    // Content Security Policy
                    // Allows: same-origin scripts/styles, OpenRouter API, HuggingFace, Kaggle, Google OAuth.
                    // Tighten 'unsafe-inline' for scripts once you move to nonce-based CSP in production.
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                            "style-src 'self' 'unsafe-inline'",
                            "img-src 'self' data: https: blob:",
                            "font-src 'self' data:",
                            // API connections this app makes at runtime
                            "connect-src 'self' https://openrouter.ai https://huggingface.co https://www.kaggle.com https://accounts.google.com",
                            // OAuth redirects
                            "frame-src https://accounts.google.com",
                            "form-action 'self'",
                            "base-uri 'self'",
                            "object-src 'none'",
                            "upgrade-insecure-requests",
                        ].join('; '),
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
