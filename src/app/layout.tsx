import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "Solit POS",
  description:
    "Realtime QRIS Payment System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>
        {children}

        <Script
          src="https://app.sandbox.midtrans.com/snap/snap.js"
          data-client-key={
            process.env
              .NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
          }
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}