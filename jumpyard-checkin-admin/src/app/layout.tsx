import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import "./globals.css";

export const metadata: Metadata = {
  title: "JumpYard Check-in Personalhandoff",
  description: "Personalapp för JumpYard check-in och handoff",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JY Handoff",
  },
};

export const viewport: Viewport = {
  themeColor: "#E31837",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // #541: Acumin, the check-in font (D0247), starts loading with the page, not when the first text renders.
  preload("/fonts/AcuminVariableConcept.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
