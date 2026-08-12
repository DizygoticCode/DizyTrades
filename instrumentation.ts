export async function register(){
 if(process.env.NEXT_RUNTIME==="nodejs"){
  const [{startArchiveCollectors},{startDizyQuantCampaignRecorderService}]=await Promise.all([
   import("./app/lib/order-flow/depth-collector.ts"),
   import("./app/lib/dizyquant/campaign-recorder-service.ts"),
  ]);
  const {migratePrivilegedAccounts}=await import("./app/lib/auth-db.ts");
  await migratePrivilegedAccounts();
  startArchiveCollectors();
  startDizyQuantCampaignRecorderService();
 }
}
