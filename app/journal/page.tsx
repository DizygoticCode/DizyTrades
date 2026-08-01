import { requireUser } from "../lib/auth";
import JournalClient from "./journal-client";
export const dynamic="force-dynamic";
export default async function JournalPage(){const user=await requireUser();return <JournalClient readOnly={user.role==="viewer"} userName={user.name}/>;}
