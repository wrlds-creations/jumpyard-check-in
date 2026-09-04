import { notFound } from 'next/navigation';
import SafetyVideoPreview from './SafetyVideoPreview';

export const metadata = { title: 'Säkerhetsvideo | Lokal JumpYard förhandsvisning' };

export default function SafetyPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <SafetyVideoPreview />;
}
