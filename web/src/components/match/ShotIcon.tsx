import * as React from 'react';

/**
 * Composed shot glyph: one ball, two outcome layers, four scene markers.
 *
 * The engine emits ~6 shot outcomes (goal / miss / save / on-target /
 * penalty / long range) but only TWO of them change what a reader needs
 * to know at a glance: did it go in, and from where. Drawing six balls
 * produced glyphs that were mutually indistinguishable at 24px
 * (`GoalCenter` vs `ShotOnTarget` differed by three 1px lines).
 *
 * So: outcome is the silhouette (white ball + green halo vs grey ball +
 * red slash), scene is a 9.4px disc at the lower right. Markers are all
 * white so they never compete with the green/red outcome layer.
 */

export type ShotOutcome = 'goal' | 'ball' | 'miss';
export type ShotMarker =
  | 'none'
  | 'penalty'
  | 'freekick'
  | 'longshot'
  | 'header'
  | 'rebound'
  | 'oneonone';

export interface ShotIconProps {
  size?: number;
  className?: string;
  outcome: ShotOutcome;
  marker?: ShotMarker;
}

const SLATE = '#0f172a';
const WHITE = '#f8fafc';
const GREY = '#94a3b8';
const PALE = '#cbd5e1';
const GREEN = '#34d399';
const RED = '#ef4444';

const Halo = () => (
  <>
    <circle cx="10.8" cy="10" r="8.5" fill={GREEN} opacity="0.16" />
    <circle cx="10.8" cy="10" r="7.3" fill="none" stroke={GREEN} strokeWidth="1.2" opacity="0.5" />
  </>
);

const Ball = ({ fill, inner }: { fill: string; inner: string }) => (
  <>
    <circle cx="10.8" cy="10" r="6.2" fill={fill} stroke={SLATE} strokeWidth="1.6" />
    <polygon
      points="10.8,7.5 13.1,9.2 12.2,11.9 9.4,11.9 8.5,9.2"
      fill={inner}
      stroke={SLATE}
      strokeWidth="0.7"
      strokeLinejoin="round"
    />
    <path
      d="M10.8 3.9 L10.8 5.6 M10.8 14.4 L10.8 16.1 M5.3 12.6 L7 12 M16.2 8 L14.5 8.6"
      stroke={inner}
      strokeWidth="1"
      strokeLinecap="round"
    />
  </>
);

const Slash = () => (
  <path d="M5.8 15.6 L15.9 4.6" stroke={RED} strokeWidth="2.4" strokeLinecap="round" />
);

const Disc = () => (
  <>
    <circle cx="18.4" cy="18" r="4.7" fill="#0b1512" />
    <circle cx="18.4" cy="18" r="4.7" fill="none" stroke={SLATE} strokeWidth="1.2" />
  </>
);

const Marker = ({ marker }: { marker: ShotMarker }) => {
  if (marker === 'none') return null;
  return (
    <>
      <Disc />
      {marker === 'penalty' && <circle cx="18.4" cy="18" r="2" fill={WHITE} />}
      {marker === 'freekick' && (
        <>
          <path
            d="M15.6 19.7 A3 3 0 0 1 21.2 19.7"
            fill="none"
            stroke={WHITE}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="18.4" cy="16.3" r="1" fill={WHITE} />
        </>
      )}
      {marker === 'header' && (
        <path d="M16.5 19.9 L18.4 15.7 L20.3 19.9 Z" fill={WHITE} />
      )}
      {marker === 'rebound' && (
        <>
          <circle cx="16.9" cy="19.5" r="1.5" fill={WHITE} />
          <circle cx="19.9" cy="16.5" r="1.5" fill={WHITE} />
        </>
      )}
      {marker === 'oneonone' && (
        <>
          <path d="M16.7 14.6 L16.7 21.4" stroke={WHITE} strokeWidth="1.1" strokeDasharray="1.5 1.5" />
          <path d="M18.4 16.3 L21.6 18 L18.4 19.7 Z" fill={WHITE} />
        </>
      )}
      {marker === 'longshot' && (
        <>
          <circle cx="18.4" cy="18" r="1.9" fill="none" stroke={WHITE} strokeWidth="1.2" />
          <path
            d="M18.4 15.4 L18.4 20.6 M15.8 18 L21 18"
            stroke={WHITE}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      )}
    </>
  );
};

export const ShotIcon: React.FC<ShotIconProps> = ({
  size = 24,
  className,
  outcome,
  marker = 'none',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    aria-hidden
  >
    {outcome === 'goal' && <Halo />}
    {outcome === 'miss' ? <Ball fill={PALE} inner={GREY} /> : <Ball fill={WHITE} inner={SLATE} />}
    {outcome === 'miss' && <Slash />}
    <Marker marker={marker} />
  </svg>
);

/** Factory so the resolver can keep returning a component. */
export function shotIcon(
  outcome: ShotOutcome,
  marker: ShotMarker = 'none',
): React.FC<{ size?: number; className?: string }> {
  const C: React.FC<{ size?: number; className?: string }> = (props) => (
    <ShotIcon {...props} outcome={outcome} marker={marker} />
  );
  C.displayName = `ShotIcon(${outcome}/${marker})`;
  return C;
}

/** Read the scene marker out of the event's `data` bag. */
export function shotMarkerFor(typeName: string, data?: Record<string, unknown> | null): ShotMarker {
  const t = typeName.toUpperCase();
  if (t.includes('PENALTY')) return 'penalty';
  const shot = (data as { shot?: { shotType?: string; fromFreeKick?: boolean } } | null)?.shot;
  if (shot?.fromFreeKick) return 'freekick';
  const st = shot?.shotType;
  if (st === 'HEADER' || st === '0') return 'header';
  if (st === 'REBOUND' || st === '3') return 'rebound';
  if (st === 'ONE_ON_ONE' || st === '1') return 'oneonone';
  if (st === 'LONG_SHOT' || st === '4') return 'longshot';
  return 'none';
}
