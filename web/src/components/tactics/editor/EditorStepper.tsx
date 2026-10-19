'use client';

import React, { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { EditorTab } from './use-url-tab';
import { EDITOR_TABS } from './use-url-tab';

interface EditorStepperProps {
  active: EditorTab;
  onChange: (tab: EditorTab) => void;
  /** Submit handler for the last step's primary button. */
  onSubmit: () => void;
  /** False while the draft is invalid, locked, or already submitting. */
  canSubmit: boolean;
  isSubmitting: boolean;
}

/**
 * Mobile shell: a step bar across the top and a fixed action bar at the
 * bottom. Three steps instead of two tabs because on a phone the pitch, the
 * tactical controls and the substitution plan cannot be shown together, so
 * each gets its own scroll region.
 */
export function EditorStepper({
  active,
  onChange,
  onSubmit,
  canSubmit,
  isSubmitting,
}: EditorStepperProps) {
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
    <>
      <nav aria-label={t('stepper.label')}>
        <ol className="glass-panel rounded-2xl px-2 py-2 flex items-stretch gap-1">
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
                    'w-full flex items-center justify-center gap-2 px-2 py-2 rounded-xl',
                    'font-label text-[11px] tracking-widest uppercase',
                    'transition-colors duration-quick',
                    current
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'text-on-surface-variant border border-transparent',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black',
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

      {/* Fixed action bar. Sits above the page padding added by the editor
          shell so the last card never hides behind it. */}
      <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <div className="glass-panel border-t border-outline-variant/30 px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={isFirst}
            aria-label={
              isFirst
                ? t('stepper.prev')
                : `${t('stepper.prev')}: ${t(`tabs.${EDITOR_TABS[index - 1]}`)}`
            }
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-outline-variant/40 text-on-surface-variant font-label text-xs tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-quick"
          >
            {t('stepper.prev')}
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || isSubmitting}
              aria-label={t('submit')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm tracking-tight uppercase disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-quick"
              data-testid="stepper-submit"
            >
              {isSubmitting ? t('submitting') : t('submit')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label={`${t('stepper.next')}: ${t(`tabs.${EDITOR_TABS[index + 1]}`)}`}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-surface-container-highest text-on-surface border border-outline-variant/40 font-label text-xs tracking-widest uppercase transition-colors duration-quick"
            >
              {t('stepper.next')}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
