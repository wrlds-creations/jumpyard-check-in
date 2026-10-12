import { notFound } from 'next/navigation';
import SistaSidanPreview from './SistaSidanPreview';

export const metadata = { title: 'Sista sidan, väg i tre steg | Lokal JumpYard-förhandsvisning' };

export default function SistaSidanPreviewPage() {
    if (process.env.NODE_ENV !== 'development') notFound();
    return <SistaSidanPreview />;
}
