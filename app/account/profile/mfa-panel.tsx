"use client";
import { FormEvent, useEffect, useState } from "react";

export default function MfaPanel() {
 const [status,setStatus]=useState<{enabled:boolean;pending:boolean;eligible:boolean}|null>(null),[secret,setSecret]=useState(""),[codes,setCodes]=useState<string[]>([]),[message,setMessage]=useState("");
 useEffect(()=>{void fetch("/api/auth/mfa/status").then(r=>r.json()).then(setStatus)},[]);
 async function send(path:string,body:Record<string,FormDataEntryValue|null>){setMessage("");const r=await fetch(`/api/auth/mfa/${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),p=await r.json();if(!r.ok){setMessage(p.error||"Request failed.");return null}return p}
 async function enroll(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),p=await send("enroll",{password:f.get("password")});if(p){setSecret(p.secret);setStatus(s=>s&&({...s,pending:true}))}}
 async function confirm(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),p=await send("confirm",{code:f.get("code")});if(p){setSecret("");setCodes(p.recoveryCodes);setStatus(s=>s&&({...s,pending:false,enabled:true}))}}
 async function sensitive(e:FormEvent<HTMLFormElement>,path:"recovery"|"disable"){e.preventDefault();const f=new FormData(e.currentTarget),p=await send(path,{password:f.get("password"),proof:f.get("proof")});if(p){if(path==="recovery")setCodes(p.recoveryCodes);else setStatus(s=>s&&({...s,enabled:false,pending:false}));setMessage(path==="disable"?"MFA disabled; existing sessions were revoked.":"Recovery codes regenerated; existing sessions were revoked.")}}
 if(!status)return <section><h2>Multi-factor authentication</h2><p>Loading security status…</p></section>;
 if(!status.eligible)return <section><h2>Multi-factor authentication</h2><p>MFA is available to database accounts. Legacy owner/admin sessions remain compatible with the application but do not satisfy guarded-execution MFA.</p></section>;
 return <section><h2>Multi-factor authentication</h2><p>{status.enabled?"Enabled":"Not enabled"}. Authenticator secrets remain encrypted at rest.</p>{message&&<p role="alert">{message}</p>}
 {!status.enabled&&!secret?<form onSubmit={enroll}><label><span>Current password</span><input name="password" type="password" autoComplete="current-password" required/></label><button>Begin MFA enrollment</button></form>:null}
 {secret?<><p>Enter this secret in your authenticator (it is shown only during pending enrollment): <code>{secret}</code></p><form onSubmit={confirm}><label><span>Authenticator code</span><input name="code" inputMode="numeric" autoComplete="one-time-code" required/></label><button>Confirm MFA</button></form></>:null}
 {codes.length?<div role="status"><h3>Save these recovery codes now</h3><p>They will not be shown again.</p><ul>{codes.map(c=><li key={c}><code>{c}</code></li>)}</ul><button type="button" onClick={()=>setCodes([])}>I saved them</button></div>:null}
 {status.enabled?<><form onSubmit={e=>sensitive(e,"recovery")}><h3>Regenerate recovery codes</h3><Reauth/><button>Regenerate and revoke sessions</button></form><form onSubmit={e=>sensitive(e,"disable")}><h3>Disable MFA</h3><Reauth/><button>Disable and revoke sessions</button></form></>:null}</section>;
}
function Reauth(){return <><label><span>Current password</span><input name="password" type="password" autoComplete="current-password" required/></label><label><span>Authenticator or recovery code</span><input name="proof" autoComplete="one-time-code" required/></label></>}
