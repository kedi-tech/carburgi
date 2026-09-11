import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

/**
 * Two families, as the design system asks: Outfit carries the headline figures
 * an administrator scans, Inter carries everything they read — grids, audit
 * trails, forms.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CARBUGUI · Back-office administrateur",
  description:
    "Supervision de la disponibilité carburant en Guinée : validations station, signalements usagers, catalogue et consolidation par zone, opérateur et produit.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} ${outfit.variable} antialiased`}>
      <head>
        {/*
          Material Symbols is an icon font, not a typeface: next/font cannot
          host it, and the ligature names are the icon API the design uses.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-dvh bg-surface text-on-surface">{children}</body>
    </html>
  );
}
