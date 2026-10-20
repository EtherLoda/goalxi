'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import { KickerLabel } from '@/components/ui/KickerLabel';
import { DURATION, EASE } from '@/lib/motion';
import { api, type Player } from '@/lib/api';

interface ListPlayerDialogProps {
  player: Player;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Transfer-listing dialog for one squad player.
 *
 * Behaviour notes:
 *   - `Escape` closes. A dialog with no keyboard exit is a trap for anyone
 *     who tabbed into it by accident.
 *   - The backdrop is a sibling `<button>` rather than a click handler on the
 *     overlay, so the dismissal target is reachable by keyboard too.
 *   - Buyout stays derived (2× the start price): it is a hidden v2 mechanic
 *     and the backend DTO still wants a number.
 */
export function ListPlayerDialog({ player, onClose, onSuccess }: ListPlayerDialogProps) {
  const t = useTranslations();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const [startPrice, setStartPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const start = Number.parseInt(startPrice, 10);
    if (!Number.isFinite(start) || start <= 0) {
      setError(t('squad.transfer.invalidPrice'));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await api.transfers.createAuction(player.id, start, start * 2);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('squad.transfer.listFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DURATION.base, ease: EASE.entrance }}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-container shadow-floating"
      >
        <div className="flex items-start justify-between gap-tight p-panel pb-tight">
          <div className="flex items-center gap-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <AppIcon name="sell" className="text-body" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h2 id={titleId} className="font-headline text-title font-bold text-on-surface">
                {t('squad.transfer.listPlayer')}
              </h2>
              <KickerLabel>{t('squad.transfer.modalSubtitle')}</KickerLabel>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-outline transition-colors duration-quick hover:bg-white/[0.06] hover:text-on-surface"
          >
            <AppIcon name="close" className="text-body" />
          </button>
        </div>

        <div className="mx-panel flex items-center gap-tight rounded-xl border border-outline-variant/30 bg-surface-container-low px-tight py-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high font-headline text-label font-bold text-on-surface-variant">
            {player.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-on-surface">{player.name}</p>
            <p className="font-label text-kicker uppercase tracking-[0.08em] text-outline">
              PWI {player.pwi?.toLocaleString() || 0}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-tight p-panel">
          <label htmlFor="list-start-price" className="flex flex-col gap-micro">
            <KickerLabel>{t('squad.transfer.startPrice')}</KickerLabel>
            <span className="relative flex items-center">
              <span className="pointer-events-none absolute left-3 font-headline text-body text-outline">
                €
              </span>
              <input
                ref={inputRef}
                id="list-start-price"
                type="number"
                min={0}
                step={1}
                value={startPrice}
                onChange={(event) => setStartPrice(event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low py-2 pl-7 pr-3 font-headline text-body tabular-nums text-on-surface placeholder:text-outline focus:border-primary/60 focus:outline-none"
              />
            </span>
          </label>

          {error ? (
            <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-tight py-1.5 text-label text-error">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-micro inline-flex h-10 items-center justify-center gap-micro rounded-lg bg-primary font-label text-label font-bold text-on-primary transition-colors duration-quick hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-surface-container-highest disabled:text-outline"
          >
            {isSubmitting ? (
              <>
                <AppIcon name="progress_activity" className="animate-spin text-body" />
                {t('squad.transfer.listing')}
              </>
            ) : (
              t('squad.transfer.listButton')
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
