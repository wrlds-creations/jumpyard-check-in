import type { Metadata, Viewport } from "next";
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
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
