import { notFound } from 'next/navigation';

export default async function ContactPreviewPage() {
    if (process.env.NODE_ENV === 'development') {
        const { default: ContactPreview } = await import('./ContactPreview');
        return <ContactPreview />;
    }
    notFound();
}
