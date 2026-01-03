import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // reduz JS carregado do firebase
    optimizePackageImports: [
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "firebase/storage",
    ],
  },
  reactStrictMode: true,
  // (opcional) Se usar imagens externas, configure aqui:
  // images: { remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }] }
};

export default nextConfig;
