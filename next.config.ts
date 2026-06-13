import type { NextConfig } from "next";

/**
 * Content-Security-Policy wordt sinds 2026-06-13 AFDWINGEND en nonce-based
 * gezet in `src/proxy.ts` (per-request nonce — dat kan niet in een statische
 * `next.config`-header). Hier staan alleen de niet-nonce security-headers.
 *
 * Violations blijven binnenkomen op `/api/csp-report` (via `report-uri` +
 * `report-to`). Bekijk ze in de Vercel-logs op prefix `[csp-report]`.
 */

/**
 * Security headers — toegepast op alle routes.
 *
 * HSTS: 2 jaar + subdomains + preload — Vercel serveert ook standaard HSTS op
 * *.vercel.app, dit is explicit voor het custom domein. Pas op met preload op
 * subdomains die niet allemaal HTTPS spreken.
 */
const securityHeaders = [
  // De `Content-Security-Policy`-header zelf wordt per request in proxy.ts
  // gezet (nonce-based). Hier alleen de Reporting-API-groep waar de
  // `report-to`-directive in die CSP naar verwijst.
  {
    key: 'Reporting-Endpoints',
    value: 'csp-endpoint="/api/csp-report"',
  },
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
