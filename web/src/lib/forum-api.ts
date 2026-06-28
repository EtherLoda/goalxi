// Forum API client for web/. Mirrors the request helper used in api.ts —
// reads the JWT from localStorage directly (same key as the rest of web/).

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

export interface AuthorRef {
  id: string;
  username: string | null;
}

export interface ForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  threadCount: number;
  postCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface ForumThread {
  id: string;
  categoryId: string;
  authorId: string;
  author: AuthorRef | null;
  title: string;
  body: string;
  isPinned: boolean;
  replyCount: number;
  lastReplyAt: string | null;
  lastReplyUserId: string | null;
  lastReplyUser: AuthorRef | null;
  hotScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface ForumPost {
  id: string;
  threadId: string;
  authorId: string;
  author: AuthorRef | null;
  body: string;
  reactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ForumPagination {
  limit: number;
  currentPage: number;
  nextPage?: number | null;
  previousPage?: number | null;
  totalRecords: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: ForumPagination;
}

export interface ReactionSummary {
  count: number;
  hasReacted: boolean;
}

export type ThreadSort = "latest" | "hot";
export type PostSort = "oldest" | "newest";

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

export const forumApi = {
  listCategories: () => request<ForumCategory[]>("/forum/categories"),

  getCategoryBySlug: (slug: string) =>
    request<ForumCategory>(`/forum/categories/${slug}`),

  listThreads: (
    categoryId: string,
    params?: { page?: number; limit?: number; sort?: ThreadSort },
  ) => {
    const sp = new URLSearchParams();
    if (params?.page) sp.append("page", String(params.page));
    if (params?.limit) sp.append("limit", String(params.limit));
    if (params?.sort) sp.append("sort", params.sort);
    const qs = sp.toString();
    return request<PaginatedResponse<ForumThread>>(
      `/forum/categories/${categoryId}/threads${qs ? `?${qs}` : ""}`,
    );
  },

  getThread: (id: string) =>
    request<{ data: ForumThread }>(`/forum/threads/${id}`).then((r) => r.data),

  createThread: (categoryId: string, body: { title: string; body: string }) =>
    request<{ data: ForumThread }>(
      `/forum/categories/${categoryId}/threads`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ).then((r) => r.data),

  deleteThread: (id: string) =>
    request<void>(`/forum/threads/${id}`, { method: "DELETE" }),

  listPosts: (
    threadId: string,
    params?: { page?: number; limit?: number; sort?: PostSort },
  ) => {
    const sp = new URLSearchParams();
    if (params?.page) sp.append("page", String(params.page));
    if (params?.limit) sp.append("limit", String(params.limit));
    if (params?.sort) sp.append("sort", params.sort);
    const qs = sp.toString();
    return request<PaginatedResponse<ForumPost>>(
      `/forum/threads/${threadId}/posts${qs ? `?${qs}` : ""}`,
    );
  },

  createPost: (threadId: string, body: { body: string }) =>
    request<{ data: ForumPost }>(`/forum/threads/${threadId}/posts`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.data),

  deletePost: (id: string) =>
    request<void>(`/forum/posts/${id}`, { method: "DELETE" }),

  toggleReaction: (postId: string) =>
    request<{ data: ReactionSummary }>(`/forum/posts/${postId}/reactions`, {
      method: "POST",
    }).then((r) => r.data),
};