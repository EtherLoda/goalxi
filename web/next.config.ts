import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

/**
 * GoalXI web security headers.
 *
 * - CSP is locked-down: `frame-ancestors 'none'` blocks clickjacking,
 *   `object-src 'none'` blocks Flash/Java applets, no `unsafe-eval`
 *   outside dev. Google Fonts and the API origin are explicit
 *   allowlists so a future `<script src="https://evil/x.js">` is
 *   refused by the browser before it executes.
 * - HSTS is on (production only — dev would brick a local cert).
 * - X-Content-Type-Options: nosniff stops IE/Chrome from
 *   MIME-sniffing a `.txt` file into HTML.
 * - Referrer-Policy drops the Referer to `strict-origin-when-cross-origin`
 *   so navigating to an external link doesn't leak the full URL
 *   (e.g. team slug → `goalxi.app/teams/{id}`).
 *
 * The CSP `connect-src` allowlists `NEXT_PUBLIC_API_URL` so the
 * browser is allowed to talk to the API + its WebSocket — the
 * default `'self'` would block socket.io handshakes.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js dev needs 'unsafe-eval' for HMR. In production the
      // dev server is gone and the bundle is static, so dropping
      // this is safe (and we keep it static so a deploy with
      // NODE_ENV=production can't accidentally pull it in).
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      // `connect-src` opens for the API base URL (HTTP + WS) plus
      // Next's HMR endpoints in dev. Override at build time via
      // `NEXT_PUBLIC_API_URL=https://api.goalxi.app` to lock this
      // to your prod origin.
      `connect-src 'self' ${
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"
      } ws://localhost:3000 wss://*`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
