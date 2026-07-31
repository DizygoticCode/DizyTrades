import ViewerLauncher from "./viewer-launcher";

export const metadata = {
  title: "View-Only Terminal | DizyTrades",
  description: "Launch the DizyTrades terminal in a temporary read-only viewer session.",
};

export default function ExplorePage() {
  return <ViewerLauncher />;
}
