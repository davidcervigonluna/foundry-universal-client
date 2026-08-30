import { useState, useCallback } from "react";
import type { ChatImagePart } from "../lib/streamClient";
export function GeneratedImage({ image }: { image: ChatImagePart }) {
  const [open,setOpen]=useState(false);const src=`data:${image.mimeType};base64,${image.b64}`;
  const download=useCallback(()=>{const a=document.createElement("a");a.href=src;const ext=(image.mimeType.split("/")[1]||"png").replace("+xml","");a.download=`generated-image-${Date.now()}.${ext}`;document.body.appendChild(a);a.click();a.remove();},[src,image.mimeType]);
  return(<figure className="gen-image"><img src={src} alt={image.alt} loading="lazy" onClick={()=>setOpen(true)} /><figcaption><span title={image.alt}>{image.alt}</span><button type="button" onClick={download}>⬇ Download</button></figcaption>{open&&<div className="lightbox" onClick={()=>setOpen(false)}><img src={src} alt={image.alt} /></div>}</figure>);
}
