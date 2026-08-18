import type { Metadata } from "next";
import PublicRoute from "../marketing/public-route";

const CONTACT_EMAIL = "dizytrades+admin@gmail.com";
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("DizyTrades contact")}`;

export const metadata: Metadata = {
  title: "Contact | DizyTrades",
  description: "Contact DizyTrades by email for account, product or project enquiries.",
};

export default function ContactPage() {
  return (
    <PublicRoute
      eyebrow="CONTACT DIZYTRADES"
      title="Need to get in touch?"
      copy="Email DizyTrades directly for account, product, project or general enquiries. Your email app will open with the DizyTrades admin address pre-filled."
    >
      <div className="route-actions">
        <a className="button primary" href={MAILTO}>Email DizyTrades</a>
        <a className="text-action" href={MAILTO}>{CONTACT_EMAIL}</a>
      </div>
      <div className="safety-callout">
        <i /> <b>Keep secrets out of email.</b> Never send passwords, API keys, private keys, seed phrases, recovery codes or authenticator secrets.
      </div>
    </PublicRoute>
  );
}
