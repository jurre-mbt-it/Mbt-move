import type { NextConfig } from "next";

/**
 * Content-Security-Policy — voorlopig in REPORT-ONLY modus (M2 uit de privacy-
 * audit). Report-only blokkeert niets en breekt dus geen productie; de browser
 * rapporteert alleen overtredingen (zichtbaar in de console, of via een
 * report endpoint als je dat later koppelt). Zo kunnen we de policy aanscherpen
 * op basis van echte violations vóór we 'm afdwingend maken.
 *
 * Violations worden verzameld op `/api/csp-report` (via `report-uri` + de
 * moderne `report-to`/`Reporting-Endpoints`). Bekijk ze in de Vercel-logs op
 * prefix `[csp-report]`.
 *
 * Aanpak om afdwingend te worden:
 *   1. Draai dit een tijd in productie, verzamel violations (sink staat live).
 *   2. Vervang per directive de brede waarden (bv. 'unsafe-inline'/'unsafe-eval'
 *      voor scripts) door nonces/hashes — vereist waarschijnlijk middleware.
 *   3. Hernoem de header naar `Content-Security-Policy` (zonder -Report-Only).
 *
 * 'unsafe-inline'/'unsafe-eval' staan nu toe omdat Next.js inline/eval-scripts
 * injecteert; connect-src dekt Supabase (REST + realtime wss), Sentry en Vercel
 * Analytics; frame-src/media-src dekken de video-embeds (YouTube/Vimeo/Mux/CF).
 */
const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://vitals.vercel-insights.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://iframe.mediadelivery.net https://*.mux.com",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  // Violations verzamelen: legacy `report-uri` + moderne `report-to`-groep
  // (gedefinieerd via de `Reporting-Endpoints`-header hieronder).
  "report-uri /api/csp-report",
  "report-to csp-endpoint",
].join('; ');

/**
 * Security headers — toegepast op alle routes.
 *
 * HSTS: 2 jaar + subdomains + preload — Vercel serveert ook standaard HSTS op
 * *.vercel.app, dit is explicit voor het custom domein. Pas op met preload op
 * subdomains die niet allemaal HTTPS spreken.
 */
const securityHeaders = [
  {
    key: 'Content-Security-Policy-Report-Only',
    value: contentSecurityPolicyReportOnly,
  },
  // Moderne Reporting API — definieert de `csp-endpoint`-groep waar de
  // `report-to`-directive naar verwijst. Same-origin route.
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
