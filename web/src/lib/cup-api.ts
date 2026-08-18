// Cup API client for web/. Mirrors the request helper used in forum-api.ts —
// public endpoints, no auth header required, but the helper still reads the
// JWT from localStorage so the same code path works for both public and
// authenticated reads (a logged-in user opening the cup page just gets the
// token attached harmlessly).

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

/* ------------------------------------------------------------------ *
 * Wire types — mirror the DTOs in api/src/api/cup/dto/*.ts.  If the
 * server adds fields, the FE gracefully tolerates them (TS excess
 * property checks are off in the request<T> path; we only consume the
 * fields we use).
 * ------------------------------------------------------------------ */

export type CupStatus = "pending" | "in_progress" | "completed";

export type CupRoundStatus = "pending" | "in_progress" | "completed";

export type CupRoundKind = "qualifying" | "proper" | "knockout" | "final";

export interface CupRef {
  id: string;
  season: number;
  type: string;
  name: string;
  status: CupStatus;
  prizeCurrency: string;
  prizePool: number;
  createdAt: string;
  updatedAt: string;
}

export interface CupMatch {
  matchId: string | null;
  homeTeam: { id: string; name: string; tier: number } | null;
  awayTeam: { id: string; name: string; tier: number } | null;
  winnerTeamId: string | null;
  isBye: boolean;
  scheduledAt: string | null;
}

export interface CupRound {
  roundNumber: number;
  /** Display label from the generator: "Pre-Qualifying", "R3 Proper",
   *  "Quarter-Final", "Semi-Final", "Final", etc. The FE renders this
   *  verbatim — no i18n mapping — so the i18n cost stays at zero. */
  roundName: string;
  kind: CupRoundKind;
  status: CupRoundStatus;
  scheduledAt: string | null;
  matches: CupMatch[];
}

export interface CupBracket {
  cup: CupRef;
  rounds: CupRound[];
}

/* ------------------------------------------------------------------ *
 * Request helper
 * ------------------------------------------------------------------ */

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("goalxi_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    cache: "no-store",
    ...options,
    headers,
  });
  if (!res.ok) {
    let message = `API Error: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      const m = body?.message || body?.error;
      if (m) message = Array.isArray(m) ? m.join(", ") : String(m);
    } catch {
      // ignore
    }
    const err: any = new Error(message);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ------------------------------------------------------------------ *
 * Public client
 * ------------------------------------------------------------------ */

export const cupApi = {
  listCups: (params?: { season?: number; type?: string }) => {
    const sp = new URLSearchParams();
    if (params?.season !== undefined)
      sp.append("season", String(params.season));
    if (params?.type) sp.append("type", params.type);
    const qs = sp.toString();
    return request<CupRef[]>(`/cups${qs ? `?${qs}` : ""}`);
  },

  getCup: (id: string) => request<CupRef>(`/cups/${id}`),

  getBracket: (id: string) => request<CupBracket>(`/cups/${id}/bracket`),
};
