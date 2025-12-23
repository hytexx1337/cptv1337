import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Poppins } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GoogleAnalytics from "@/components/GoogleAnalytics";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CineParaTodos - Películas y Series Online Gratis",
    template: "%s | CineParaTodos"
  },
  description: "Descubre las mejores películas y series con CineParaTodos. Explora contenido popular, busca tus títulos favoritos y mantente al día con las últimas tendencias. Ver películas online gratis en HD.",
  keywords: ["películas online", "series online", "ver películas gratis", "streaming gratis", "cine online", "películas HD", "series HD"],
  authors: [{ name: "CineParaTodos" }],
  creator: "CineParaTodos",
  publisher: "CineParaTodos",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://cineparatodos.lat'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: "CineParaTodos - Películas y Series Online Gratis",
    description: "Descubre las mejores películas y series online. Contenido en HD, sin anuncios molestos. ¡Entra y disfruta!",
    url: 'https://cineparatodos.lat',
    siteName: 'CineParaTodos',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'CineParaTodos Logo',
      },
    ],
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "CineParaTodos - Películas y Series Online Gratis",
    description: "Descubre las mejores películas y series online. Contenido en HD, sin anuncios molestos.",
    images: ['/logo.png'],
    creator: '@cineparatodos',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Agregá estos cuando tengas las cuentas:
    // google: 'tu-codigo-de-verificacion',
    // yandex: 'tu-codigo-yandex',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        {/* Google Cast SDK - Necesario para Chromecast */}
        {/* CRÍTICO: Cargar AMBOS scripts del Cast SDK */}
        <Script
          src="https://www.gstatic.com/cast/sdk/libs/sender/1.0/cast_framework.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${poppins.variable} antialiased bg-black text-white min-h-screen font-sans`}>
        <GoogleAnalytics />
        <Header />
        <main className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
