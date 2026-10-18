import type { ReactNode } from 'react';
import type { ArtifactKind } from '@hc/contracts';

// Line icons drawn in the Paper file (16 px grid, round caps). Stroke follows currentColor so a
// parent can tint them; sizes are passed per use.
type IconProps = { size?: number; stroke?: number; className?: string };

function Svg({ size = 16, className, children, viewBox = '0 0 16 16' }: IconProps & { children: ReactNode; viewBox?: string }) {
  return <svg className={className} width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const IconDoc = ({ size, stroke = 1.6, className }: IconProps) => <Svg size={size} className={className}>
  <path d="M4 1.8h5.5L12.5 5v9.2H4z" strokeWidth={stroke} /><path d="M9.5 1.8V5h3M6 8h4.5M6 10.8h4.5" strokeWidth={stroke} /></Svg>;
export const IconGlobe = ({ size, stroke = 1.6, className }: IconProps) => <Svg size={size} className={className}>
  <circle cx="8" cy="8" r="6.2" strokeWidth={stroke} /><path d="M1.8 8h12.4M8 1.8c2.2 2.4 2.2 9 0 12.4M8 1.8c-2.2 2.4-2.2 9 0 12.4" strokeWidth={stroke} /></Svg>;
export const IconMegaphone = ({ size, stroke = 1.6, className }: IconProps) => <Svg size={size} className={className}>
  <path d="M2 6.5v3h2.5L11 13V3L4.5 6.5z" strokeWidth={stroke} /><path d="M13.2 6a3 3 0 010 4" strokeWidth={stroke} /></Svg>;
export const IconBrief = ({ size, stroke = 1.6, className }: IconProps) => <Svg size={size} className={className}>
  <rect x="2" y="4.5" width="12" height="9" rx="1.4" strokeWidth={stroke} /><path d="M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M2 8.5h12" strokeWidth={stroke} /></Svg>;
export const IconCoin = ({ size = 14, className }: IconProps) => <svg className={className} width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
  <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.75" /><circle cx="7" cy="7" r="2" fill="currentColor" /></svg>;
export const IconPause = ({ size, stroke = 1.75, className }: IconProps) => <Svg size={size} className={className}><path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth={stroke} /></Svg>;
export const IconPlay = ({ size, className }: IconProps) => <Svg size={size} className={className}><path d="M5 3.2v9.6L12.8 8z" fill="currentColor" strokeWidth="1.2" /></Svg>;
export const IconOrg = ({ size, stroke = 1.75, className }: IconProps) => <Svg size={size} className={className}>
  <rect x="5.5" y="1.5" width="5" height="3.5" rx=".8" strokeWidth={stroke} /><rect x="1.5" y="11" width="5" height="3.5" rx=".8" strokeWidth={stroke} />
  <rect x="9.5" y="11" width="5" height="3.5" rx=".8" strokeWidth={stroke} /><path d="M8 5v3M4 11V8h8v3" strokeWidth={stroke} /></Svg>;
export const IconSound = ({ size, stroke = 1.75, className }: IconProps) => <Svg size={size} className={className}>
  <path d="M2 6v4h3l4 3V3L5 6H2z" strokeWidth={stroke} /><path d="M11.5 5.5a3.5 3.5 0 010 5" strokeWidth={stroke} /></Svg>;
export const IconMute = ({ size, stroke = 1.75, className }: IconProps) => <Svg size={size} className={className}>
  <path d="M2 6v4h3l4 3V3L5 6H2z" strokeWidth={stroke} /><path d="M11.5 6l3 4M14.5 6l-3 4" strokeWidth={stroke} /></Svg>;
export const IconClose = ({ size = 14, stroke = 1.75, className }: IconProps) => <Svg size={size} className={className}><path d="M4 4l8 8M12 4l-8 8" strokeWidth={stroke} /></Svg>;
export const IconCheck = ({ size, stroke = 2, className }: IconProps) => <Svg size={size} className={className}><path d="M3 8.5l3.2 3.2L13 4.8" strokeWidth={stroke} /></Svg>;
export const IconHourglass = ({ size, stroke = 2, className }: IconProps) => <Svg size={size} className={className}>
  <path d="M4 2h8M4 14h8M4.8 2c0 3.2 2.5 3.6 3.2 6-.7 2.4-3.2 2.8-3.2 6M11.2 2c0 3.2-2.5 3.6-3.2 6 .7 2.4 3.2 2.8 3.2 6" strokeWidth={stroke} /></Svg>;
export const IconBang = ({ size, stroke = 2.2, className }: IconProps) => <Svg size={size} className={className}><path d="M8 3v6M8 12.4v.2" strokeWidth={stroke} /></Svg>;
export const IconReplay = ({ size = 14, stroke = 1.6, className }: IconProps) => <Svg size={size} className={className}>
  <path d="M2.5 8a5.5 5.5 0 105.5-5.5H5" strokeWidth={stroke} /><path d="M7 .5L4.8 2.5 7 4.5" strokeWidth={stroke} /></Svg>;
export const IconChevron = ({ size = 14, stroke = 1.6, className }: IconProps) => <Svg size={size} className={className}><path d="M4 6l4 4 4-4" strokeWidth={stroke} /></Svg>;
export const IconAfter = ({ size = 14, stroke = 1.6, className }: IconProps) => <Svg size={size} className={className}><path d="M3 2v6.5a2 2 0 002 2h7M9.5 7.5l3 3-3 3" strokeWidth={stroke} /></Svg>;
export const IconWarn = ({ size = 18, stroke = 1.8, className }: IconProps) => <Svg size={size} className={className}>
  <circle cx="8" cy="8" r="6.4" strokeWidth={stroke} /><path d="M8 4.6v4.2M8 11v.2" strokeWidth={stroke} /></Svg>;
export const IconInfo = ({ size = 18, stroke = 1.8, className }: IconProps) => <Svg size={size} className={className}>
  <circle cx="8" cy="8" r="6.4" strokeWidth={stroke} /><path d="M8 7.2V11.4M8 4.8v.2" strokeWidth={stroke} /></Svg>;
export const IconExternal = ({ size = 14, stroke = 1.8, className }: IconProps) => <Svg size={size} className={className}>
  <path d="M6.5 3.5H3.5v9h9v-3M9 2.5h4.5V7M13.5 2.5L7.5 8.5" strokeWidth={stroke} /></Svg>;
export const IconList = ({ size, stroke = 1.6, className }: IconProps) => <Svg size={size} className={className}>
  <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.2M2.5 8h.2M2.5 12h.2" strokeWidth={stroke} /></Svg>;
export const IconSend = ({ size, stroke = 1.6, className }: IconProps) => <Svg size={size} className={className}><path d="M2 8h10M8.5 4.5L12 8l-3.5 3.5" strokeWidth={stroke} /></Svg>;

export const ARTIFACT_ICON: Record<ArtifactKind, (props: IconProps) => JSX.Element> = {
  research: IconDoc, site: IconGlobe, launch_kit: IconMegaphone, brief: IconBrief,
};
