import "./globals.css";

export const metadata = {
  title: "Landsraad Task Tracker",
  description: "Track weekly Landsraad tasks and rewards.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
