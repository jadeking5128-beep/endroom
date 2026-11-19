import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./phase4.css";
import "./nuvio-redesign.css";

export const metadata: Metadata = {
  title: "Nuvio",
  description: "A cinematic home for your movies, series and anime.",
  applicationName: "Nuvio",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Nuvio" }
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
