type MutableEnvironment = Record<string, string | undefined>;

const capInteger = (env: MutableEnvironment, key: string, cap: number) => {
  const parsed = Number(env[key]);
  const value = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), cap) : cap;
  env[key] = String(value);
};

export function isConstrainedRender(env: MutableEnvironment = process.env) {
  return env.RENDER === "true" && env.DIZYFLOW_RENDER_LOW_MEMORY_PROFILE !== "false";
}

/**
 * Render Starter is a 512 MB bridge deployment. Apply this before importing
 * DizyFlow/DizyQuant modules so stale dashboard variables cannot silently
 * override the repository's low-memory contract. Self-hosted deployments do
 * not expose RENDER=true and therefore retain their normal/full profile.
 */
export function applyConstrainedRenderMemoryProfile(
  env: MutableEnvironment = process.env,
) {
  if (!isConstrainedRender(env)) return false;

  env.DIZYFLOW_LOW_MEMORY_MODE = "true";
  env.DIZYFLOW_ARCHIVE_ENABLED = "false";
  env.DIZYQUANT_CAMPAIGN_RECORDER_ENABLED = "false";
  // No archive service means no tape should remain pinned merely because it is
  // named in a stale Render dashboard value.
  env.DIZYFLOW_ARCHIVE_SYMBOLS = "";

  capInteger(env, "DIZYFLOW_MAX_HISTORY_SAMPLES", 60);
  capInteger(env, "DIZYFLOW_MAX_LEVELS_PER_SIDE", 100);
  capInteger(env, "DIZYFLOW_MAX_COLLECTORS", 2);
  capInteger(env, "DIZYFLOW_MAX_HEATMAP_RECORDS", 5_000);
  capInteger(env, "DIZYFLOW_HEATMAP_MAX_MEMORY_RECORDS", 5_000);
  capInteger(env, "DIZYFLOW_HEATMAP_MAX_PENDING", 2_000);
  capInteger(env, "DIZYFLOW_MAX_TAPES", 2);
  capInteger(env, "DIZYFLOW_TILE_CACHE_MB", 4);
  capInteger(env, "DIZYFLOW_MEMORY_WARN_MB", 260);
  capInteger(env, "DIZYFLOW_MEMORY_SHED_MB", 300);
  capInteger(env, "DIZYFLOW_MEMORY_HARD_MB", 340);

  return true;
}
