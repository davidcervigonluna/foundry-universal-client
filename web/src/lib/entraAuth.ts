// Dynamic MSAL per identity profile (runtime). No build-time config.
import { PublicClientApplication, type Configuration, type AccountInfo } from "@azure/msal-browser";
import { type EntraProfile, getActiveEntraProfile } from "./entraProfiles";
import { log, tokenInfo } from "./logger";
const instances=new Map<string,PublicClientApplication>();
async function instanceFor(p:EntraProfile):Promise<PublicClientApplication>{
  const key=`${p.clientId}|${p.tenantId}`;let pca=instances.get(key);
  if(!pca){
    log.info("auth", `creating MSAL instance tenant=${p.tenantId} client=${p.clientId} redirectUri=${window.location.origin}`);
    const config:Configuration={auth:{clientId:p.clientId,authority:`https://login.microsoftonline.com/${p.tenantId}`,redirectUri:window.location.origin},cache:{cacheLocation:"sessionStorage",storeAuthStateInCookie:false}};
    pca=new PublicClientApplication(config);await pca.initialize();instances.set(key,pca);
    log.trace("auth", `MSAL initialized for ${key}`);
  } else { log.trace("auth", `reusing MSAL instance ${key}`); }
  return pca;
}
export function redirectUri():string{return window.location.origin;}
export async function loginWithProfile(p:EntraProfile):Promise<AccountInfo>{
  log.info("auth", `loginPopup scope=${p.scope} tenant=${p.tenantId}`);
  const pca=await instanceFor(p);
  try {
    const res=await pca.loginPopup({scopes:[p.scope]});
    pca.setActiveAccount(res.account);
    log.info("auth", `login OK user=${res.account?.username}`);
    log.trace("auth", `access token ${tokenInfo(res.accessToken)}`);
    return res.account;
  } catch (err) { log.warn("auth", `login FAILED: ${(err as Error).message}`); throw err; }
}
export async function logoutActive():Promise<void>{
  const p=getActiveEntraProfile();if(!p)return;
  log.info("auth", `logout tenant=${p.tenantId}`);
  const pca=await instanceFor(p);const acc=pca.getActiveAccount()??pca.getAllAccounts()[0];
  try{await pca.logoutPopup(acc?{account:acc}:undefined);}catch(err){log.warn("auth", `logout error: ${(err as Error).message}`);}
}
export async function getFoundryUserToken():Promise<string|undefined>{
  const p=getActiveEntraProfile();if(!p)return undefined;
  const pca=await instanceFor(p);const account=pca.getActiveAccount()??pca.getAllAccounts()[0];
  if(!account){log.warn("auth", `no active account for token acquisition`);return undefined;}
  try{
    const r=await pca.acquireTokenSilent({scopes:[p.scope],account});
    log.trace("auth", `acquireTokenSilent OK ${tokenInfo(r.accessToken)}`);
    return r.accessToken;
  }catch(err){
    log.info("auth", `silent token failed (${(err as Error).name}) → interactive popup`);
    try { const r=await pca.acquireTokenPopup({scopes:[p.scope]}); log.trace("auth", `acquireTokenPopup OK ${tokenInfo(r.accessToken)}`); return r.accessToken; }
    catch(e2){ log.warn("auth", `interactive token FAILED: ${(e2 as Error).message}`); throw e2; }
  }
}
