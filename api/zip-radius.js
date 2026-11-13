// US ZIP-radius support for Motorfolio. No geolocation secret required.
// Distances are approximate straight-line miles between postal centroids (not driving miles).
const STATES={
 AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'};
const stateName=s=>STATES[s.toUpperCase()]||s;
const cache=new Map();
async function fetchJSON(url){const c=new AbortController(),timer=setTimeout(()=>c.abort(),5500);try{const r=await fetch(url,{signal:c.signal});if(!r.ok)return null;return await r.json()}finally{clearTimeout(timer)}}
async function zipLocation(zip){if(!/^\d{5}$/.test(zip))return null;const key='zip:'+zip;if(cache.has(key))return cache.get(key);
 const json=await fetchJSON('https://api.zippopotam.us/us/'+zip);
 const place=json?.places?.[0];const point=place?{lat:Number(place.latitude),lon:Number(place.longitude),label:place['place name']+', '+place['state abbreviation'],zip}:null;
 const good=point&&Number.isFinite(point.lat)&&Number.isFinite(point.lon)?point:null;
 cache.set(key,good);return good}
async function cityLocation(city,state){const key='city:'+city.toLowerCase()+':'+state.toLowerCase();if(cache.has(key))return cache.get(key);
 const json=await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:city,count:'15',language:'en',countryCode:'US',format:'json'}));
 const label=stateName(state).toLowerCase();
 const found=(json?.results||[]).find(x=>(x.admin1||'').toLowerCase()===label);
 const point=found?{lat:Number(found.latitude),lon:Number(found.longitude),label:found.name+', '+found.admin1}:null;
 const good=point&&Number.isFinite(point.lat)&&Number.isFinite(point.lon)?point:null;
 cache.set(key,good);return good}
function miles(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return Math.round(3958.7613*2*Math.asin(Math.min(1,Math.sqrt(h))))}
function listingLocation(text){
 // Prefer a clearly identified ZIP, never infer from arbitrary 5-digit prices or IDs.
 const labeled=text.match(/\b(?:zip(?:\s*code)?|postal\s*code)\s*[:#-]?\s*(\d{5})(?:-\d{4})?\b/i);
 if(labeled)return {zip:labeled[1]};
 const cityState=text.match(/\b(?:located in|location\s*:?|vehicle location\s*:?|seller location\s*:?|in )\s*([A-Za-z][A-Za-z .'-]{1,38}?),?\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i);
 if(cityState)return {city:cityState[1].trim(),state:cityState[2].toUpperCase()};
 return null
}
async function distanceFor(origin,item){
 const location=listingLocation([item.title,item.note].join(' '));
 if(!location)return null;
 const dest=location.zip?await zipLocation(location.zip):await cityLocation(location.city,location.state);
 if(!dest)return null;
 return {miles:miles(origin,dest),location:dest.label,zip:dest.zip||null}
}
async function withinRadius(items,originZip,maxMiles){
 const origin=await zipLocation(originZip);if(!origin)return {error:'Invalid or unsupported U.S. ZIP code.'};
 const out=[];let unknown=0;let next=0;
 async function worker(){while(next<items.length){const index=next++,item=items[index];try{
  const result=await distanceFor(origin,item);
  if(!result){unknown++;continue}
  if(result.miles<=maxMiles)out.push({...item,distanceMiles:result.miles,location:result.location,locationZip:result.zip})
 }catch(e){unknown++}}}
 await Promise.all(Array.from({length:Math.min(6,items.length)},()=>worker()));
 out.sort((a,b)=>a.distanceMiles-b.distanceMiles);
 return {results:out,unknown,origin:origin.label}
}
export {zipLocation,miles,withinRadius};
