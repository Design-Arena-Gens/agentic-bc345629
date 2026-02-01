import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoxelCraft Web",
  description: "A browser-based voxel sandbox inspired by Minecraft",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
