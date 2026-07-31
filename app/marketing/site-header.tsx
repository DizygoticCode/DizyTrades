"use client";

import Link from "next/link";
import { useState } from "react";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";

export function Brand() {
  return <Link className="site-brand" href="/" aria-label="DizyTrades home"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span><b>DizyTrades</b><small>Everything Dizy™</small></span></Link>;
}

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  return <header className="site-header"><Brand /><button className="nav-toggle" type="button" aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpen(!open)}><span className="sr-only">Toggle navigation</span><i /><i /><i /></button><nav id="site-navigation" className={open ? "site-nav open" : "site-nav"} aria-label="Main navigation">
    <Link href="/explore" onClick={() => setOpen(false)}>View-Only Terminal</Link><Link href="/school" onClick={() => setOpen(false)}>{SCHOOL_DISPLAY_NAME}</Link><Link href="/dex" onClick={() => setOpen(false)}>DizyDEX</Link><a href="https://github.com/DizygoticCode/DizyTrades" target="_blank" rel="noopener noreferrer"><GitHubIcon /> Developers</a><Link className="nav-signin" href="/login" onClick={() => setOpen(false)}>Sign In</Link><Link className="nav-primary" href="/signup" onClick={() => setOpen(false)}>Create Account</Link>
  </nav></header>;
}

export function GitHubIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.42c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.3-5.27-1.29-5.27-5.7 0-1.27.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.16 1.19a10.9 10.9 0 0 1 5.76 0c2.19-1.5 3.15-1.19 3.15-1.19.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.43-2.71 5.4-5.29 5.69.42.36.79 1.06.79 2.14v3.18c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" /></svg>;
}
