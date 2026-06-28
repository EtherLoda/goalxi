"use client";

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
      className={`flex items-center gap-1.5 font-label text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors ${
        hasReacted
          ? "bg-[#a1ffc2]/15 text-[#a1ffc2] border border-[#a1ffc2]/30"
          : "bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:text-[#a1ffc2] hover:border-[#a1ffc2]/30"
      } disabled:opacity-50`}
      aria-label={hasReacted ? "Unlike" : "Like"}
    >
      <span className="material-symbols-outlined text-sm">thumb_up</span>
      <span className="font-bold">{count}</span>
    </button>
  );
}