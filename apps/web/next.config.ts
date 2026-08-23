import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack is the default in 16; this block is only for options.
  turbopack: {},
// Next 16 blocks dev requests from an origin it does not know. Public
// tunnels are how this app gets tested from a phone off the LAN, so their
// hostnames have to be listed or the dev server rejects every asset.
allowedDevOrigins: [
  '192.168.1.225',
  '*.ngrok-free.app',
  '*.ngrok-free.dev',
  '*.ngrok.io',
  '*.ngrok.app',
  '*.exp.direct',
],
  images: {
    remotePatterns: [
      // Supabase Storage signed URLs.
      { protocol: 'https', hostname: 'uenmgxvmxdjgyavyslmn.supabase.co' },
    ],
  },

  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
