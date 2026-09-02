const enabled = (value: string | undefined, fallback = true) =>
  value == null ? fallback : value.toLowerCase() === "true";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { migratePrivilegedAccounts } = await import("./app/lib/auth-db.ts");
  await migratePrivilegedAccounts();

  if (enabled(process.env.DIZYFLOW_ARCHIVE_ENABLED)) {
    const { startArchiveCollectors } = await import(
      "./app/lib/order-flow/depth-collector.ts"
    );
    startArchiveCollectors();
  }

  if (enabled(process.env.DIZYQUANT_CAMPAIGN_RECORDER_ENABLED)) {
    const { startDizyQuantCampaignRecorderService } = await import(
      "./app/lib/dizyquant/campaign-recorder-service.ts"
    );
    startDizyQuantCampaignRecorderService();
  }
}
