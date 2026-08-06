import { SCHOOL_DISPLAY_NAME } from "./branding";

export type DizyProductId =
  | "charts"
  | "academy"
  | "brain"
  | "quant"
  | "account"
  | "scanner"
  | "structure"
  | "performance"
  | "journal"
  | "backup"
  | "ops"
  | "dex";

export type DizyProductLink = Readonly<{
  id: DizyProductId;
  label: string;
  icon: string;
  href: string;
  title: string;
  accent: string;
  routePrefixes: readonly string[];
  terminalCompanion?: boolean;
  terminalClassName?: string;
}>;

export const MEXC_REFERRAL_URL = "https://s.mexc.com/referral/zIGtvsj603";
export const MEXC_REFERRAL_CODE = "12CDEd";

export const DIZY_PRODUCT_LINKS: readonly DizyProductLink[] = [
  {
    id: "charts",
    label: "DizyCharts",
    icon: "⌁",
    href: "/terminal",
    title: "Open the DizyCharts terminal",
    accent: "#57a5ff",
    routePrefixes: ["/terminal", "/explore"],
  },
  {
    id: "academy",
    label: SCHOOL_DISPLAY_NAME,
    icon: "◫",
    href: "/school",
    title: `Open ${SCHOOL_DISPLAY_NAME}`,
    accent: "#f3cb68",
    routePrefixes: ["/school"],
  },
  {
    id: "brain",
    label: "DizyBrain",
    icon: "🧠",
    href: "/terminal#dizybrain",
    title: "Open DizyBrain transparent signal reasoning",
    accent: "#44e9df",
    routePrefixes: [],
  },
  {
    id: "quant",
    label: "DizyQuant",
    icon: "∑",
    href: "/research",
    title: "Open bounded DizyQuant microstructure research",
    accent: "#c8a7ff",
    routePrefixes: ["/research"],
    terminalCompanion: true,
    terminalClassName: "dizyquant-topbar-link",
  },
  {
    id: "account",
    label: "DizyAccount",
    icon: "◉",
    href: "/account",
    title: "Open the owner-only read-only MEXC Account Companion",
    accent: "#86f2cf",
    routePrefixes: ["/account"],
    terminalCompanion: true,
    terminalClassName: "dizyaccount-topbar-link",
  },
  {
    id: "scanner",
    label: "DizyScanner",
    icon: "⌕",
    href: "/scanner",
    title: "Open multi-symbol DizyScanner",
    accent: "#ffb45c",
    routePrefixes: ["/scanner"],
    terminalCompanion: true,
    terminalClassName: "dizyscanner-topbar-link",
  },
  {
    id: "structure",
    label: "DizyStructure",
    icon: "⌁",
    href: "/structure",
    title: "Open advanced closed-candle market structure",
    accent: "#5ed4ff",
    routePrefixes: ["/structure"],
    terminalCompanion: true,
    terminalClassName: "dizystructure-topbar-link",
  },
  {
    id: "performance",
    label: "DizyPerformance",
    icon: "▥",
    href: "/performance",
    title: "Open the realised performance dashboard",
    accent: "#ff7fc8",
    routePrefixes: ["/performance"],
    terminalCompanion: true,
    terminalClassName: "dizyperformance-topbar-link",
  },
  {
    id: "journal",
    label: "DizyJournal",
    icon: "📓",
    href: "/journal",
    title: "Open DizyJournal",
    accent: "#ffd071",
    routePrefixes: ["/journal"],
    terminalCompanion: true,
    terminalClassName: "dizyjournal-topbar-link",
  },
  {
    id: "backup",
    label: "DizyBackup",
    icon: "⤓",
    href: "/backup",
    title: "Export and recover DizyTrades account data",
    accent: "#64e6c5",
    routePrefixes: ["/backup"],
    terminalCompanion: true,
    terminalClassName: "dizybackup-topbar-link",
  },
  {
    id: "ops",
    label: "DizyOps",
    icon: "⚙",
    href: "/diagnostics",
    title: "Open owner-only production diagnostics",
    accent: "#a8b3ca",
    routePrefixes: ["/diagnostics"],
    terminalCompanion: true,
    terminalClassName: "dizyops-topbar-link",
  },
  {
    id: "dex",
    label: "DizyDEX",
    icon: "◇",
    href: "/dex",
    title: "Open public on-chain pool research",
    accent: "#9ee86f",
    routePrefixes: ["/dex"],
    terminalCompanion: true,
    terminalClassName: "dizydex-topbar-link",
  },
] as const;

function routeMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function activeDizyProduct(pathname: string): DizyProductId | null {
  return DIZY_PRODUCT_LINKS.find((product) =>
    product.routePrefixes.some((prefix) => routeMatches(pathname, prefix)),
  )?.id ?? null;
}

export function showSharedProductNavigation(pathname: string) {
  return !["/login", "/signup", "/terminal"].some((prefix) =>
    routeMatches(pathname, prefix),
  );
}

export const TERMINAL_COMPANION_LINKS = DIZY_PRODUCT_LINKS.filter(
  (product) => product.terminalCompanion,
);
