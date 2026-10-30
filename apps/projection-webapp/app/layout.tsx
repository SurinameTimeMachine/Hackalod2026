import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Was here – 's Lands Hospitaal 1921",
  description: "Projection wall of the patients of 's Lands Hospitaal, Paramaribo, 1921",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
