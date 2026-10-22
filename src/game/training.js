import { createInitialPlaneState, normalizeAngle } from './mechanics.js';
import { groundImpactDanger } from './ground-warning.js';
export const TRAINING_STORAGE_KEY = 'pixelplanes-training-v2';
export const TRAINING_LESSONS = [
  {id:'takeoff',title:'Take off',goal:'Climb through the gold gate.',keys:'Hold W / ↑',tip:'Keep thrust held. The plane builds speed before lifting off.'},
  {id:'handling',title:'Control your plane',goal:'Turn both ways, then hold steady for 2 seconds.',keys:'A / D · W for thrust',tip:'Use short steering presses. Follow the nose guidance, then release the steering keys.'},
  {id:'landing',title:'Land & refuel',goal:'Land gently, then reach the marked fuel station.',keys:'S / ↓ to slow · A / D to level',tip:'Keep the wheels down. After landing, use short taps of W to roll toward the station.'},
  {id:'bullets',title:'Fire your bullets',goal:'Hit the target twice, then empty and refill your magazine.',keys:'Hold SPACE',tip:'Seven bullets per magazine. The automatic refill starts after your first shot.'},
  {id:'moving',title:'Lead a moving target',goal:'Hit the moving target twice.',keys:'A / D to aim · SPACE to fire',tip:'Green aiming dots predict a hit. Aim ahead of the target; its next turn can still make you miss.'},
  {id:'rockets',title:'Aim a rocket',goal:'Hold R to see brackets, then release to hit the target.',keys:'Hold R → release',tip:'Point toward the target first. Guidance lasts 1.3 seconds; a target can still dodge.'},
  {id:'recovery',title:'Pull up safely',goal:'Recover from the dive and hold a climb for half a second.',keys:'Hold W + D briefly, then level',tip:'The red warning means the ground is close. Raise the nose before it is too late.'},
  {id:'weather',title:'Navigate fog',goal:'Turn on your light and fly through the gold gate.',keys:'L for light · W to fly',tip:'Use the gate direction and minimap when fog hides the ground.'},
];
export function readTrainingSave(storage) {
  try {
    const data=JSON.parse(storage.getItem(TRAINING_STORAGE_KEY));
    return {index:Math.max(0,Math.min(7,Number.isInteger(data?.index)?data.index:0)),results:Object.fromEntries(TRAINING_LESSONS.map(l=>[l.id,['passed','skipped'].includes(data?.results?.[l.id])?data.results[l.id]:null]))};
  } catch {return {index:0,results:{}};}
}
export function trainingSetup(index) {
  let spawn={...createInitialPlaneState(350,60)};
  if(index>0) spawn={...spawn,x:350,y:55,angle:16,vx:-30,vy:0,thrust:.8,throttle:.8,airborne:true,hasLifted:true};
  if(index===2) spawn={...spawn,x:307,y:4,angle:14,vx:-10,vy:-3,thrust:0,throttle:0,fuel:20};
  if([3,4,5].includes(index)) spawn={...spawn,angle:0,vx:-23,thrust:.45,throttle:.45};
  if(index===6) spawn={...spawn,y:28,angle:-35,vx:-30,vy:-24,thrust:1,throttle:1};
  if(index===7) spawn={...spawn,y:18,angle:12,vx:-24};
  const gate=index===0?{x:285,y:18}:index===2?{x:288,y:3}:index===7?{x:315,y:24}:null;
  const targets=[3,4,5].includes(index)?[{
    id:`lesson-${index}-target`,targetType:index===3?'static':index===5?'rocket':'moving',weapon:index===5?'rocket':'bullet',
    label:index===5?'ROCKET':'HITS 0 / 2',x:318,y:55,angle:0,radius:1.26,active:true,hit:false,hits:0,
    motion:index===4||index===5?{x:6,y:5,speed:.7,phase:0}:null,
    state:{x:318,y:55,angle:0,vx:0,vy:0,hasLifted:true,crashed:false,hitRadius:1.26},
  }]:[];
  return {spawn,gate,targets};
}
export function createTrainingSession(index=0) {
  return {index,status:'briefing',elapsed:0,left:false,right:false,steady:0,landed:false,hits:0,shots:0,empty:false,refilled:false,warningSeen:false,recovered:0,hint:'',lastTime:null};
}
export function assessTraining(session,plane,dt,gate) {
  if(session.status!=='active') return session;
  const s={...session,elapsed:session.elapsed+dt};
  if(plane.crashed) return {...s,status:'failed',hint:session.index===2?'Touch down more gently: slow earlier and keep the wheels below the nose.':'Your plane crashed. Retry starts this exercise again with fresh fuel and ammo.'};
  const atGate=gate && Math.hypot(plane.x-gate.x,plane.y-gate.y)<8;
  if(s.index===0 && plane.hasLifted && plane.y>=8 && atGate) s.status='success';
  if(s.index===1) {
    const angle=normalizeAngle(plane.angle-16);
    if(plane.hasLifted && plane.y>8) {
      s.left ||= angle < -22; s.right ||= angle > 22;
      s.steady=s.left&&s.right&&Math.abs(angle)<12&&Math.abs(plane.turnRate ?? 0)<8?s.steady+dt:0;
      if(s.steady>=2) s.status='success';
    } else s.steady=0;
  }
  if(s.index===6) {
    s.warningSeen ||= groundImpactDanger(plane);
    s.recovered=s.warningSeen&&plane.vy>=0&&plane.y>5?s.recovered+dt:0;
    if(s.recovered>=.5) s.status='success';
  }
  if(s.index===7&&plane.searchLightOn&&atGate) s.status='success';
  if(s.index===3&&s.hits>=2&&s.refilled) s.status='success';
  return s;
}
export function trainingEvent(session,type,data={}) {
  if(session.status!=='active') return session;
  const s={...session};
  if(type==='land'&&s.index===2) s.landed=true;
  if(type==='refuel'&&s.index===2&&s.landed) s.status='success';
  if(type==='shot') s.shots++;
  if(type==='ammo'&&s.index===3) {s.empty ||= data.count===0; s.refilled ||= s.empty&&data.count===7&&!data.reloading;}
  if(type==='hit') s.hits++;
  if(s.index===3&&s.hits>=2&&s.refilled) s.status='success';
  if(s.index===4&&s.hits>=2 || s.index===5&&s.hits>=1) s.status='success';
  return s;
}
export function moveTrainingTargets(targets,seconds) {
  targets.forEach(t=>{
    if(!t.active||!t.motion) return;
    const m=t.motion,p=seconds*m.speed+m.phase;
    t.state.x=t.x+Math.sin(p)*m.x; t.state.y=t.y+Math.sin(p*1.18)*m.y;
    t.state.vx=Math.cos(p)*m.x*m.speed; t.state.vy=Math.cos(p*1.18)*m.y*m.speed*1.18;
  });
}
