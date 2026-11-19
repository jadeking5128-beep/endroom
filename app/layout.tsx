import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./phase4.css";

export const metadata: Metadata = {
  title: "Nuvio Web",
  description: "Your media, organised around you.",
  applicationName: "Nuvio Web",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Nuvio" }
};

export const viewport: Viewport = {
  themeColor: "#090a0c",
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
