'use client';

import { useState, useCallback, useEffect } from 'react';
import { api, Notification, NotificationListResponse } from '@/lib/api';

interface UseNotificationsReturn {
  notifications: Notification[];
  meta: NotificationListResponse['meta'] | null;
  isLoading: boolean;
  unreadCount: number;
  loadMore: () => void;
  markAllRead: () => Promise<void>;
  deleteRead: () => Promise<void>;
  refetch: () => Promise<void>;
  markAsRead: (ids: string[]) => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [meta, setMeta] = useState<NotificationListResponse['meta'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchNotifications = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      const result = await api.getNotifications(currentPage, 20);

      if (reset) {
        setNotifications(result.items);
      } else {
        setNotifications((prev) => [...prev, ...result.items]);
      }
      setMeta(result.meta);
      setPage(currentPage);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  const loadMore = useCallback(() => {
    if (meta && page < meta.totalPages && !isLoading) {
      setPage((prev) => prev + 1);
    }
  }, [meta, page, isLoading]);

  const markAllRead = useCallback(async () => {
    try {
      await api.markNotificationsRead();
      setNotifications([]);
      if (meta) {
        setMeta({ ...meta, unreadCount: 0, total: 0 });
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, [meta]);

  const deleteRead = useCallback(async () => {
    try {
      await api.deleteReadNotifications();
      setNotifications([]);
      if (meta) {
        setMeta({ ...meta, unreadCount: 0, total: 0 });
      }
    } catch (error) {
      console.error('Failed to delete read notifications:', error);
    }
  }, [meta]);

  const markAsRead = useCallback(async (ids: string[]) => {
    try {
      await api.markNotificationsRead(ids);
      setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
      if (meta) {
        setMeta({
          ...meta,
          unreadCount: Math.max(0, meta.unreadCount - ids.length),
          total: Math.max(0, meta.total - ids.length),
        });
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, [meta]);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setPage(1);
    await fetchNotifications(true);
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications(true);
  }, []);

  useEffect(() => {
    if (page > 1) {
      fetchNotifications(false);
    }
  }, [page]);

  return {
    notifications,
    meta,
    isLoading,
    unreadCount: meta?.unreadCount ?? 0,
    loadMore,
    markAllRead,
    deleteRead,
    refetch,
    markAsRead,
  };
}
