import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { validateBehaviourFilters } from "../../../lib/dizybrain-behaviour";
import { loadDizyBrainBehaviourProfile } from "../../../lib/dizybrain-behaviour-loader";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){const user=await requireApiUser();if(!user)return NextResponse.json({error:{code:"UNAUTHORISED",message:"Unauthorised"}},{status:401});try{const url=new URL(request.url),query=Object.fromEntries(url.searchParams.entries());const filters=validateBehaviourFilters(query);const {profile,diagnostics}=await loadDizyBrainBehaviourProfile(user.id,filters,new Date().toISOString());return NextResponse.json({profile,readOnly:true,diagnostics},{headers:{"cache-control":"private, no-store"}});}catch(reason){return NextResponse.json({error:{code:"INVALID_QUERY",message:(reason as Error).message}},{status:400});}}
