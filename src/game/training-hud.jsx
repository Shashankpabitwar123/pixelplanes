import React,{useEffect,useRef} from 'react';
import {normalizeAngle} from './mechanics.js';
import {TRAINING_LESSONS} from './training.js';
export function TrainingHud({training,paused,onExit,onSolo,onPracticeBot,player}) {
  const {view:s,saved,menu}=training;
  const lesson=TRAINING_LESSONS[s.index];
  const modal=training.blocking;
  const panel=useRef(null);
  useEffect(()=>{
    if(!modal)return;
    const previous=document.activeElement;
    panel.current?.querySelector('button')?.focus();
    return ()=>previous?.isConnected&&previous.focus?.();
  },[modal,menu,s.index,s.status]);
  const keys=event=>{
    if(!modal)return;
    event.stopPropagation();
    if(event.key==='Tab') {
      const buttons=[...panel.current.querySelectorAll('button')].filter(b=>!b.disabled);
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    if(event.key==='Escape'&&menu) training.closeMenu();
  };
  const passed=Object.values(saved.results).filter(r=>r==='passed').length;
  let progress='',goal=lesson.goal;
  if(s.index===1)progress=`${s.left?'✓':'○'} Left turn   ${s.right?'✓':'○'} Right turn   ·   Steady ${Math.min(2,s.steady).toFixed(1)} / 2 s`;
  if(s.index===1&&s.left&&s.right&&player) {const offset=normalizeAngle(player.angle-16);goal=offset>12?'Tap A to lower the nose, then release steering.':offset < -12?'Tap D to raise the nose, then release steering.':'Hold this heading for 2 seconds. Keep W held.';}
  if(s.index===2){progress=s.landed?'Landing ✓ · Refuel next':'Land safely · Then refuel';if(s.landed)goal='Roll slowly to the marked fuel station.';}
  if(s.index===3){progress=`Hits ${Math.min(2,s.hits)} / 2 · ${s.refilled?'Refill ✓':s.empty?'Waiting for refill…':'Magazine practice'}`;if(s.hits>=2)goal=s.empty?'Wait for your seven bullets to refill.':'Hold SPACE to empty your remaining bullets.';}
  if(s.index===4)progress=`Hits ${Math.min(2,s.hits)} / 2`;
  if(s.index===5)progress=s.shots?'Rocket away · Retry if you miss':'Two rockets ready · Hold R to preview';
  if(s.index===6)progress=s.warningSeen?'Warning seen · Raise the nose':'Watch for the red pull-up warning';
  const free=s.status==='free';
  const destination=training.targetsRef.current.find(t=>t.active)?.state ?? training.setup.current.gate;
  const distance=destination&&player?Math.hypot(destination.x-player.x,destination.y-player.y):0;
  const direction=destination&&player?-Math.atan2(destination.y-player.y,destination.x-player.x)*180/Math.PI:0;
  return <div className={`academy-ui${modal?' academy-blocking':''}`}>
    <section ref={panel} className={`academy-card${modal?' academy-modal':''}`} role={modal?'dialog':'region'} aria-modal={modal||undefined} aria-label="Flight training" onKeyDown={keys}>
      <header><span>FLIGHT ACADEMY</span><span>{passed}/8 learned</span></header>
      {menu ? <>
        <h2>Choose a lesson</h2><p>Replay anything. Skipped lessons remain available.</p>
        <div className="academy-lessons">{TRAINING_LESSONS.map((l,i)=><button key={l.id} onClick={()=>training.prepare(i)}><b>{i+1}. {l.title}</b><span>{saved.results[l.id]==='passed'?'✓ Learned':saved.results[l.id]==='skipped'?'Skipped':'Practice'}</span></button>)}</div>
        <footer><button onClick={training.closeMenu}>Back</button><button onClick={onExit}>Main menu</button></footer>
      </> : s.status==='finished' ? <>
        <h2>{passed===8?'Ready for the skies':'Practice session finished'}</h2>
        <p>{passed} of 8 lessons learned. {8-passed>0?'You can revisit unfinished lessons any time.':'Your progress is saved on this browser.'}</p>
        <footer><button onClick={training.toggleMenu}>Review lessons</button><button onClick={training.free}>Free flight</button><button onClick={onPracticeBot}>Try one easy bot</button><button className="academy-primary" onClick={onSolo}>Play solo</button></footer>
      </> : <>
        <h2>{s.status==='success'?'✓ Lesson complete':s.status==='failed'?'Let’s try that again':free?'Free flight':lesson.title}</h2>
        <p className="academy-goal" aria-live="polite">{s.status==='failed'?s.hint:s.status==='success'?'Nice work. Your progress is saved.':free?'Practice freely, or choose a lesson whenever you want.':goal}</p>
        {!free&&!['success','failed'].includes(s.status)&&<>
          <div className="academy-key">{lesson.keys}</div>
          {!modal&&distance>20&&<div className="academy-direction"><i style={{transform:`rotate(${direction}deg)`}}>➜</i>Objective · {Math.round(distance)} units</div>}
          {progress&&<div className="academy-progress">{progress}</div>}
          {(modal||s.elapsed>12)&&<p className="academy-tip">{lesson.tip}</p>}
        </>}
        <footer>
          {s.status==='briefing'&&<button className="academy-primary" onClick={training.begin}>Begin lesson {s.index+1}</button>}
          {s.status==='success'&&<button className="academy-primary" onClick={training.next}>{s.index===7?'Finish training':'Next lesson'}</button>}
          {s.status==='failed'&&<button className="academy-primary" onClick={()=>training.prepare(s.index)}>Retry lesson</button>}
          {s.status==='active'&&<button onClick={()=>training.prepare(s.index)}>Retry</button>}
          {!free&&s.status!=='success'&&<button onClick={training.skip}>Skip</button>}
          <button onClick={training.toggleMenu}>Lessons</button>
          {free&&<button onClick={onSolo}>Play solo</button>}
          {modal&&<button onClick={onExit}>Main menu</button>}
        </footer>
        {!modal&&paused&&<p className="academy-tip">Paused — use the pause button to continue.</p>}
      </>}
    </section>
  </div>;
}
