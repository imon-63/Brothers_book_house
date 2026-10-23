import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import { SiteFrame } from "@/components/layout/site-frame";
import { ThemeSync } from "@/components/providers/theme-sync";
import { THEME_BOOT } from "@/lib/theme";
import "./theme.css";
import "./globals.css";
import "./motion.css";
import "./storefront.css";
import "./theme-mint.css";

export const metadata: Metadata = {
  title: "চলো — কিনে ফেলি",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Anek+Bangla:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AppProviders>
          <ThemeSync />
          <SiteFrame>{children}</SiteFrame>
        </AppProviders>
      </body>
    </html>
  );
}
