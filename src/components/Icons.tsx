// Small inline icon set (stroke icons, 24px grid). Decorative by default.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconPlay = (p: P) => <Icon {...p}><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></Icon>;
export const IconPause = (p: P) => <Icon {...p}><path d="M8 5v14M16 5v14" /></Icon>;
export const IconFlag = (p: P) => <Icon {...p}><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></Icon>;
export const IconMic = (p: P) => <Icon {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Icon>;
export const IconSend = (p: P) => <Icon {...p}><path d="M4 12l16-8-6 16-2.5-6.5z" /></Icon>;
export const IconBulb = (p: P) => <Icon {...p}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></Icon>;
export const IconCheck = (p: P) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const IconX = (p: P) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const IconChevronDown = (p: P) => <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>;
export const IconArrowRight = (p: P) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const IconArrowLeft = (p: P) => <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
export const IconClock = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
export const IconShield = (p: P) => <Icon {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /></Icon>;
export const IconWave = (p: P) => <Icon {...p}><path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2" /></Icon>;
export const IconCode = (p: P) => <Icon {...p}><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></Icon>;
export const IconChat = (p: P) => <Icon {...p}><path d="M4 5h16v11H9l-5 4z" /></Icon>;
export const IconDoc = (p: P) => <Icon {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></Icon>;
export const IconSpeaker = (p: P) => <Icon {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></Icon>;
export const IconTrash = (p: P) => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
export const IconSpark = (p: P) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></Icon>;
