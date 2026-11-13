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
function matchVehicle(title,description,make,model){const s=(title+' '+description).toLowerCase();return [make,model].filter(Boolean).every(term=>term.toLowerCase().split(/\s+/).some(part=>part.length>1&&s.includes(part)))}

// Only vehicle-specific auction or sale listing URLs qualify. Search/article/category pages do not.
// Conservative by design: unknown URL formats are excluded until validated for that source.
function isVehicleListing(url,source,title,note){
 const path=decodeURIComponent(url.pathname).toLowerCase();
 const text=(title+' '+note).toLowerCase();
 if(/\/(?:stories|story|articles|article|blog|news|features|feature|buyer-guides?|buying-guides?|guides?|events|calendar|results|search|category|categories|collections|about|sell|how-to|magazine|market-trends|valuation|price-guide)(?:\/|$)/i.test(path))return false;
 if(/\b(?:buyer'?s guide|buying guide|how to buy|history of|model history|market analysis|market report|restoration guide|price guide|value guide|auction preview|upcoming auctions|auction calendar)\b/i.test(title))return false;
 if(/\b(?:diecast|scale model|model car|toy car|brochure|poster|memorabilia|hood ornament|wheel set|engine only|parts only)\b/i.test(title))return false;
 const rules={
 'Bring a Trailer':/^\/listing\/[^/]+\/?$/,
 'Cars & Bids':/^\/auctions\/[^/]+(?:\/[^/]+)?\/?$/,
 'PCARMARKET':/^\/(?:auction|auctions|listing|listings)\/[^/]+(?:\/[^/]+)?\/?$/,
 'Hemmings':/^\/(?:classifieds\/listing|auction|auctions\/auction|auctions\/listing)\/[^/]+\/?$/,
 'Hagerty':/^\/marketplace\/(?:auction|classified|listing)\/[^/]+(?:\/[^/]+)?\/?$/,
 'Bonhams':/^\/(?:auction\/\d+\/lot\/\d+|auctions\/\d+\/lot\/\d+|lot\/\d+)(?:\/[^/]+)?\/?$/,
 "RM Sotheby's":/^\/auctions\/[^/]+\/lots\/[^/]+\/?$/,
 "Gooding Christie's":/^\/(?:lot|lots|auction\/lot)\/[^/]+(?:\/[^/]+)?\/?$/,
 'Broad Arrow':/^\/(?:vehicles|vehicle|lots)\/[^/]+(?:\/[^/]+)?\/?$/,
 'eBay Motors':/^\/itm\/(?:[^/]+\/)?\d+(?:\/|$)/,
 'Facebook Marketplace':/^\/marketplace\/item\/\d+(?:\/|$)/,
 'Collecting Cars':/^\/(?:for-sale|auctions)\/[^/]+(?:\/[^/]+)?\/?$/
 };
 const rule=rules[source];
 if(!rule||!rule.test(path))return false;
 // Listing descriptions can reference sold cars or past auctions; do not infer active status from search alone.
 return true;
}

// Conservative status classification. A source's URL alone does not establish a live auction.
function classifyListing(url,source,title,description,item){
 const path=url.pathname.toLowerCase(),body=(title+' '+description).toLowerCase();
 const classified=source==='Facebook Marketplace'
  ||(source==='Hemmings'&&path.startsWith('/classifieds/'))
  ||(source==='Hagerty'&&/\/marketplace\/(classified|listing)\//.test(path))
  ||(source==='eBay Motors'&&/\b(?:buy it now|fixed price|classified ad)\b/i.test(body));
 if(classified)return 'classified';
 const explicitClosed= /\b(?:sold for|sold at|sold on|winning bid|auction ended|auction closed|auction complete|auction concluded|final bid|winning bidder|hammer price|not sold|no sale|reserve not met|passed in|bidding ended|bidding closed|closed auction|closed on|ended on|bid to|sold to|auction result)\b/i.test(body)
 ||/\b(?:past auction|past sale|archived auction|closed on|sold on|bid to|auction result)\b/i.test(body);
 if(explicitClosed)return 'results';
 const explicitLive=/\b(?:live auction|auction is live|bidding is open|bid now|place a bid|current bid|ends in|ending in|time left|auction ends|auction closes|bidding ends|bidding closes|active auction)\b/i.test(body);
 if(explicitLive)return 'live';
 return 'unverified';
}


// Live is a verified state, not a keyword. Search snippets are too stale for that.
// Pull the auction's own listing page via Nimble Extract and require an unexpired closing time.
function extractDocument(data){
 const raw=data?.data?.html??data?.html??data?.data?.content??'';
 return typeof raw==='string'?raw:'';
}
function metaContents(html){
 const out=[];
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
  const props={};
  for(const pair of tag.matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/g))props[pair[1].toLowerCase()]=pair[3];
  if(/^(description|og:description|twitter:description|og:title)$/i.test(props.name||props.property||''))out.push(props.content||'');
 }
 return out.join(' ').replace(/<[^>]*>/g,' ').slice(0,1800);
}
function endTimes(html){
 const matches=[];
 // Auction-close fields from structured data and front-end auction configuration.
 const patterns=[
  /["'](?:endDate|endsAt|endTime|endTimestamp|auctionEnd|auction_end|auctionEndTime|auction_end_time|closingDate|closeTime|end_time|auction_ends_at)["']\s*[:=]\s*["']?([0-9]{10,13}|20\d{2}-\d{2}-\d{2}[T ][0-9:.+-]{5,25})/gi,
  /(?:data-(?:auction-end|end-time|ends-at|end-date|closing-time|end-timestamp))\s*=\s*["']([^"']{10,40})["']/gi,
  /<time[^>]*datetime=["']([^"']+)["'][^>]*(?:>[^<]*(?:ends|closes|bidding)|data-(?:auction|end))/gi
 ];
 for(const pattern of patterns)for(const m of html.matchAll(pattern)){
  const raw=m[1];const num=Number(raw);
  let time=Number.isFinite(num)&&/^\d{10,13}$/.test(raw)?(raw.length===10?num*1000:num):Date.parse(raw);
  if(Number.isFinite(time))matches.push(time);
 }
 return matches;
}
function verifyLiveFromDocument(html,title,note,now=Date.now()){
 if(!html||html.length<200)return null;
 const meta=metaContents(html);
 const summary=(title+' '+note+' '+meta).toLowerCase();
 // A known end-state on the auction itself rules out active bidding.
 const closed=/\b(?:sold for|sold on|winning bid|auction ended|auction closed|bidding closed|bidding ended|reserve not met|not sold|auction concluded|final bid|hammer price)\b/i;
 if(closed.test(summary))return null;
 const times=endTimes(html).filter(t=>t>now+30000&&t<now+1000*60*60*24*120);
 if(!times.length)return null;
 // Distinguish currently-biddable auctions from announced upcoming events.
 const active=/\b(?:current bid|bid now|place a bid|bidding is open|time left|auction ends|auction closes|bidding ends|ends in|live auction|active auction)\b/i;
 const htmlFront=html.slice(0,200000);
 if(!active.test(summary)&&!active.test(htmlFront.replace(/<[^>]+>/g,' ').slice(0,10000)))return null;
 return new Date(Math.min(...times)).toISOString();
}
async function verifyLiveAuction(item,key){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7500);
 try{
  const response=await fetch('https://sdk.nimbleway.com/v2/extract',{
   method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({url:item.url,formats:['html'],render:false}),signal:controller.signal
  });
  if(!response.ok)return null;
  const data=await response.json();
  const end=verifyLiveFromDocument(extractDocument(data),item.title,item.note);
  return end?{...item,category:'live',verifiedStatus:true,endsAt:end,verifiedAt:new Date().toISOString()}:null;
 }catch(e){return null}finally{clearTimeout(timer)}
}
async function verifyLiveCandidates(items,key){
 // Keep bounded extraction costs and execution time. Unknown status is never called live.
 const selected=items.slice(0,12),results=new Array(selected.length);
 let next=0;
 async function worker(){while(next<selected.length){const i=next++;results[i]=await verifyLiveAuction(selected[i],key)}}
 await Promise.all(Array.from({length:Math.min(6,selected.length)},()=>worker()));
 return results.filter(Boolean);
}


