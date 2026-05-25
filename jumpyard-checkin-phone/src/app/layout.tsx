import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JumpYard Connected Entry",
  description: "Next-Gen Kiosk Experience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
