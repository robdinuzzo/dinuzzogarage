import {zipLocation,miles} from '../lib/zip-radius.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({message:'GET only'});
 const a=String(req.query.origin||''),b=String(req.query.destination||'');
 if(!/^\d{5}$/.test(a)||!/^\d{5}$/.test(b))return res.status(400).json({message:'Valid 5-digit U.S. ZIP codes are required.'});
 try{
  const [from,to]=await Promise.all([zipLocation(a),zipLocation(b)]);
  if(!from||!to)return res.status(404).json({message:'One of the ZIP codes could not be found.'});
  res.setHeader('Cache-Control','public, s-maxage=86400');
  return res.status(200).json({distanceMiles:miles(from,to),location:to.label,distanceType:'straight-line'});
 }catch(e){return res.status(503).json({message:'Postal location service unavailable.'})}
}