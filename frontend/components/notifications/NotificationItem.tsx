'use client';

import { useState } from 'react';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Heart,
  UserPlus,
  UserMinus,
  AlertCircle,
  Star,
  Frown,
  Info,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Notification } from '@/lib/api';
import { NotificationType } from './notification-types';

const typeIcons: Record<string, React.ReactNode> = {
  [NotificationType.MATCH_RESULT_WIN]: <Trophy className="w-5 h-5 text-yellow-500" />,
  [NotificationType.MATCH_RESULT_LOSS]: <Frown className="w-5 h-5 text-red-500" />,
  [NotificationType.MATCH_RESULT_DRAW]: <Info className="w-5 h-5 text-gray-500" />,
  [NotificationType.PLAYER_SKILL_IMPROVED]: <TrendingUp className="w-5 h-5 text-green-500" />,
  [NotificationType.PLAYER_SKILL_DECREASED]: <TrendingDown className="w-5 h-5 text-red-500" />,
  [NotificationType.PLAYER_INJURED]: <AlertTriangle className="w-5 h-5 text-orange-500" />,
  [NotificationType.PLAYER_RECOVERED]: <Heart className="w-5 h-5 text-pink-500" />,
  [NotificationType.PLAYER_PURCHASED]: <UserPlus className="w-5 h-5 text-blue-500" />,
  [NotificationType.PLAYER_SOLD]: <UserMinus className="w-5 h-5 text-purple-500" />,
  [NotificationType.AUCTION_OUTBID]: <AlertCircle className="w-5 h-5 text-orange-500" />,
  [NotificationType.AUCTION_WON]: <Star className="w-5 h-5 text-yellow-500" />,
  [NotificationType.AUCTION_LOST]: <Frown className="w-5 h-5 text-gray-500" />,
};

const typeColors: Record<string, string> = {
  [NotificationType.MATCH_RESULT_WIN]: 'border-l-yellow-500',
  [NotificationType.MATCH_RESULT_LOSS]: 'border-l-red-500',
  [NotificationType.MATCH_RESULT_DRAW]: 'border-l-gray-500',
  [NotificationType.PLAYER_SKILL_IMPROVED]: 'border-l-green-500',
  [NotificationType.PLAYER_SKILL_DECREASED]: 'border-l-red-500',
  [NotificationType.PLAYER_INJURED]: 'border-l-orange-500',
  [NotificationType.PLAYER_RECOVERED]: 'border-l-pink-500',
  [NotificationType.PLAYER_PURCHASED]: 'border-l-blue-500',
  [NotificationType.PLAYER_SOLD]: 'border-l-purple-500',
  [NotificationType.AUCTION_OUTBID]: 'border-l-orange-500',
  [NotificationType.AUCTION_WON]: 'border-l-yellow-500',
  [NotificationType.AUCTION_LOST]: 'border-l-gray-500',
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function formatMessage(notification: Notification): string {
  const { type, data } = notification;

  switch (type) {
    case NotificationType.MATCH_RESULT_WIN:
      return `Victory! ${data.homeTeamName} ${data.homeScore} - ${data.awayScore} ${data.awayTeamName}`;
    case NotificationType.MATCH_RESULT_LOSS:
      return `Defeat. ${data.homeTeamName} ${data.homeScore} - ${data.awayScore} ${data.awayTeamName}`;
    case NotificationType.MATCH_RESULT_DRAW:
      return `Draw. ${data.homeTeamName} ${data.homeScore} - ${data.awayScore} ${data.awayTeamName}`;
    case NotificationType.PLAYER_SKILL_IMPROVED:
      return `${data.playerName}'s ${data.skillType} improved to ${data.newValue}`;
    case NotificationType.PLAYER_SKILL_DECREASED:
      return `${data.playerName}'s ${data.skillType} dropped to ${data.newValue}`;
    case NotificationType.PLAYER_INJURED:
      return `${data.playerName} is injured`;
    case NotificationType.PLAYER_RECOVERED:
      return `${data.playerName} has recovered from injury`;
    case NotificationType.PLAYER_PURCHASED:
      return `Purchased ${data.playerName} for ${data.amount?.toLocaleString()}`;
    case NotificationType.PLAYER_SOLD:
      return `Sold ${data.playerName} for ${data.amount?.toLocaleString()}`;
    case NotificationType.AUCTION_OUTBID:
      return `You've been outbid on ${data.playerName}`;
    case NotificationType.AUCTION_WON:
      return `You won the auction for ${data.playerName}!`;
    case NotificationType.AUCTION_LOST:
      return `You lost the auction for ${data.playerName}`;
    default:
      return notification.messageKey;
  }
}

export function NotificationItem({
  notification,
  onMarkAsRead,
}: {
  notification: Notification;
  onMarkAsRead: (ids: string[]) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleClick = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onMarkAsRead([notification.id]);
    } finally {
      setIsDeleting(false);
    }
  };

  const icon = typeIcons[notification.type] || <Info className="w-5 h-5" />;
  const borderColor = typeColors[notification.type] || 'border-l-gray-500';

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'p-3 rounded-lg border-l-4 cursor-pointer transition-all',
        'border border-l-4 bg-card hover:bg-accent/50',
        borderColor,
        isDeleting && 'opacity-50 pointer-events-none'
      )}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed">{formatMessage(notification)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatRelativeTime(notification.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
