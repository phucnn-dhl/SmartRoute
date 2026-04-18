import type { Metadata } from 'next';
import './globals.css';
import './map.css';

export const metadata: Metadata = {
  title: 'SmartRoute - Traffic Prediction Map',
  description: 'Dự báo tình trạng giao thông TP.HCM',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
