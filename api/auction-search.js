// MarqueWatch on-demand discovery powered exclusively by Nimble Search API v2.
// Set NIMBLE_API_KEY in the Vercel project environment, never in browser code.
// Search result discovery is not proof a listing is active or an offer to scrape restricted platforms.
const SOURCES=[
 ['Bring a Trailer','bringatrailer.com'],['Cars & Bids','carsandbids.com'],
 ['PCARMARKET','pcarmarket.com'],['Hemmings','hemmings.com'],
 ['Hagerty','hagerty.com'],['Bonhams','bonhams.com'],
 ["RM Sotheby's",'rmsothebys.com'],["Gooding Christie's",'goodingco.com'],
 ['Broad Arrow','broadarrowauctions.com'],['eBay Motors','ebay.com'],
 ['Facebook Marketplace','facebook.com'],['Collecting Cars','collectingcars.com']
];
const safe=s=>String(s||'').trim().replace(/[\x00-\x1f]/g,' ').slice(0,100);
function sourceOf(host){return SOURCES.find(([,domain])=>host===domain||host.endsWith('.'+domain))?.[0]||null}
function matchVehicle(title,description,make,model){const s=(title+' '+description).toLowerCase();return [make,model].every(term=>term.toLowerCase().split(/\s+/).some(part=>part.length>1&&s.includes(part)))}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({message:'GET only'});
 if(!process.env.NIMBLE_API_KEY)return res.status(503).json({enabled:false,provider:'Nimble',results:[],message:'Nimble is not configured yet. Add NIMBLE_API_KEY in the Vercel project environment. You can still open the auction-site search links.'});
 const make=safe(req.query.make),model=safe(req.query.model)==='All Models'?'':safe(req.query.model),yearMin=Number(req.query.yearMin??req.query.year),yearMax=Number(req.query.yearMax??req.query.year),trim=safe(req.query.trim);
 if(!make||!Number.isInteger(yearMin)||!Number.isInteger(yearMax)||yearMin<1886||yearMax>2035||yearMin>yearMax)return res.status(400).json({enabled:true,provider:'Nimble',message:'A valid make, minimum year, and maximum year are required.'});
 const yearTerm=yearMin===yearMax?String(yearMin):yearMax-yearMin<=15?'('+Array.from({length:yearMax-yearMin+1},(_,i)=>yearMin+i).join(' OR ')+')':'';
 const phrase=[yearTerm,make,model,trim].filter(Boolean).join(' ');
 // Three scoped requests: reduce irrelevant results and make source coverage explicit.
 const groups=[SOURCES.slice(0,4),SOURCES.slice(4,8),SOURCES.slice(8,12)];
 try{
 const batches=await Promise.all(groups.map(async group=>{
  const query=phrase+' ('+group.map(([,domain])=>'site:'+domain).join(' OR ')+')';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
  try{
   const response=await fetch('https://sdk.nimbleway.com/v2/search',{
    method:'POST',headers:{'Authorization':'Bearer '+process.env.NIMBLE_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({query,focus:'general',search_depth:'standard',max_results:15}),signal:controller.signal
   });
   if(!response.ok)throw new Error('Nimble returned '+response.status);
   const data=await response.json();
   return Array.isArray(data.results)?data.results:[];
  }finally{clearTimeout(timer)}
 }));
 const dedup=new Set(),results=[];
 for(const item of batches.flat()){
  try{
   const u=new URL(item.url||'');if(!['https:','http:'].includes(u.protocol))continue;
   const source=sourceOf(u.hostname.toLowerCase());if(!source)continue;
   const title=String(item.title||'Auction result').replace(/<[^>]*>/g,'').slice(0,200);
   const note=String(item.description||item.snippet||'').replace(/<[^>]*>/g,'').slice(0,340);
   if(!matchVehicle(title,note,make,model))continue;
   const years=(title+' '+note).match(/\b(?:18|19|20)\d{2}\b/g)?.map(Number)||[];
   if(years.length&& !years.some(y=>y>=yearMin&&y<=yearMax))continue;
   const key=u.origin+u.pathname.replace(/\/$/,'');if(dedup.has(key))continue;dedup.add(key);
   results.push({title,url:u.href,source,note});
  }catch(e){}
 }
 return res.status(200).json({enabled:true,provider:'Nimble',query:phrase,results:results.slice(0,45),checkedAt:new Date().toISOString(),message:'Nimble search discovery: verify listing year, activity and availability directly with the source.'});
 }catch(e){
 return res.status(502).json({enabled:true,provider:'Nimble',results:[],message:'Nimble Search is currently unavailable or the API key is invalid. Check Vercel configuration and try again.'});
 }
}
