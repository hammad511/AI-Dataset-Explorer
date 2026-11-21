import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    poweredByHeader: false, // Remove X-Powered-By: Next.js
    experimental: {
        turbopackFileSystemCacheForDev: false,
    },
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
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
                    // DNS prefetch control
                    { key: 'X-DNS-Prefetch-Control', value: 'on' },
                    // Force HTTPS for 2 years including subdomains with HSTS preload (Item 1)
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                    // Content Security Policy
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                            "style-src 'self' 'unsafe-inline'",
                            "img-src 'self' data: https: blob:",
                            "font-src 'self' data:",
                            "connect-src 'self' https://huggingface.co https://www.kaggle.com https://accounts.google.com https://generativelanguage.googleapis.com",
                            "frame-src https://accounts.google.com",
                            "form-action 'self' https://accounts.google.com",
                            "base-uri 'self'",
                            "object-src 'none'",
                            ...(process.env.NODE_ENV === 'production' ? ["upgrade-insecure-requests"] : []),
                        ].join('; '),
                    },
                ],
            },
            {
                source: '/api/(.*)',
                headers: [
                    // Disable search engine indexing on all API endpoints (Item 15)
                    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
                    // Prevent caching of sensitive API data
                    { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
                    { key: 'Pragma', value: 'no-cache' },
                    { key: 'Expires', value: '0' },
                ],
            },
        ];
    },
};

export default nextConfig;
