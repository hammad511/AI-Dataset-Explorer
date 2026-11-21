import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { validateUploadedFile } from '@/server/security/uploadValidator';
import { logSecurityEvent } from '@/server/security/securityLogger';
import { validateCsrf } from '@/server/security/csrf';
import { extractIp } from '@/server/security/rate-limit';

export async function POST(req: NextRequest) {
    const ip = extractIp(req);

    // CSRF check
    const csrfCheck = validateCsrf(req);
    if (!csrfCheck.valid) {
        logSecurityEvent({
            eventType: 'CSRF_VIOLATION',
            severity: 'WARN',
            ip,
            endpoint: '/api/upload',
            details: { reason: csrfCheck.reason },
        });
        return NextResponse.json({ success: false, error: 'CSRF validation failed.' }, { status: 403 });
    }

    // Auth check
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || 'AI_Dataset_Explorer_Secret_12345' });
    if (!token || (!token.id && !token.email)) {
        return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const validation = validateUploadedFile(buffer, file.name, file.type);
        if (!validation.valid) {
            logSecurityEvent({
                eventType: 'UPLOAD_REJECTED',
                severity: 'WARN',
                userId: token.sub || (token as any).id,
                ip,
                details: { filename: file.name, error: validation.error },
            });
            return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
        }

        logSecurityEvent({
            eventType: 'UPLOAD_SUCCESS',
            severity: 'INFO',
            userId: token.sub || (token as any).id,
            ip,
            details: { safeFilename: validation.safeFilename, size: validation.sizeBytes, mime: validation.detectedMime },
        });

        return NextResponse.json({
            success: true,
            filename: validation.safeFilename,
            mimeType: validation.detectedMime,
            sizeBytes: validation.sizeBytes,
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: 'File upload processing failed.' }, { status: 500 });
    }
}
