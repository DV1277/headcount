import { EventEnvelopeSchema, type EventEnvelope } from '@hc/contracts';
export class LiveSource {
  private source:EventSource|null=null;
  private retry:ReturnType<typeof setTimeout>|null=null;
  private closed=false;
  private lastSeq:number;
  private lastTime=0;
  constructor(private readonly runId:string,seq:number,private readonly onEvent:(e:EventEnvelope)=>void,private readonly onConnection:(s:'open'|'reconnecting'|'offline')=>void,private readonly catchup?:()=>Promise<{seq:number;t:number}>,initialTime=0) {this.lastSeq=seq;this.lastTime=initialTime;}
  connect():void {
    if(this.closed||this.source)return;
    const source=new EventSource(`/api/runs/${encodeURIComponent(this.runId)}/events?from=${this.lastSeq}`);
    this.source=source;
    source.onopen=()=>{if(this.source===source)this.onConnection('open');};
    source.onerror=()=>{if(this.source===source)this.reconnect();};
    source.addEventListener('town',event=>{
      if(this.source!==source)return;
      let value:unknown;
      try {value=JSON.parse((event as MessageEvent<string>).data);}catch{this.fail();return;}
      const parsed=EventEnvelopeSchema.safeParse(value);
      if(!parsed.success){this.fail();return;}
      const envelope=parsed.data;
      if(envelope.runId!==this.runId){this.fail();return;}
      if(envelope.seq<=this.lastSeq)return;
      if(envelope.seq!==this.lastSeq+1){this.reconnect();return;}
      if(envelope.t<this.lastTime){this.fail();return;}
      this.lastSeq=envelope.seq;this.lastTime=envelope.t;this.onEvent(envelope);
    });
  }
  private fail():void {this.onConnection('offline');this.close();}
  private reconnect():void {
    this.source?.close();this.source=null;this.onConnection('reconnecting');
    if(this.retry!==null||this.closed)return;
    this.retry=setTimeout(()=>{
      this.retry=null;
      void (async()=>{
        try {
          const head=await this.catchup?.();
          if(this.closed)return;
          if(head!==undefined){this.lastSeq=head.seq;this.lastTime=head.t;}
          this.connect();
        }catch{if(!this.closed)this.reconnect();}
      })();
    },1000);
  }
  close():void {this.closed=true;this.source?.close();this.source=null;if(this.retry!==null)clearTimeout(this.retry);this.retry=null;}
}
