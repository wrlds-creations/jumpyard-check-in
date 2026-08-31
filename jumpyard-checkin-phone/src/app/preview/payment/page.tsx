import { notFound } from 'next/navigation';
import PhonePaymentPreview from './PhonePaymentPreview';

export const metadata = { title: 'Telefonbetalning | Lokal JumpYard förhandsvisning' };

export default function PaymentPreviewPage() {
  // The production export renders a not-found page, never the fixture controls.
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PhonePaymentPreview />;
}
