import { notFound } from 'next/navigation';

export default async function PastePreviewPage() {
    if (process.env.NODE_ENV === 'development') {
        const { default: PastePreview } = await import('./PastePreview');
        return <PastePreview />;
    }
    notFound();
}
