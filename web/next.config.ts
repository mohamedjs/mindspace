import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack is the default in 16; this block is only for options.
  turbopack: {},

  images: {
    remotePatterns: [
      // Supabase Storage signed URLs.
      { protocol: 'https', hostname: 'uenmgxvmxdjgyavyslmn.supabase.co' },
    ],
  },

  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
