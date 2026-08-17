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
      // `unsafe-eval` is only needed in development:
      //   - Next.js dev server uses eval() for HMR / source maps
      //   - React 19 dev mode uses eval() to reconstruct component
      //     callstacks from the prod-style minified runtime
      // In production the bundle is static and the dev server is
      // gone, so eval() is never called. Leaving it allowed in prod
      // would be a real XSS risk (eval + injected JSON = arbitrary
      // code execution), so we gate it on NODE_ENV. Next sets
      // NODE_ENV=development for `next dev` and =production for
      // `next build` / `next start`, so this is safe to read here.
      `script-src 'self' 'unsafe-inline'${
        process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
      }`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      // `connect-src` opens for the API origin (HTTP + WS) so every
      // sub-path under `/api/v1/...` is reachable regardless of what
      // `NEXT_PUBLIC_API_URL` includes. We strip the path component
      // because CSP source lists only do path-prefix match when the
      // entry ends in `/`; an entry like `http://localhost:3000/api/v1`
      // would only allow that exact URL and block every sub-path.
      // The WS origin is derived from the same URL so production
      // (`https://api.goalxi.app`) gets `wss://api.goalxi.app`
      // instead of the hard-coded `ws://localhost:3000` dev default.
      // Override at build time via
      // `NEXT_PUBLIC_API_URL=https://api.goalxi.app`.
      (() => {
        const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
        let apiOrigin = "http://localhost:3000";
        let wsOrigin = "ws://localhost:3000";
        try {
          const u = new URL(raw);
          apiOrigin = u.origin;
          wsOrigin = `${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`;
        } catch {
          /* keep dev defaults */
        }
        return `connect-src 'self' ${apiOrigin} ${wsOrigin} wss://*`;
      })(),
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
