// Forum-specific typed API client. Wraps the shared fetchJson helper.

const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('goalxi_token') : null;
    const headers = new Headers(options?.headers);
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        cache: 'no-store',
        ...options,
        headers,
    });
    if (!res.ok) {
        let msg = `API Error: ${res.status} ${res.statusText}`;
        try {
            const body = await res.json();
            const m = body.message || body.error;
            if (m) msg = Array.isArray(m) ? m.join(', ') : m;
        } catch {}
        const err: any = new Error(msg);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

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

export interface Pagination {
    limit: number;
    currentPage: number;
    nextPage?: number | null;
    previousPage?: number | null;
    totalRecords: number;
    totalPages: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: Pagination;
}

export interface ReactionSummary {
    count: number;
    hasReacted: boolean;
}

export interface ReactionList {
    users: AuthorRef[];
    count: number;
}

export type ThreadSort = 'latest' | 'hot';

export const forumApi = {
    listCategories: () =>
        fetchJson<ForumCategory[]>('/forum/categories'),

    getCategoryBySlug: (slug: string) =>
        fetchJson<ForumCategory>(`/forum/categories/${slug}`),

    listThreads: (
        categoryId: string,
        params?: { page?: number; limit?: number; sort?: ThreadSort },
    ) => {
        const sp = new URLSearchParams();
        if (params?.page) sp.append('page', String(params.page));
        if (params?.limit) sp.append('limit', String(params.limit));
        if (params?.sort) sp.append('sort', params.sort);
        const qs = sp.toString();
        return fetchJson<PaginatedResponse<ForumThread>>(
            `/forum/categories/${categoryId}/threads${qs ? `?${qs}` : ''}`,
        );
    },

    getThread: (id: string) =>
        fetchJson<{ data: ForumThread }>(`/forum/threads/${id}`).then(r => r.data),

    createThread: (categoryId: string, body: { title: string; body: string }) =>
        fetchJson<{ data: ForumThread }>(
            `/forum/categories/${categoryId}/threads`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            },
        ).then(r => r.data),

    deleteThread: (id: string) =>
        fetchJson<void>(`/forum/threads/${id}`, { method: 'DELETE' }),

    listPosts: (threadId: string, params?: { page?: number; limit?: number }) => {
        const sp = new URLSearchParams();
        if (params?.page) sp.append('page', String(params.page));
        if (params?.limit) sp.append('limit', String(params.limit));
        const qs = sp.toString();
        return fetchJson<PaginatedResponse<ForumPost>>(
            `/forum/threads/${threadId}/posts${qs ? `?${qs}` : ''}`,
        );
    },

    createPost: (threadId: string, body: { body: string }) =>
        fetchJson<{ data: ForumPost }>(
            `/forum/threads/${threadId}/posts`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            },
        ).then(r => r.data),

    deletePost: (id: string) =>
        fetchJson<void>(`/forum/posts/${id}`, { method: 'DELETE' }),

    toggleReaction: (postId: string) =>
        fetchJson<{ data: ReactionSummary }>(
            `/forum/posts/${postId}/reactions`,
            { method: 'POST' },
        ).then(r => r.data),

    listReactions: (postId: string) =>
        fetchJson<{ data: ReactionList }>(
            `/forum/posts/${postId}/reactions`,
        ).then(r => r.data),
};
