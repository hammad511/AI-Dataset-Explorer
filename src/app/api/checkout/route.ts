import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { calculateOrderAmount } from '@/server/pricing/catalog';
import { logSecurityEvent } from '@/server/security/securityLogger';
import { validateCsrf } from '@/server/security/csrf';
import { extractIp } from '@/server/security/rate-limit';

export async function POST(req: NextRequest) {
    const ip = extractIp(req);

    // CSRF validation
    const csrfCheck = validateCsrf(req);
    if (!csrfCheck.valid) {
        logSecurityEvent({
            eventType: 'CSRF_VIOLATION',
            severity: 'WARN',
            ip,
            endpoint: '/api/checkout',
            details: { reason: csrfCheck.reason },
        });
        return NextResponse.json({ success: false, error: 'CSRF validation failed.' }, { status: 403 });
    }

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || 'AI_Dataset_Explorer_Secret_12345' });
    if (!token || (!token.id && !token.email)) {
        return NextResponse.json({ success: false, error: 'Authentication required for checkout.' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { planId, interval, couponCode, clientPrice, clientAmount } = body;

        // Security check: If client tried to inject/manipulate price fields in body, log and ignore
        if (clientPrice !== undefined || clientAmount !== undefined) {
            logSecurityEvent({
                eventType: 'PRICE_TAMPERING_BLOCKED',
                severity: 'WARN',
                userId: token.sub || (token as any).id,
                ip,
                details: {
                    attemptedClientPrice: clientPrice,
                    attemptedClientAmount: clientAmount,
                    requestedPlan: planId,
                },
            });
        }

        if (!planId) {
            return NextResponse.json({ success: false, error: 'planId is required.' }, { status: 400 });
        }

        // Calculate strictly from server catalog
        const order = calculateOrderAmount(planId, interval === 'yearly' ? 'yearly' : 'monthly', couponCode);

        // Generate simulated checkout session ID
        const checkoutSessionId = `cs_test_${crypto.randomUUID()}`;

        return NextResponse.json({
            success: true,
            checkoutSessionId,
            order,
            checkoutUrl: `https://checkout.stripe.com/c/pay/${checkoutSessionId}`,
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message || 'Checkout creation failed.' }, { status: 400 });
    }
}
