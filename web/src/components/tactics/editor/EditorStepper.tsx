'use client';

import React, { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import type { EditorTab } from './use-url-tab';
import { EDITOR_TABS } from './use-url-tab';

/**
 * Mobile shell, split into two components on purpose.
 *
 * The step bar belongs above the scrolling content and the action bar below
 * it, but the editor renders the content in between them. A single component
 * returning both fragments works only while the action bar is `position:
 * fixed`; as soon as it goes back into flow it has to be a sibling *after*
 * the content, or it renders above the pitch.
 */

interface StepNavProps {
  active: EditorTab;
  onChange: (tab: EditorTab) => void;
}

export function EditorStepNav({ active, onChange }: StepNavProps) {
  const t = useTranslations('tactics');
  const index = EDITOR_TABS.indexOf(active);

  return (
    <nav aria-label={t('stepper.label')} className="shrink-0">
      <ol className="flex items-stretch gap-1">
        {EDITOR_TABS.map((tab, i) => {
          const current = i === index;
          const done = i < index;
          return (
            <li key={tab} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(tab)}
                aria-current={current ? 'step' : undefined}
                className={[
                  'flex w-full items-center justify-center gap-2 rounded-lg border px-2 py-2',
                  'font-label text-label uppercase tracking-widest',
                  'transition-colors duration-quick',
                  current
                    ? 'border-primary/40 bg-primary/12 text-primary'
                    : 'border-outline-variant/30 text-on-surface-variant',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className={[
                    'flex h-5 w-5 items-center justify-center rounded-full text-kicker font-black',
                    current
                      ? 'bg-primary text-on-primary'
                      : done
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-container-highest text-outline',
                  ].join(' ')}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className="truncate">{t(`tabs.${tab}`)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface ActionBarProps extends StepNavProps {
  /** Submit handler for the last step's primary button. */
  onSubmit: () => void;
  /** False while the draft is invalid, locked, or already submitting. */
  canSubmit: boolean;
  isSubmitting: boolean;
  /**
   * Why the submit button is dead, in the user's language. A disabled primary
   * button with no explanation is the worst state on a phone: the thumb
   * reaches the bottom, the button does nothing, and the reason lived in a
   * toast that already faded.
   */
  blockedReason?: string | null;
}

export function EditorActionBar({
  active,
  onChange,
  onSubmit,
  canSubmit,
  isSubmitting,
  blockedReason,
}: ActionBarProps) {
  const t = useTranslations('tactics');
  const index = EDITOR_TABS.indexOf(active);
  const isFirst = index === 0;
  const isLast = index === EDITOR_TABS.length - 1;

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.min(EDITOR_TABS.length - 1, Math.max(0, next));
      onChange(EDITOR_TABS[clamped]);
    },
    [onChange],
  );

  return (
    /* In flow at the bottom of the mobile shell, not `position: fixed`. The
       shell owns the viewport height and scrolls only its middle, so the bar
       is pinned without leaving the layout — and a fixed bar cannot see
       `env(safe-area-inset-bottom)`, so its buttons sat under the iPhone home
       indicator. `-mx` and `-mt` cancel the shell's padding and gap so the
       divider runs edge to edge and meets the content. No backdrop blur: the
       content scrolls ABOVE this row, not under it, so there is nothing to
       blur (and `.glass-panel` drops its blur below 1024px for the same
       reason). */
    <div className="-mx-4 -mt-4 shrink-0 border-t border-outline-variant/30 bg-surface-container-high px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
      {blockedReason ? (
        <p className="mb-2 flex items-start gap-1.5 font-label text-kicker tracking-wider text-tertiary">
          <AppIcon name="error" className="mt-px shrink-0 text-[12px]" />
          <span className="min-w-0">{blockedReason}</span>
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={isFirst}
          aria-label={
            isFirst
              ? t('stepper.prev')
              : `${t('stepper.prev')}: ${t(`tabs.${EDITOR_TABS[index - 1]}`)}`
          }
          className="flex h-11 items-center gap-2 rounded-lg border border-outline-variant/40 px-4 font-label text-label uppercase tracking-widest text-on-surface-variant transition-colors duration-quick disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t('stepper.prev')}
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
            aria-label={t('submit')}
            className="flex h-11 items-center gap-2 rounded-lg bg-primary px-5 font-headline text-sm font-bold uppercase tracking-tight text-on-primary transition-colors duration-quick disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="stepper-submit"
          >
            {isSubmitting ? t('submitting') : t('submit')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label={`${t('stepper.next')}: ${t(`tabs.${EDITOR_TABS[index + 1]}`)}`}
            className="flex h-11 items-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-highest px-5 font-label text-label uppercase tracking-widest text-on-surface transition-colors duration-quick"
          >
            {t('stepper.next')}
          </button>
        )}
      </div>
    </div>
  );
}
