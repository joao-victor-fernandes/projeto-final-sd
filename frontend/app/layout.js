import "./globals.css";

export const metadata = {
  title: "Oficina Demo",
  description: "Demo local com Next, Express e RabbitMQ"
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