// Historical results must be confirmed closed/sold, not discarded because snippets omit status.
function closedFromDocument(html,title,note){
 const meta=metaContents(html);
 // Small text window around BaT's auction result panel and page-level metadata.
 const around=html.match(/Auction Result[\s\S]{0,2000}/i)?.[0]||'';
 const body=[title,note,meta,around].join(' ').replace(/<[^>]+>/g,' ');
 return /\b(?:auction ended|auction result|bid to|sold for|sold at|closed on|reserve not met|winning bid|final bid|auction concluded|unsold|not sold)\b/i.test(body);
}
async function verifyCompletedCandidates(items,key){
 const accepted=[],unknown=[];
 for(const item of items.slice(0,35)){
  if(classifyListing(new URL(item.url),item.source,item.title,item.note,{})==='results'){accepted.push({...item,category:'results',verifiedStatus:false});}
  else unknown.push(item);
 }
 const chosen=unknown.slice(0,14);
 let next=0;
 async function worker(){while(next<chosen.length){
  const item=chosen[next++],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
  try{
   const r=await fetch('https://sdk.nimbleway.com/v2/extract',{method:'POST',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({url:item.url,formats:['html'],render:false}),signal:controller.signal});
   if(r.ok&&closedFromDocument(extractDocument(await r.json()),item.title,item.note))
    accepted.push({...item,category:'results',verifiedStatus:true});
  }catch(e){}finally{clearTimeout(timer)}
 }}
 await Promise.all(Array.from({length:Math.min(5,chosen.length)},()=>worker()));
 return accepted.slice(0,45);
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({message:'GET only'});
 if(!process.env.NIMBLE_API_KEY)return res.status(503).json({enabled:false,provider:'Nimble',results:[],message:'Nimble is not configured yet. Add NIMBLE_API_KEY in the Vercel project environment. You can still open the auction-site search links.'});
 const category=['live','results','classified'].includes(safe(req.query.category))?safe(req.query.category):'live';
 const make=safe(req.query.make),model=safe(req.query.model)==='All Models'?'':safe(req.query.model),trim=safe(req.query.trim);
 const readYear=value=>value===undefined||value===null||value===''?null:Number(value);
 const yearMin=readYear(req.query.yearMin??req.query.year),yearMax=readYear(req.query.yearMax??req.query.year);
 if(!make||[yearMin,yearMax].some(y=>y!==null&&(!Number.isInteger(y)||y<1886||y>2035))||(yearMin!==null&&yearMax!==null&&yearMin>yearMax))return res.status(400).json({enabled:true,provider:'Nimble',message:'Enter a valid make and optional year bounds (minimum no later than maximum).'});
 const yearTerm=yearMin!==null&&yearMax!==null?(yearMin===yearMax?String(yearMin):yearMax-yearMin<=15?'('+Array.from({length:yearMax-yearMin+1},(_,i)=>yearMin+i).join(' OR ')+')':''):'';
 const phrase=[yearTerm,make,model,trim].filter(Boolean).join(' ');
 // Query individual listing pages directly. Compound OR-site queries previously returned
 // too few BaT results and swallowed model-level archive listings.
 const preferred=category==='results'
  ?['site:bringatrailer.com/listing/','site:carsandbids.com/auctions/','site:collectingcars.com','site:hemmings.com']
  :category==='live'
  ?['site:bringatrailer.com/listing/','site:carsandbids.com/auctions/','site:pcarmarket.com','site:hagerty.com']
  :['site:hemmings.com/classifieds/listing/','site:ebay.com/itm/','site:facebook.com/marketplace/item/','site:collectingcars.com'];
 const discoveryQueries=preferred.map(site=>phrase+' '+site+' '+(category==='results'?'auction sold closed ended':category==='live'?'auction bidding ends':'for sale'));
 // Second pass spans the remaining auction houses.
 discoveryQueries.push(phrase+' '+(category==='results'?'auction result sold closed':category==='live'?'live auction current bid ends':'classified for sale')+
  ' ('+SOURCES.slice(4,9).map(([,domain])=>'site:'+domain).join(' OR ')+')');
 async function searchNimble(query){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
  try{
   const response=await fetch('https://sdk.nimbleway.com/v2/search',{
    method:'POST',headers:{Authorization:'Bearer '+process.env.NIMBLE_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({query,focus:'general',search_depth:'standard',max_results:30}),signal:controller.signal
   });
   if(!response.ok)throw new Error('Nimble returned '+response.status);
   const data=await response.json();
   return Array.isArray(data.results)?data.results:Array.isArray(data.data?.results)?data.data.results:[];
  }finally{clearTimeout(timer)}
 }
 try{
 const batches=await Promise.allSettled(discoveryQueries.map(searchNimble));
 const discovered=batches.filter(x=>x.status==='fulfilled').flatMap(x=>x.value);
 if(!discovered.length&&batches.every(x=>x.status==='rejected'))
  throw new Error('All discovery requests failed');
 const dedup=new Set(),results=[];
 for(const item of discovered){
  try{
   const u=new URL(item.url||'');if(!['https:','http:'].includes(u.protocol))continue;
   const source=sourceOf(u.hostname.toLowerCase());if(!source)continue;
   const title=String(item.title||'Auction result').replace(/<[^>]*>/g,'').slice(0,200);
   const note=String(item.description||item.snippet||'').replace(/<[^>]*>/g,'').slice(0,340);
   if(!isVehicleListing(u,source,title,note))continue;
   if(!matchVehicle(title,note,make,model))continue;
   const listingCategory=classifyListing(u,source,title,note,item);
   if(category==='live'&&(listingCategory==='results'||listingCategory==='classified'))continue;
   if(category==='classified'&&listingCategory!=='classified')continue;
   if(category==='results'&&listingCategory==='classified')continue;
   // Results with no status signal remain candidates pending listing-page validation.
   const years=(title+' '+note).match(/\b(?:18|19|20)\d{2}\b/g)?.map(Number)||[];
   if(years.length&&(yearMin!==null||yearMax!==null)&&!years.some(y=>(yearMin===null||y>=yearMin)&&(yearMax===null||y<=yearMax)))continue;
   const key=u.origin+u.pathname.replace(/\/$/,'');if(dedup.has(key))continue;dedup.add(key);
   results.push({title,url:u.href,source,note,category:listingCategory,verifiedStatus:false});
  }catch(e){}
 }
 const finalResults=category==='live'?await verifyLiveCandidates(results,process.env.NIMBLE_API_KEY):
   category==='results'?await verifyCompletedCandidates(results,process.env.NIMBLE_API_KEY):results.slice(0,45);
 return res.status(200).json({enabled:true,provider:'Nimble',category,query:phrase,results:finalResults,checkedAt:new Date().toISOString(),message:category==='live'?'Live auctions require a future closing time confirmed from the listing page. Unverifiable auctions are excluded.':category==='results'?'Historical listings include completed-sale signals and checked archive pages; verify final sale prices on the source.':'Classified listings are identified by source and listing URL.'});
 }catch(e){
 return res.status(502).json({enabled:true,provider:'Nimble',results:[],message:'Nimble Search is currently unavailable or the API key is invalid. Check Vercel configuration and try again.'});
 }
}
