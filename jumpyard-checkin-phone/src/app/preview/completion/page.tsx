import { notFound } from 'next/navigation';
import CompletionPreview from './CompletionPreview';

export const metadata = { title: 'Slutsida i telefon | Lokal JumpYard-förhandsvisning' };

export default function CompletionPreviewPage() {
    if (process.env.NODE_ENV !== 'development') notFound();
    return <CompletionPreview />;
}
