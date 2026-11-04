// Next.js re-mounts a template on every navigation, so each page gets a short fade-in.
// Reduced-motion users get no animation (see globals.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
