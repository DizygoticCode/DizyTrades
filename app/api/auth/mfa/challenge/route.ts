import { NextResponse } from "next/server";
import { completeMfaChallenge, consumeRateLimit, createDatabaseSession } from "../../../../lib/auth-db";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "../../../../lib/auth";
import { requestIp, validRequestOrigin } from "../../../../lib/request-security";
import { appendAudit } from "../../../../lib/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
 if (!validRequestOrigin(request)) return NextResponse.json({error:"Invalid request."},{status:403});
 let body:{challenge?:unknown;proof?:unknown}; try{body=await request.json()}catch{return NextResponse.json({error:"Invalid MFA verification."},{status:400})}
 const challenge=typeof body.challenge==="string"?body.challenge:"",proof=typeof body.proof==="string"?body.proof:"",ip=requestIp(request);
 if(consumeRateLimit([`mfa:challenge:ip:${ip}`],8,15*60_000)) return NextResponse.json({error:"Too many MFA attempts."},{status:429});
 const completed=completeMfaChallenge(challenge,proof); if(!completed)return NextResponse.json({error:"Invalid or expired MFA verification."},{status:401});
 const token=createDatabaseSession(completed.user,SESSION_MAX_AGE_SECONDS); if(!token)return NextResponse.json({error:"Authentication service unavailable."},{status:503});
 const response=NextResponse.json({user:completed.user}); response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:SESSION_MAX_AGE_SECONDS});
 await appendAudit(completed.user.id,completed.recoveryUsed?"auth.mfa-recovery-used":"auth.mfa-login",{ip}); return response;
}
