// Dynamic MSAL per identity profile (runtime). No build-time config: the MSAL
// instance is created with the tenant/client the user enters in the UI.
import { PublicClientApplication, type Configuration, type AccountInfo } from "@azure/msal-browser";
import { type EntraProfile, getActiveEntraProfile } from "./entraProfiles";
const instances=new Map<string,PublicClientApplication>();
async function instanceFor(p:EntraProfile):Promise<PublicClientApplication>{const key=`${p.clientId}|${p.tenantId}`;let pca=instances.get(key);if(!pca){const config:Configuration={auth:{clientId:p.clientId,authority:`https://login.microsoftonline.com/${p.tenantId}`,redirectUri:window.location.origin},cache:{cacheLocation:"sessionStorage",storeAuthStateInCookie:false}};pca=new PublicClientApplication(config);await pca.initialize();instances.set(key,pca);}return pca;}
export function redirectUri():string{return window.location.origin;}
export async function loginWithProfile(p:EntraProfile):Promise<AccountInfo>{const pca=await instanceFor(p);const res=await pca.loginPopup({scopes:[p.scope]});pca.setActiveAccount(res.account);return res.account;}
export async function logoutActive():Promise<void>{const p=getActiveEntraProfile();if(!p)return;const pca=await instanceFor(p);const acc=pca.getActiveAccount()??pca.getAllAccounts()[0];try{await pca.logoutPopup(acc?{account:acc}:undefined);}catch{}}
export async function getFoundryUserToken():Promise<string|undefined>{const p=getActiveEntraProfile();if(!p)return undefined;const pca=await instanceFor(p);const account=pca.getActiveAccount()??pca.getAllAccounts()[0];if(!account)return undefined;try{return(await pca.acquireTokenSilent({scopes:[p.scope],account})).accessToken;}catch{return(await pca.acquireTokenPopup({scopes:[p.scope]})).accessToken;}}
