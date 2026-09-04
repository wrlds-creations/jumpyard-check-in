import { notFound } from 'next/navigation';
import ExtensionPreview from './ExtensionPreview';

export const metadata = { title: 'Förlängning | Lokal JumpYard förhandsvisning' };

export default function ExtendPage() {
  // No real extension contract exists. Direct URLs must not expose simulated sales.
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ExtensionPreview />;
}
