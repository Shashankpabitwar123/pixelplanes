import {useCallback,useRef,useState} from 'react';
import {TRAINING_LESSONS,TRAINING_STORAGE_KEY,readTrainingSave,trainingSetup,createTrainingSession,assessTraining,trainingEvent} from './training.js';
export function useTraining({setPaused,paused,playerStateRef}) {
  const [saved,setSaved]=useState(()=>{try{return readTrainingSave(window.localStorage);}catch{return {index:0,results:{}};}});
  const savedRef=useRef(saved);
  const pausedRef=useRef(paused);pausedRef.current=paused;
  const session=useRef(createTrainingSession(saved.index));
  const [view,setView]=useState(session.current);
  const [attempt,setAttempt]=useState(0);
  const setup=useRef(trainingSetup(saved.index));
  const targetsRef=useRef(setup.current.targets);
  const [menu,setMenu]=useState(false);
  const publish=useCallback(next=>{
    const before=session.current;
    session.current=next;
    if(next.status==='success'&&before.status!=='success') {
      const save={index:Math.min(7,next.index+1),results:{...savedRef.current.results,[TRAINING_LESSONS[next.index].id]:'passed'}};
      savedRef.current=save; setSaved(save);
      try{window.localStorage.setItem(TRAINING_STORAGE_KEY,JSON.stringify(save));}catch{}
      setPaused(true);
    }
    if(next.status==='failed') setPaused(true);
    if(next.status!==before.status||Math.floor(next.elapsed*5)!==Math.floor(before.elapsed*5)||next.hits!==before.hits||next.landed!==before.landed||next.refilled!==before.refilled||next.empty!==before.empty||next.shots!==before.shots) setView({...next});
  },[setPaused]);
  const prepare=useCallback(index=>{
    const i=Math.max(0,Math.min(7,index));
    session.current=createTrainingSession(i); setup.current=trainingSetup(i); targetsRef.current=setup.current.targets;
    playerStateRef.current={...setup.current.spawn}; setView({...session.current}); setAttempt(a=>a+1); setMenu(false); setPaused(true);
    const save={...savedRef.current,index:i};savedRef.current=save;setSaved(save);
    try{window.localStorage.setItem(TRAINING_STORAGE_KEY,JSON.stringify(save));}catch{}
  },[setPaused,playerStateRef]);
  const observe=useCallback(plane=>{
    const s=session.current;if(s.status!=='active')return;
    const now=performance.now(),dt=s.lastTime===null?0:Math.min(.1,(now-s.lastTime)/1000);
    publish(assessTraining({...s,lastTime:now},plane,dt,setup.current.gate));
  },[publish]);
  const event=useCallback((type,data)=>{
    const next=trainingEvent(session.current,type,data);
    publish(pausedRef.current&&next.status==='success'?{...next,status:'active'}:next);
  },[publish]);
  const hit=useCallback((id,weapon)=>{
    const t=targetsRef.current.find(t=>t.id===id&&t.active&&t.weapon===weapon);
    if(!t||session.current.status!=='active')return;
    t.hits++;t.label=`HITS ${t.hits} / 2`;t.flashUntil=performance.now()+120;
    if(weapon==='rocket'||t.hits>=2){t.active=false;t.hit=true;t.state.crashed=true;}
    event('hit');
  },[event]);
  const begin=()=>{session.current={...session.current,status:'active',lastTime:null};setView({...session.current});setPaused(false);};
  const next=()=>{
    if(session.current.index<7)prepare(session.current.index+1);
    else {session.current={...session.current,status:'finished'};setView({...session.current});setPaused(true);}
  };
  const skip=()=>{
    const id=TRAINING_LESSONS[session.current.index].id;
    const save={index:Math.min(7,session.current.index+1),results:{...savedRef.current.results,[id]:savedRef.current.results[id]==='passed'?'passed':'skipped'}};
    savedRef.current=save;setSaved(save);try{window.localStorage.setItem(TRAINING_STORAGE_KEY,JSON.stringify(save));}catch{}
    next();
  };
  const free=()=>{setup.current=trainingSetup(0);playerStateRef.current={...setup.current.spawn};setAttempt(a=>a+1);targetsRef.current=[];session.current={...session.current,status:'free'};setView({...session.current});setMenu(false);setPaused(false);};
  const toggleMenu=()=>{setMenu(v=>!v);setPaused(true);};
  const closeMenu=()=>{setMenu(false);setPaused(!['active','free'].includes(session.current.status));session.current.lastTime=null;};
  return {view,session,setup,targetsRef,attempt,saved,menu,prepare,observe,event,hit,begin,next,skip,free,toggleMenu,closeMenu,resume:()=>{prepare(savedRef.current.index);if(TRAINING_LESSONS.every(l=>savedRef.current.results[l.id]==='passed')){session.current={...session.current,status:'finished'};setView({...session.current});}},reset:()=>{session.current=createTrainingSession();setView({...session.current});targetsRef.current=[];setMenu(false);},blocking:menu||!['active','free'].includes(view.status)};
}
