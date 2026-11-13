// Motorfolio - public Facebook Marketplace results via Nimble Extract.
// Never uses account cookies or attempts to bypass login. Only link-backed listings are returned.
import {zipLocation,withinRadius} from '../lib/zip-radius.js';
const MARKET='https://www.facebook.com';
const clean=x=>String(x||'').trim().slice(0,100);
const htmlText=x=>String(x||'').replace(/<[^>]+>/g,' ').replace(/&(?:amp|quot|#39|lt|gt);/g,' ').replace(/\\u0026/g,'&').replace(/\s+/g,' ').trim();
const decode=x=>String(x||'').replace(/\\\//g,'/').replace(/\\u002F/gi,'/').replace(/\\u0026/gi,'&').replace(/&amp;/g,'&');
function extractedContent(json){
 const data=json?.data??json;
 return {html:[data?.html,data?.content?.html,data?.result?.html,typeof data?.content==='string'?data.content:null].find(v=>typeof v==='string')||'',
 markdown:[data?.markdown,data?.content?.markdown].find(v=>typeof v==='string')||''};
}
function validImage(value){try{
 const u=new URL(decode(value),MARKET);
 return u.protocol==='https:'&&!/\.svg$/i.test(u.pathname)&&u.hostname!=='www.facebook.com'&&u.href.length<2200?u.href:null
}catch(e){return null}}
function parseMarketplace(html,markdown,make,model){
 const listings=new Map(),body=html.slice(0,1500000);
 function take(id,context,img){
  if(!/^\d{8,20}$/.test(id)||listings.has(id))return;
  const segment=htmlText(decode(context)).slice(0,700);
  const requested=[make,model].filter(Boolean);
  const normalize=x=>String(x).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  if(!requested.every(x=>normalize(segment).includes(normalize(x))))return;
  const price=segment.match(/\$[\d,]+(?:\.\d{2})?/);
  const titleMatch=segment.match(new RegExp('(?:19|20)\\d{2}[^$|•\\n]{0,110}','i'));
  const title=(titleMatch?.[0]||segment.slice(0,135)).trim();
  if(title.length<10)return;
  const picture=validImage(img);
  listings.set(id,{title,url:MARKET+'/marketplace/item/'+id+'/',source:'Facebook Marketplace',category:'classified',image:picture,price:price?.[0]||null,note:segment.slice(0,300),verifiedStatus:false});
 }
 // Prefer cards with an explicit listing href; only infer fields from the same card neighborhood.
 for(const match of body.matchAll(/(?:href|url)\s*[=:]\s*["']([^"']*\/marketplace\/item\/(\d{8,20})[^"']*)["']/gi)){
  const id=match[2],start=Math.max(0,match.index-2200),end=Math.min(body.length,match.index+3300);
  const context=body.slice(start,end);
  const img=(context.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/i)||[])[1]
   ||(context.match(/https?:\\\/\\\/[^"\s]+?\.(?:jpg|jpeg|png|webp)[^"\s]*/i)||[])[0];
  take(id,context,img);
 }
 // Some React pages serialize the listing permalink in escaped JSON.
 for(const match of body.matchAll(/marketplace\\?\/item\\?\/(\d{8,20})/gi)){
  const id=match[1];if(listings.has(id))continue;
  const context=body.slice(Math.max(0,match.index-1800),Math.min(body.length,match.index+2500));
  take(id,context,null);
 }
 return [...listings.values()].slice(0,45)
}
function restricted(html,markdown){
 const text=(html.slice(0,16000)+' '+markdown.slice(0,5000)).toLowerCase();
 return /(?:log in to facebook|you must log in|sign in to continue|create new account|login to continue|temporarily blocked|content isn't available right now)/.test(htmlText(text));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({message:'GET only'});
 if(!process.env.NIMBLE_API_KEY)return res.status(503).json({enabled:false,results:[],message:'Nimble API key is not configured.'});
 const make=clean(req.query.make),model=clean(req.query.model)==='All Models'?'':clean(req.query.model),zip=clean(req.query.zip),milesInput=clean(req.query.miles);
 const readYear=x=>x===undefined||x===null||x===''?null:Number(x);
 const yearMin=readYear(req.query.yearMin),yearMax=readYear(req.query.yearMax);
 if(!make||!model&&make.length<2)return res.status(400).json({results:[],message:'Select a make before searching Facebook.'});
 const filtered=Boolean(zip||milesInput),miles=Number(milesInput);
 if(filtered&&(!/^\d{5}$/.test(zip)||!Number.isFinite(miles)||miles<1||miles>3000))return res.status(400).json({results:[],message:'Enter a valid 5-digit ZIP and radius of 1 to 3,000 miles.'});
 if(filtered&&!(await zipLocation(zip)))return res.status(400).json({results:[],message:'ZIP code not found.'});
 // The user provided this Marketplace search region for Cortlandt Manor ZIP 10567.
 // Other ZIPs use generic Marketplace search; precise FB region resolution is not verified.
 const base=zip==='10567'?MARKET+'/marketplace/108202695866832/search/':MARKET+'/marketplace/category/search/';
 const url=new URL(base);url.searchParams.set('query',[make,model].filter(Boolean).join(' '));
 if(filtered)url.searchParams.set('radius',String(Math.min(miles,500)));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
 try{
  const response=await fetch('https://sdk.nimbleway.com/v2/extract',{
   method:'POST',headers:{Authorization:'Bearer '+process.env.NIMBLE_API_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({url:url.href,driver:'max',formats:['html'],request_timeout:20000}),
   signal:controller.signal
  });
  if(!response.ok)return res.status(200).json({enabled:true,results:[],status:'extract-error',message:'Nimble could not retrieve this public Facebook Marketplace page ('+response.status+').',searchUrl:url.href});
  const payload=await response.json(),page=extractedContent(payload);
  if(!page.html&&!page.markdown)return res.status(200).json({enabled:true,results:[],status:'no-page-content',message:'Nimble returned no rendered HTML for Facebook Marketplace.',searchUrl:url.href});
  const found=parseMarketplace(page.html,page.markdown,make,model).filter(item=>{if(yearMin===null&&yearMax===null)return true;const year=Number((item.title.match(/\b(?:18|19|20)\d{2}\b/)||[])[0]);return Number.isInteger(year)&&(yearMin===null||year>=yearMin)&&(yearMax===null||year<=yearMax)});
  if(!found.length)return res.status(200).json({enabled:true,results:[],status:restricted(page.html,page.markdown)?'login-required':'no-public-listings',message:restricted(page.html,page.markdown)?'Facebook requires a signed-in session for these search results. Nimble cannot access private listings through its public extraction endpoint.':'The public Facebook page returned no verifiable individual vehicle listing cards.',searchUrl:url.href});
  if(filtered){
   const location=await withinRadius(found,zip,miles);
   if(location.error)return res.status(400).json({enabled:true,results:[],status:'location-error',message:location.error});
   return res.status(200).json({enabled:true,results:location.results,status:'partial',candidateCount:found.length,unknownExcluded:location.unknown,searchUrl:url.href,message:'Extracted '+found.length+' Facebook listings, but only '+location.results.length+' had verifiable locations within range. Facebook results may differ from your signed-in browser.'});
  }
  return res.status(200).json({enabled:true,results:found,status:'partial',candidateCount:found.length,searchUrl:url.href,message:'These are publicly exposed Marketplace listing cards; availability may differ in a signed-in browser.'});
 }catch(e){return res.status(200).json({enabled:true,results:[],status:'extract-error',message:'Facebook extraction failed or timed out. You can still open the search in Facebook.',searchUrl:url.href})}
 finally{clearTimeout(timer)}
}
