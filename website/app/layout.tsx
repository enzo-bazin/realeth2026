import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IrisWallet | Biometric Wallet Access",
  description:
    "IrisWallet is a biometric wallet platform focused on iris recognition, anti-spoofing, and secure digital access.",
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
