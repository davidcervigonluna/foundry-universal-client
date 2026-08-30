const timestamps:number[]=[];const listeners=new Set<(count:number)=>void>();
export function recordCall(){timestamps.push(Date.now());prune();emit();}
function prune(){const c=Date.now()-60000;while(timestamps.length&&timestamps[0]<c)timestamps.shift();}
export function callsLastMinute():number{prune();return timestamps.length;}
export function subscribe(fn:(count:number)=>void):()=>void{listeners.add(fn);return()=>listeners.delete(fn);}
function emit(){const c=timestamps.length;listeners.forEach(l=>l(c));}
setInterval(()=>{prune();emit();},5000);
