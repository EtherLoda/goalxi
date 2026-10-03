"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { useState } from "react";
import { forumApi } from "@/lib/forum-api";

interface ReactionButtonProps {
  postId: string;
  initialCount: number;
  initialHasReacted?: boolean;
  onChange?: (count: number, hasReacted: boolean) => void;
}

export default function ReactionButton({
  postId,
  initialCount,
  initialHasReacted = false,
  onChange,
}: ReactionButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [hasReacted, setHasReacted] = useState(initialHasReacted);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await forumApi.toggleReaction(postId);
      setCount(res.count);
      setHasReacted(res.hasReacted);
      onChange?.(res.count, res.hasReacted);
    } catch (err) {
      console.error("Failed to toggle reaction", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 font-label text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-lg transition-colors ${
        hasReacted
          ? "bg-accent/15 text-accent border border-accent/30"
          : "bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:text-accent hover:border-accent/30"
      } disabled:opacity-50`}
      aria-label={hasReacted ? "Unlike" : "Like"}
    >
      <AppIcon name="thumb_up" className="text-sm" />
      <span className="font-bold">{count}</span>
    </button>
  );
}