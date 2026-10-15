import { notFound } from 'next/navigation';
import StartedSessionPreview from './StartedSessionPreview';

export const metadata = { title: 'Köp upp till 10 min efter start | Lokal JumpYard-förhandsvisning' };

export default function StartedSessionPreviewPage() {
    if (process.env.NODE_ENV !== 'development') notFound();
    return <StartedSessionPreview />;
}
