import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
const AUTH_ENABLED=String(process.env.AUTH_ENABLED).toLowerCase()==="true";
const TENANT_ID=process.env.ENTRA_TENANT_ID||"";const API_AUDIENCE=process.env.ENTRA_API_AUDIENCE||"";
const ALLOWED_TENANTS=(process.env.ALLOWED_TENANTS||"").split(",").map(s=>s.trim()).filter(Boolean);
const ALLOWED_USERS=(process.env.ALLOWED_USERS||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
const jwks=TENANT_ID?new JwksClient({jwksUri:`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,cache:true,cacheMaxEntries:5,cacheMaxAge:600000,rateLimit:true}):null;
function getSigningKey(h,cb){jwks.getSigningKey(h.kid,(e,k)=>e?cb(e):cb(null,k.getPublicKey()));}
function verify(token){return new Promise((resolve,reject)=>{const iss=(ALLOWED_TENANTS.length?ALLOWED_TENANTS:[TENANT_ID]).map(t=>`https://login.microsoftonline.com/${t}/v2.0`);jwt.verify(token,getSigningKey,{algorithms:["RS256"],audience:API_AUDIENCE||undefined,issuer:iss},(e,d)=>e?reject(e):resolve(d));});}
export function requireAuth(){if(!AUTH_ENABLED)return(_q,_s,next)=>next();return async(req,res,next)=>{const[scheme,token]=(req.header("Authorization")||"").split(" ");if(scheme!=="Bearer"||!token)return res.status(401).json({error:"Missing user Bearer token."});try{const c=await verify(token);if(ALLOWED_USERS.length){const who=(c.preferred_username||c.upn||c.email||"").toLowerCase();if(!ALLOWED_USERS.includes(who))return res.status(403).json({error:"User not authorized."});}req.user={name:c.name,email:c.preferred_username||c.email};next();}catch(err){return res.status(401).json({error:`Invalid token: ${err.message}`});}};}
export const isAuthEnabled=AUTH_ENABLED;
