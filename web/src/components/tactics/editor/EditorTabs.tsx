'use client';

import React, { useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import type { EditorTab } from './use-url-tab';
import { DURATION, EASE } from '@/lib/motion';

interface EditorTabsProps {
  active: EditorTab;
  onChange: (tab: EditorTab) => void;
}

/**
 * Desktop tab bar. Two tabs, not three: the substitution plan is a rarely
 * touched section and lives inside the tactical tab rather than on a tab of
 * its own. `changes` is still a valid URL value so a mobile link survives,
 * but on desktop it highlights the tactical tab.
 */
const DESKTOP_TABS = ['lineup', 'tactics'] as const;
type DesktopTab = (typeof DESKTOP_TABS)[number];

function toDesktopTab(tab: EditorTab): DesktopTab {
  return tab === 'lineup' ? 'lineup' : 'tactics';
}

export function EditorTabs({ active, onChange }: EditorTabsProps) {
  const t = useTranslations('tactics');
  const activeDesktop = toDesktopTab(active);
  const listRef = useRef<HTMLDivElement>(null);

  // Roving tabindex: only the selected tab is in the tab order, and the
  // arrow keys move both focus and selection. This is the ARIA tabs
  // pattern; without it a keyboard user has to tab through every tab
  // before reaching the panel.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = DESKTOP_TABS.indexOf(activeDesktop);
      let next = -1;
      if (event.key === 'ArrowRight') next = (current + 1) % DESKTOP_TABS.length;
      else if (event.key === 'ArrowLeft') next = (current + DESKTOP_TABS.length - 1) % DESKTOP_TABS.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = DESKTOP_TABS.length - 1;
      if (next < 0) return;
      event.preventDefault();
      onChange(DESKTOP_TABS[next]);
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[next]?.focus();
    },
    [activeDesktop, onChange],
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t('tabs.label')}
      onKeyDown={onKeyDown}
      className="glass-panel rounded-2xl p-1 flex items-center gap-1"
    >
      {DESKTOP_TABS.map((tab) => {
        const selected = tab === activeDesktop;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`editor-tab-${tab}`}
            aria-selected={selected}
            aria-controls="editor-tabpanel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            className={[
              'relative flex-1 px-4 py-2 rounded-xl font-label text-xs tracking-widest uppercase',
              'transition-colors duration-quick',
              selected
                ? 'text-primary'
                : 'text-on-surface-variant border border-transparent hover:text-on-surface hover:bg-surface-container-high/60',
            ].join(' ')}
          >
            {/* The selected tab is a shared-layout element, so the highlight
                slides between the two buttons instead of fading out of one
                and into the other. `layoutId` is what makes it continuous —
                two independent highlights read as two separate states. */}
            {selected && (
              <motion.span
                layoutId="editor-tab-indicator"
                className="absolute inset-0 rounded-xl border border-primary/30 bg-primary/15"
                transition={{ duration: DURATION.base, ease: EASE.standard }}
              />
            )}
            <span className="relative z-10">{t(`tabs.${tab}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
