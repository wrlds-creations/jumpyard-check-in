import { notFound } from 'next/navigation';
import DayPreview from './DayPreview';

export const metadata = { title: 'Hela dagen | Lokal JumpYard-förhandsvisning' };

export default function DayPreviewPage() {
    if (process.env.NODE_ENV !== 'development') notFound();
    return <DayPreview />;
}
