(()=>{
'use strict';
const canvas=document.getElementById('arcade-canvas');
if(!canvas)return;
const ctx=canvas.getContext('2d');
if(!ctx)return;
ctx.imageSmoothingEnabled=false;
const W=352,H=448,ROAD_L=49,ROAD_R=303,LANES=3,LANE_W=(ROAD_R-ROAD_L)/LANES;
const overlay=document.getElementById('arcade-overlay'),message=document.getElementById('arcade-message'),sub=document.getElementById('arcade-submessage'),start=document.getElementById('arcade-start');
const scoreEl=document.getElementById('arcade-score'),bestEl=document.getElementById('arcade-best'),livesEl=document.getElementById('arcade-lives'),levelEl=document.getElementById('arcade-level');
let state='ready',score=0,best=0,lives=3,level=1,meters=0,clock=0,scroll=0,spawnTimer=0,last=0,raf=0,invulnerable=0,boost=false,brake=false,traffic=[],particles=[];
let player={lane:1,x:laneX(1),y:346};
const palette=['#b45045','#dbad58','#82a7a4','#a1a4b4','#c5a1a9','#c0b48f'];
try{best=Math.max(0,Number(localStorage.getItem('dinuzzo-arcade-best'))||0)}catch(e){}
function laneX(lane){return ROAD_L+LANE_W*(lane+.5)}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
function text(str,x,y,color,size=12,align='left'){ctx.fillStyle=color;ctx.font='bold '+size+'px monospace';ctx.textAlign=align;ctx.fillText(str,x,y)}
function hud(){scoreEl.textContent=String(Math.floor(score)).padStart(4,'0');bestEl.textContent=String(best).padStart(4,'0');livesEl.textContent=Array(lives).fill('♥').join(' ');levelEl.textContent=String(level).padStart(2,'0')}
function updateBest(){if(score>best){best=Math.floor(score);try{localStorage.setItem('dinuzzo-arcade-best',String(best))}catch(e){}}hud()}
function drawJaguar(x,y){ // Purpose-built top-view 1953 Jaguar XK120 Fixed Head Coupe pixel sprite; front points up.
ctx.save();ctx.translate(Math.round(x),Math.round(y)); 
rect(-20,-22,6,12,'#111512');rect(14,-22,6,12,'#111512');rect(-20,14,6,13,'#111512');rect(14,14,6,13,'#111512');
rect(-14,-31,28,62,'#10271d');rect(-12,-36,24,8,'#123c2e');rect(-16,-29,32,12,'#1d563e');
rect(-18,-18,36,18,'#1c593f');rect(-16,0,32,18,'#1b513c');rect(-14,18,28,13,'#1a4937');
rect(-10,-36,20,5,'#2b7556');rect(-13,-26,26,15,'#2a7957');rect(-10,-22,20,9,'#327d58');
rect(-13,-8,26,23,'#d8c59c');rect(-10,-6,20,17,'#30444a');rect(-7,-5,14,7,'#4e6870');rect(-9,10,18,5,'#c0aa84');
rect(-13,17,26,5,'#2f7450');rect(-9,22,18,9,'#17402f');
rect(-3,-34,6,16,'#78ae82');rect(-2,-16,4,9,'#dabf83');
rect(-13,-33,5,4,'#f0dfb6');rect(8,-33,5,4,'#f0dfb6');rect(-12,28,6,3,'#d55345');rect(6,28,6,3,'#d55345');
rect(-15,-11,3,8,'#c7ad77');rect(12,-11,3,8,'#c7ad77');
ctx.restore()}
function drawTraffic(x,y,color,oncoming,type){ctx.save();ctx.translate(Math.round(x),Math.round(y));if(oncoming)ctx.rotate(Math.PI);const w=type==='van'?40:32,h=type==='van'?70:58;
rect(-w/2-2,-h/2+9,5,13,'#0b0e0d');rect(w/2-3,-h/2+9,5,13,'#0b0e0d');rect(-w/2-2,h/2-21,5,13,'#0b0e0d');rect(w/2-3,h/2-21,5,13,'#0b0e0d');
rect(-w/2,-h/2,w,h,'#181c1b');rect(-w/2+3,-h/2+2,w-6,h-4,color);
rect(-w/2+6,-h/2+11,w-12,type==='van'?22:12,'#a5b7b3');rect(-w/2+6,h/2-16,w-12,9,'#657f82');
rect(-w/2+5,-h/2+1,7,4,'#f2e1a4');rect(w/2-12,-h/2+1,7,4,'#f2e1a4');rect(-w/2+5,h/2-5,7,3,'#d76357');rect(w/2-12,h/2-5,7,3,'#d76357');
if(type==='van'){rect(-w/2+5,-h/2+37,w-10,3,'#d2c8aa')}ctx.restore()}
function background(){
rect(0,0,W,H,'#35462c');const yoffset=scroll*.35;
for(let side=0;side<2;side++){const sx=side?310:5;for(let i=-1;i<10;i++){const y=((i*64+yoffset)%512+512)%512-50;rect(sx+(i%2)*9,y+7,23,27,'#243b25');rect(sx+4+(i%2)*9,y,16,20,'#4c7040');rect(sx+9+(i%2)*9,y+4,7,12,'#6b8b50')}}
rect(ROAD_L-7,0,7,H,'#7d7c61');rect(ROAD_R,0,7,H,'#7d7c61');rect(ROAD_L,0,ROAD_R-ROAD_L,H,'#343b3d');
for(let i=-1;i<18;i++){const y=((i*37+scroll)%540+540)%540-45;rect(ROAD_L-5,y,3,20,'#c6b998');rect(ROAD_R+2,y,3,20,'#c6b998')}
for(let i=-1;i<10;i++){const y=((i*70+scroll)%560+560)%560-70;rect(ROAD_L+LANE_W*2-2,y,4,36,'#d0b97b');rect(ROAD_L+LANE_W-2,y,4,36,'#e8e5d8')}
// Left lane is oncoming. Double yellow line separates traffic directions.
rect(ROAD_L+LANE_W-5,0,2,H,'#d9b66c');rect(ROAD_L+LANE_W+3,0,2,H,'#d9b66c');
if(level>1){const signY=((scroll*.4)%550+550)%550-60;rect(6,signY,36,21,'#c1ab79');text('CP '+level,24,signY+14,'#283027',10,'center')}
}
function spawn(){const occupied=new Set(traffic.filter(t=>t.y<135).map(t=>t.lane));const candidates=[0,1,2].filter(i=>!occupied.has(i));if(!candidates.length)return;
const lane=candidates[Math.floor(Math.random()*candidates.length)];const oncoming=lane===0,type=Math.random()<.17?'van':'car';
traffic.push({lane,x:laneX(lane),y:-72,type,oncoming,color:palette[Math.floor(Math.random()*palette.length)],passed:false,speed:oncoming?105:45+Math.random()*45,w:type==='van'?40:32,h:type==='van'?70:58})}
function overtake(t){if(t.passed)return;t.passed=true;score+=25;updateBest()}
function collisions(){if(invulnerable>0)return;for(const t of traffic){if(Math.abs(player.x-t.x)<(t.w+27)*.46&&Math.abs(player.y-t.y)<(t.h+55)*.43){crash();return}}}
function crash(){lives--;invulnerable=1.8;traffic=traffic.filter(t=>Math.abs(t.y-player.y)>125);if(lives<=0){state='over';message.textContent='END OF THE ROAD';sub.textContent='Distance '+Math.floor(meters)+' m · Score '+Math.floor(score);start.textContent='RACE AGAIN ▶';overlay.hidden=false;cancelAnimationFrame(raf)}updateBest()}
function draw(){background();for(const t of traffic)drawTraffic(t.x,t.y,t.color,t.oncoming,t.type);if(invulnerable<=0||Math.floor(clock*7)%2===0)drawJaguar(player.x,player.y);
rect(ROAD_L+12,8,105,19,'#131b1bc4');text(Math.floor(meters)+' m',ROAD_L+20,22,'#f5e5bb',12);
if(state==='playing'){rect(ROAD_R-99,8,87,19,'#131b1bc4');text(brake?'BRAKING':boost?'FULL THROTTLE':'CRUISING',ROAD_R-55,22,'#f5e5bb',9,'center')}}
function move(dir){if(state!=='playing')return;if(dir==='left')player.lane=Math.max(0,player.lane-1);if(dir==='right')player.lane=Math.min(2,player.lane+1);if(dir==='up'){boost=true;brake=false}if(dir==='down'){brake=true;boost=false}draw()}
function release(dir){if(dir==='up')boost=false;if(dir==='down')brake=false}
function step(ts){if(state!=='playing')return;const dt=Math.min(.04,Math.max(0,(ts-(last||ts))/1000));last=ts;clock+=dt;
const speed=(brake?65:boost?195:125)*(1+Math.min(.55,(level-1)*.08));scroll+=speed*dt;meters+=speed*dt*.13;score+=speed*dt*.035;
const newLevel=1+Math.floor(meters/450);if(newLevel>level){level=newLevel;score+=100;updateBest()}
player.x+=(laneX(player.lane)-player.x)*Math.min(1,dt*15);
spawnTimer-=dt;if(spawnTimer<=0){spawn();spawnTimer=Math.max(.57,1.35-(level-1)*.035)+Math.random()*.45}
for(const t of traffic){const relative=t.oncoming?speed+t.speed:Math.max(35,speed-t.speed);t.y+=relative*dt;if(!t.passed&&t.y>player.y+55)overtake(t)}
traffic=traffic.filter(t=>t.y<H+100);invulnerable=Math.max(0,invulnerable-dt);collisions();draw();hud();
if(state==='playing')raf=requestAnimationFrame(step)}
function begin(){cancelAnimationFrame(raf);state='playing';score=0;lives=3;level=1;meters=0;clock=0;scroll=0;last=0;spawnTimer=1.3;invulnerable=1.3;boost=false;brake=false;traffic=[];player={lane:1,x:laneX(1),y:346};overlay.hidden=true;hud();canvas.focus({preventScroll:true});draw();raf=requestAnimationFrame(step)}
start.addEventListener('click',begin);
const keyDirs={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',d:'right',w:'up',s:'down'};
const held=new Set();
document.addEventListener('keydown',e=>{const dir=keyDirs[e.key];if(!dir||state!=='playing')return;if(document.activeElement!==canvas&&!document.getElementById('garage-arcade').contains(document.activeElement))return;e.preventDefault();if(!held.has(dir)){move(dir);held.add(dir)}});
document.addEventListener('keyup',e=>{const dir=keyDirs[e.key];if(dir){held.delete(dir);release(dir)}});
document.querySelectorAll('#garage-arcade [data-drive]').forEach(button=>{
const dir=button.dataset.drive;
button.addEventListener('pointerdown',e=>{e.preventDefault();move(dir);if(dir==='up'||dir==='down')button.setPointerCapture(e.pointerId)});
button.addEventListener('pointerup',()=>release(dir));button.addEventListener('pointercancel',()=>release(dir));
button.addEventListener('click',e=>e.preventDefault());
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);last=0;boost=false;brake=false;held.clear()}else if(state==='playing'){last=0;raf=requestAnimationFrame(step)}});
window.addEventListener('blur',()=>{boost=false;brake=false;held.clear()});
hud();draw();
})();