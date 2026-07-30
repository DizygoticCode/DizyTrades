import Link from "next/link";
import SiteHeader, { Brand, GitHubIcon } from "./site-header";

type Props = { eyebrow: string; title: string; copy: string; children?: React.ReactNode };
export default function PublicRoute({ eyebrow, title, copy, children }: Props) {
  return <div className="marketing-shell"><SiteHeader/><main className="public-route"><section><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{copy}</p>{children}<div className="route-actions"><Link className="button primary" href="/explore">Open View-Only Terminal</Link><Link className="button secondary" href="/">Everything Dizy™</Link></div></section><div className="route-orbit" aria-hidden="true"><div className="brand-mark"><span/><span/><span/></div><i/><i/><i/></div></main><footer className="mini-footer"><Brand/><a href="https://github.com/DizygoticCode/DizyTrades" target="_blank" rel="noopener noreferrer"><GitHubIcon/> Developers</a></footer></div>;
}
