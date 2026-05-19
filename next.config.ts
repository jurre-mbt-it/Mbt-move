import type { NextConfig } from "next";

/**
 * Security headers — toegepast op alle routes. Bewust géén Content-Security-Policy
 * hier omdat Next.js + Supabase + Vercel Analytics inline scripts gebruiken; een
 * verkeerde CSP breekt productie zonder waarschuwing. CSP later los toevoegen
 * via een report-only fase.
 *
 * HSTS: 2 jaar + subdomains + preload — Vercel serveert ook standaard HSTS op
 * *.vercel.app, dit is explicit voor het custom domein. Pas op met preload op
 * subdomains die niet allemaal HTTPS spreken.
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // App heeft geen camera/mic/geolocation nodig — expliciet uitzetten.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.120.1.231'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
