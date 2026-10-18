import { useEffect } from 'react';
import TownCanvas from './town';
import Hud from './ui';
import { connectRun, useStore } from './data/store';
import { isPublicDemo } from './data/siteUrl';
import { useDemoTour } from './demo/DemoTour';

export default function App() {
  const publicDemo=isPublicDemo();
  const tour=useDemoTour(publicDemo);
  const debug=new URLSearchParams(location.search).has('debug');
  const hudOnly=new URLSearchParams(location.search).get('hud-only')==='1';
  const state=useStore(s=>s.state);
  useEffect(()=>{
    if(publicDemo)return;
    const params=new URLSearchParams(location.search);
    if(params.has('replay'))useStore.getState().openReplay(params.get('replay')!,Number(params.get('speed'))||1);
    else if(params.has('run'))void connectRun(params.get('run')!).catch(error=>useStore.setState({error:String(error)}));
  },[]);
  return <main className="app-shell">{!hudOnly&&<TownCanvas/>}<Hud publicDemo={publicDemo} guided={tour.guided} demoCue={tour.chapter} demoControls={tour.controls} onDemoRestart={tour.restart}/>{tour.intro}{debug&&<details className="debug-panel" style={{position:'fixed',bottom:110,right:16,maxWidth:480,maxHeight:'45vh',overflow:'auto',zIndex:90,background:'#F6EFE1',color:'#1D1A2B',padding:12,borderRadius:8}}><summary>Reducer state · seq {state.lastSeq}</summary><pre style={{fontSize:11,whiteSpace:'pre-wrap'}}>{JSON.stringify(state,null,2)}</pre></details>}</main>;
}
