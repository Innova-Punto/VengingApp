/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default 1 MB es muy poco para fotos del operador (incluso
      // comprimidas pueden pasarse). 10 MB da margen sin riesgo de DoS.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
