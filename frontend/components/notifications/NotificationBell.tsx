'use client';

import { Bell, X, CheckCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNotifications } from './useNotifications';
import { NotificationItem } from './NotificationItem';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    meta,
    isLoading,
    unreadCount,
    loadMore,
    markAllRead,
    deleteRead,
    markAsRead,
    refetch,
  } = useNotifications();

  const handleOpen = () => {
    setIsOpen(true);
    refetch();
  };

  const handleMarkAsRead = async (ids: string[]) => {
    await markAsRead(ids);
  };

  const currentPage = meta?.page ?? 1;

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 hover:bg-accent rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[80vh] bg-background border rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-lg">Notifications</h2>
              <div className="flex gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={deleteRead}
                    className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground"
                    title="Clear all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <div className="animate-pulse">Loading...</div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                <div className="p-2">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={handleMarkAsRead}
                    />
                  ))}

                  {meta && currentPage < meta.totalPages && (
                    <button
                      onClick={loadMore}
                      className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Load more
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
