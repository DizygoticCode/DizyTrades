const enabled = (value: string | undefined, fallback = true) =>
  value == null ? fallback : value.toLowerCase() === "true";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Apply the 512 MB Render bridge budget before any DizyFlow/DizyQuant module
  // is evaluated. This makes the deployed contract independent of whether an
  // existing Render service has synchronised every value from render.yaml.
  const { applyConstrainedRenderMemoryProfile } = await import(
    "./app/lib/render-memory-profile.ts"
  );
  applyConstrainedRenderMemoryProfile();

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
