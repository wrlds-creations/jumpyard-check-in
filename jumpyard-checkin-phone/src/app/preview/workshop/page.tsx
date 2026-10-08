import { notFound } from 'next/navigation';
import WorkshopPreview from './WorkshopPreview';

export const metadata = { title: 'Köpflödet efter workshopen | Lokal JumpYard-förhandsvisning' };

export default function WorkshopPreviewPage() {
    if (process.env.NODE_ENV !== 'development') notFound();
    return <WorkshopPreview />;
}
