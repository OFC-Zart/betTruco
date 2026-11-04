import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter, Share_Tech_Mono } from "next/font/google";
import { ToastProvider } from "@/components/resenha/toast";
import { RegistrarSW } from "@/components/resenha/registrar-sw";
import "./globals.css";

const defaultUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Placar da Resenha",
  description: "Placar do truco e apostas amistosas da turma. Só registro: o acerto é entre vocês.",
  applicationName: "Placar da Resenha",
  appleWebApp: { capable: true, title: "Resenha", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const bebas = Bebas_Neue({ variable: "--font-bebas", weight: "400", subsets: ["latin"], display: "swap" });
const placar = Share_Tech_Mono({ variable: "--font-placar", weight: "400", subsets: ["latin"], display: "swap" });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable} ${bebas.variable} ${placar.variable}`}>
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
        <RegistrarSW />
      </body>
    </html>
  );
}
