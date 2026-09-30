import { notFound } from 'next/navigation';

export default async function AddonsPreviewPage() {
    if (process.env.NODE_ENV === 'development') {
        const { default: AddonsPreview } = await import('./AddonsPreview');
        return <AddonsPreview />;
    }
    notFound();
}
