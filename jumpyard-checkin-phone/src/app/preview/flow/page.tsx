import { notFound } from 'next/navigation';

export default async function FlowPreviewPage() {
    if (process.env.NODE_ENV === 'development') {
        const { default: FlowPreview } = await import('./FlowPreview');
        return <FlowPreview />;
    }
    notFound();
}
