'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
    value: string;
    className?: string;
    testId?: string;
}

export const QrCode = ({ value, className = 'w-36 h-36', testId }: QrCodeProps) => {
    const [svg, setSvg] = useState('');

    useEffect(() => {
        let cancelled = false;

        QRCode.toString(value, {
            color: {
                dark: '#000000',
                light: '#FFFFFF',
            },
            errorCorrectionLevel: 'M',
            margin: 4,
            type: 'svg',
        })
            .then((nextSvg) => {
                if (!cancelled) setSvg(nextSvg);
            })
            .catch(() => {
                if (!cancelled) setSvg('');
            });

        return () => {
            cancelled = true;
        };
    }, [value]);

    if (!svg) {
        return (
            <div
                role="img"
                aria-label="QR code"
                data-testid={testId}
                data-qr-value={value}
                className={`${className} bg-white`}
            />
        );
    }

    return (
        <span
            role="img"
            aria-label="QR code"
            data-testid={testId}
            data-qr-value={value}
            className={`inline-block bg-white [&_svg]:h-full [&_svg]:w-full ${className}`}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
};
