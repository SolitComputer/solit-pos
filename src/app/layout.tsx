import "./globals.css";

export const metadata = {
  title: "Solit POS",
  description:
    "Realtime Payment & Inventory System",
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
      </body>
    </html>
  );
}