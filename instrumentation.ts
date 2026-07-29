export async function register(){
 if(process.env.NEXT_RUNTIME==="nodejs"){
  const {startArchiveCollectors}=await import("./app/lib/order-flow/depth-collector.ts");
  startArchiveCollectors();
 }
}
