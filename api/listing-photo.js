// Fetch the primary image for an individual auction or classified listing using Nimble Extract.
// Only permitted, known marketplace listing URLs are allowed. Image extraction is best effort.
const DOMAINS=[
'bringatrailer.com','carsandbids.com','pcarmarket.com','hemmings.com','hagerty.com',
'bonhams.com','rmsothebys.com','goodingco.com','broadarrowauctions.com',
'ebay.com','facebook.com','collectingcars.com'
];
const isKnown=host=>DOMAINS.some(d=>host===d||host.endsWith('.'+d));
function validSource(input){try{
 const u=new URL(input);
 if(u.protocol!=='https:'||u.username||u.password||!isKnown(u.hostname.toLowerCase())||u.port)return null;
 if(u.href.length>1200||/\/stories\//i.test(u.pathname))return null;
 return u;
}catch(e){return null}}
function imageURL(value,base){try{
 const url=new URL(value,base);
 if(url.protocol!=='https:'||url.username||url.password)return null;
 if(/\.(?:svg)(?:$|\?)/i.test(url.pathname))return null;
 return url.href;
}catch(e){return null}}
function pick(html,url){
 const tags=(html.match(/<meta\b[^>]*>/gi)||[]);
 for(const kind of ['og:image','twitter:image']){
  for(const tag of tags){
   const attributes={};for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/g))attributes[match[1].toLowerCase()]=match[3];
   if((attributes.property||attributes.name||'').toLowerCase()===kind){
    const result=imageURL((attributes.content||'').replace(/&amp;/g,'&'),url);
    if(result)return result;
   }
  }
 }
 // Listing primary image as exposed in JSON-LD.
 for(const m of html.matchAll(/<script[^>]+type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi)){
  try{
   const items=JSON.parse(m[1]),queue=Array.isArray(items)?items:[items];
   while(queue.length){const item=queue.shift();if(!item||typeof item!=='object')continue;
    const value=item.image;const raw=typeof value==='string'?value:Array.isArray(value)?value[0]:value?.url||value?.contentUrl;
    if(typeof raw==='string'){const result=imageURL(raw,url);if(result)return result}
    if(Array.isArray(item['@graph']))queue.push(...item['@graph']);
   }
  }catch(e){}
 }
 return null;
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({message:'GET only'});
 const url=validSource(req.query.url);
 if(!url)return res.status(400).json({image:null,message:'Invalid auction listing URL.'});
 if(!process.env.NIMBLE_API_KEY)return res.status(503).json({image:null,message:'Nimble is not configured.'});
 res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),11000);
 try{
  const response=await fetch('https://sdk.nimbleway.com/v2/extract',{
   method:'POST',
   headers:{Authorization:'Bearer '+process.env.NIMBLE_API_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({url:url.href,formats:['html'],render:false}),
   signal:controller.signal
  });
  if(!response.ok)return res.status(200).json({image:null});
  const data=await response.json();
  const html=data?.data?.html;
  if(typeof html!=='string')return res.status(200).json({image:null});
  return res.status(200).json({image:pick(html,url.href)});
 }catch(e){return res.status(200).json({image:null})}finally{clearTimeout(timeout)}
}
