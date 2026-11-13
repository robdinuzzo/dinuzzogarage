// MarqueWatch: optional server-side aggregated search for publicly indexed auction listings.
// Configure BRAVE_SEARCH_API_KEY in Vercel. Never expose the secret to the client.
// Index search is discovery only: it does not certify current auction status.
const DOMAINS=[
['Bring a Trailer','bringatrailer.com'],
['Cars & Bids','carsandbids.com'],
['PCARMARKET','pcarmarket.com'],
['Hemmings','hemmings.com'],
['Hagerty','hagerty.com'],
['Bonhams','bonhams.com'],
["RM Sotheby's",'rmsothebys.com'],
["Gooding Christie's",'goodingco.com'],
['Broad Arrow','broadarrowauctions.com'],
['eBay Motors','ebay.com'],
['Facebook Marketplace','facebook.com'],
['Collecting Cars','collectingcars.com']
];
const labelForHost=host=>DOMAINS.find(([,d])=>host===d||host.endsWith('.'+d))?.[0]||null;
const clean=s=>String(s||'').trim().slice(0,100).replace(/[\x00-\x1f]/g,' ');
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({message:'GET only'});
 if(!process.env.BRAVE_SEARCH_API_KEY)return res.status(503).json({enabled:false,results:[],message:'Live aggregation is not configured yet. Add BRAVE_SEARCH_API_KEY to Vercel to enable on-demand searching; direct source search links remain available.'});
 const make=clean(req.query.make),model=clean(req.query.model),year=Number(req.query.year),trim=clean(req.query.trim),mode=clean(req.query.mode);
 if(!make||!model||!Number.isInteger(year)||year<1886||year>2035)return res.status(400).json({enabled:true,message:'Enter a valid vehicle make, model and year.'});
 const yearTerm=mode==='generation'?'':mode==='near'?String(year-2)+'..'+String(year+2):String(year);
 const terms=[yearTerm,make,model,trim].filter(Boolean).join(' ');
 const groups=[DOMAINS.slice(0,4),DOMAINS.slice(4,8),DOMAINS.slice(8,12)];
 try{
  const all=await Promise.all(groups.map(async group=>{
   const query=terms+' ('+group.map(([,domain])=>'site:'+domain).join(' OR ')+')';
   const url='https://api.search.brave.com/res/v1/web/search?'+new URLSearchParams({q:query,count:'20',search_lang:'en',safesearch:'moderate'}).toString();
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7500);
   try{
    const r=await fetch(url,{headers:{'Accept':'application/json','X-Subscription-Token':process.env.BRAVE_SEARCH_API_KEY},signal:controller.signal});
    if(!r.ok)throw new Error('Search provider returned '+r.status);
    const json=await r.json();
    return (json.web?.results||[]).map(item=>{
     try{
      const link=new URL(item.url);
      if(link.protocol!=='https:'&&link.protocol!=='http:')return null;
      const source=labelForHost(link.hostname.toLowerCase());
      if(!source)return null;
      return {title:String(item.title||'Auction listing').replace(/<[^>]*>/g,'').slice(0,220),url:link.href,source,note:String(item.description||'').replace(/<[^>]*>/g,'').slice(0,340)}
     }catch(e){return null}
    }).filter(Boolean)
   }finally{clearTimeout(timer)}
  }));
  const seen=new Set();
  const results=all.flat().filter(item=>{const key=item.url.replace(/\?.*$/,'').replace(/\/$/,'');if(seen.has(key))return false;seen.add(key);return true});
  return res.status(200).json({enabled:true,query:terms,results:results.slice(0,50),checkedAt:new Date().toISOString(),note:'Search-engine-indexed links are not verified active listings. Check the auction page for live status.'});
 }catch(err){
  return res.status(502).json({enabled:true,results:[],message:'Live search provider unavailable. Please use the direct source links and try again later.'});
 }
}
