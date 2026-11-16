import Phaser from 'phaser';
import './style.css';

type Mode = 'side' | 'top';
type TargetId = 'leak' | 'valve' | 'airlock' | 'recorder' | 'power' | 'scanner' | 'relay';
type Rect = { x:number; y:number; w:number; h:number };
type ActionTarget = { id:TargetId; x:number; y:number; label:string; duration:number };

class Campaign extends Phaser.Scene {
  mode:Mode = 'side';
  x = 120;
  jumpY = 0;
  vx = 0;
  vy = 0;
  grounded = true;
  face = 1;
  phase = 0;
  stage = 0;
  keys!:Record<string,Phaser.Input.Keyboard.Key>;
  player!:Phaser.GameObjects.Container;
  sideRig!:Phaser.GameObjects.Container;
  topRig!:Phaser.GameObjects.Container;
  sideTorso!:Phaser.GameObjects.Container;
  sideLegs:Phaser.GameObjects.Graphics[] = [];
  sideArms!:Phaser.GameObjects.Graphics;
  topLegs:Phaser.GameObjects.Ellipse[] = [];
  topArms:Phaser.GameObjects.Ellipse[] = [];
  g!:Phaser.GameObjects.Graphics;
  top = { x:170, y:850 };
  topV = { x:0, y:0 };
  topFacing = new Phaser.Math.Vector2(0,-1);
  topObstacles:Rect[] = [];
  useHeld = false;
  useProgress = 0;
  useTargetId = '';
  leakFound = false;
  valveIsolated = false;
  airlockEntered = false;
  recorderRecovered = false;
  powerRestored = false;
  scanComplete = false;
  relayAccessed = false;
  align = 0;
  alignReady = false;
  transmitted = false;
  beam?:Phaser.GameObjects.Graphics;

  constructor(){ super('campaign'); }

  create(){
    this.g = this.add.graphics();
    this.drawWorld();
    this.player = this.add.container(this.x,590);
    this.buildAstronaut();
    this.setRigVisibility();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,SHIFT,E,ENTER,LEFT,RIGHT,UP,DOWN') as Record<string,Phaser.Input.Keyboard.Key>;
    this.cameras.main.setBounds(0,0,1800,900);
    this.cameras.main.startFollow(this.player,true,.10,.10);
    this.input.keyboard!.on('keydown-ENTER',()=>{ if(this.alignReady && !this.transmitted) this.transmit(); });
    this.events.on('destroy',()=>{ this.useHeld=false; });
    for(let i=0;i<44;i++){
      const p=this.add.circle(Phaser.Math.Between(0,1800),Phaser.Math.Between(30,560),Phaser.Math.Between(1,2),0xc3e1df,.18);
      this.tweens.add({targets:p,x:p.x+Phaser.Math.Between(-70,70),y:p.y-Phaser.Math.Between(20,90),alpha:.02,duration:Phaser.Math.Between(3500,7500),yoyo:true,repeat:-1});
    }
    this.updateHud();
    this.cameras.main.fadeIn(850,2,8,13);
  }

  buildAstronaut(){
    this.player.add(this.add.ellipse(0,3,40,10,0x02070a,.55));

    this.sideRig=this.add.container(0,0);
    this.sideRig.add(this.add.rectangle(-14,-40,15,35,0x415b64).setStrokeStyle(2,0x91a8aa));
    this.sideTorso=this.add.container(0,-44);
    this.sideTorso.add([
      this.add.rectangle(0,0,28,41,0xc6d2ce).setStrokeStyle(2,0x667f83),
      this.add.rectangle(0,0,16,20,0x243e49),
      this.add.rectangle(0,-8,7,4,0xd6a66c),
      this.add.rectangle(-17,1,5,18,0x8b9fa0),
    ]);
    this.sideRig.add(this.sideTorso);
    this.sideRig.add(this.add.circle(0,-76,14,0xcbd6d1).setStrokeStyle(2,0x718b90));
    this.sideRig.add(this.add.ellipse(3,-77,21,15,0x143541).setStrokeStyle(1,0x9bdde4));
    for(let i=0;i<2;i++){
      const leg=this.add.graphics();
      this.sideLegs.push(leg);
      this.sideRig.add(leg);
    }
    this.sideArms=this.add.graphics();
    this.sideRig.add(this.sideArms);

    this.topRig=this.add.container(0,0);
    this.topRig.add(this.add.ellipse(0,15,38,20,0x02070a,.5));
    this.topRig.add(this.add.rectangle(0,10,22,25,0x415b64).setStrokeStyle(2,0x91a8aa));
    const leftLeg=this.add.ellipse(-7,18,9,17,0xabbcba).setStrokeStyle(1,0x647d82);
    const rightLeg=this.add.ellipse(7,18,9,17,0xabbcba).setStrokeStyle(1,0x647d82);
    this.topLegs=[leftLeg,rightLeg];
    this.topRig.add(this.topLegs);
    const leftArm=this.add.ellipse(-14,2,8,20,0xc6d2ce).setStrokeStyle(1,0x718b90);
    const rightArm=this.add.ellipse(14,2,8,20,0xc6d2ce).setStrokeStyle(1,0x718b90);
    this.topArms=[leftArm,rightArm];
    this.topRig.add(this.topArms);
    this.topRig.add(this.add.ellipse(0,1,23,28,0xc6d2ce).setStrokeStyle(2,0x667f83));
    this.topRig.add(this.add.ellipse(0,-12,21,21,0xcbd6d1).setStrokeStyle(2,0x718b90));
    this.topRig.add(this.add.ellipse(0,-15,16,9,0x143541).setStrokeStyle(1,0x9bdde4));
    this.topRig.add(this.add.rectangle(0,8,9,5,0xd6a66c));
    this.player.add([this.sideRig,this.topRig]);
  }

  setRigVisibility(){
    if(this.sideRig) this.sideRig.setVisible(this.mode==='side');
    if(this.topRig) this.topRig.setVisible(this.mode==='top');
  }

  drawWorld(){
    const g=this.g;
    g.clear();
    if(this.mode==='side'){
      g.fillGradientStyle(0x081522,0x081522,0x263c49,0x263c49,1);
      g.fillRect(0,0,1800,900);
      g.fillStyle(0xd7c6a5,.9); g.fillCircle(1390,175,43);
      for(let i=0;i<5;i++){
        g.fillStyle([0x354956,0x2b3e49,0x263b45,0x22343f,0x1c2b35][i],1);
        g.fillEllipse(500+i*145,430+i*37,2050,180);
      }
      g.fillStyle(0x62584c,1); g.fillRect(0,590,1800,310);
      g.lineStyle(3,0x9a8870,.8); g.lineBetween(0,590,1800,590);
      for(let i=0;i<18;i++){
        g.lineStyle(1,0xa58e73,.13);
        g.lineBetween(i*110,610,i*110+70,900);
      }

      // Damaged lander and repair zone
      g.fillStyle(0x9eafb0,1); g.fillRoundedRect(690,470,190,115,12);
      g.fillStyle(0x183946,1); g.fillRect(718,490,52,28);
      g.fillStyle(0xd6a66c,1); g.fillRect(790,488,7,12);
      g.fillStyle(0x293f48,1); g.fillRect(1070,492,95,98);
      g.fillStyle(0x92e0e6,1); g.fillRect(1082,510,70,4);
      g.lineStyle(4,0x9bdde4,.85); g.strokeEllipse(1450,470,110,165);
      g.lineStyle(2,0xd6a66c,.9); g.strokeEllipse(1450,470,72,125);
      g.fillStyle(0x294650,1); g.fillRect(1640,380,24,210);
      g.lineStyle(4,0xb8c8c6,.9);
      g.lineBetween(1652,380,1585,445); g.lineBetween(1652,380,1718,445); g.lineBetween(1585,445,1718,445);

      // Leak hose and valve, positioned along the player's route
      g.lineStyle(8,0x202d33,1); g.lineBetween(260,558,365,558);
      g.lineStyle(3,0xd6a66c,1); g.lineBetween(260,558,365,558);
      g.fillStyle(0x8de3e9,.8); g.fillCircle(314,558,5);
      g.fillStyle(0x2d424b,1); g.fillRoundedRect(470,530,58,40,7);
      g.lineStyle(4,0xd6a66c,1); g.strokeCircle(499,548,15);
      g.lineBetween(499,533,499,563);
      g.fillStyle(0x163642,1); g.fillRoundedRect(770,467,74,123,8);
      g.lineStyle(3,0x91d9dd,1); g.strokeRoundedRect(770,467,74,123,8);
      g.fillStyle(0xd6a66c,1); g.fillRect(797,480,20,4);
      g.fillStyle(0x8de3e9,.1); g.fillEllipse(314,558,100,46);
      g.fillStyle(0xd6a66c,.11); g.fillEllipse(499,548,100,50);
      g.fillStyle(0x8de3e9,.12); g.fillEllipse(807,540,120,160);
      for(let i=0;i<8;i++){
        g.fillStyle(0x354b54,1); g.fillRoundedRect(120+i*210,510-(i%2)*25,56,78,5);
      }
      g.fillStyle(0x8de3e9,.7); g.fillCircle(807,480,4);
    }else{
      this.drawInterior(g);
    }
  }

  drawInterior(g:Phaser.GameObjects.Graphics){
    g.fillGradientStyle(0x091a23,0x091a23,0x172e39,0x172e39,1);
    g.fillRect(0,0,1800,1100);
    // Modular deck plating
    for(let x=90;x<1710;x+=80){
      for(let y=90;y<1010;y+=80){
        g.fillStyle(((x/80+y/80)%2===0)?0x1c3540:0x192f39,.78);
        g.fillRect(x,y,76,76);
        g.lineStyle(1,0x6b9299,.12); g.strokeRect(x,y,76,76);
      }
    }
    g.fillStyle(0x263f49,1); g.fillRoundedRect(65,65,1670,970,26);
    g.fillStyle(0x10242d,1); g.fillRoundedRect(82,82,1636,936,18);
    for(let x=110;x<1700;x+=160){
      g.fillStyle(0x314d58,.7); g.fillRect(x,90,5,920);
      g.fillStyle(0x8de3e9,.35); g.fillRect(x+7,90,2,920);
    }
    // Bulkheads, open doorways and floor routes: decoration only, not teleport points
    g.lineStyle(5,0x54727c,.55);
    g.lineBetween(570,120,570,420); g.lineBetween(570,520,570,960);
    g.lineBetween(1160,120,1160,360); g.lineBetween(1160,470,1160,960);
    g.lineBetween(590,625,820,625); g.lineBetween(1010,625,1140,625);
    g.lineBetween(1190,625,1430,625); g.lineBetween(1530,625,1690,625);
    g.lineStyle(2,0x8de3e9,.18);
    g.lineBetween(90,555,1710,555); g.lineBetween(90,565,1710,565);
    // Emergency lighting
    for(const [lx,ly] of [[180,130],[600,130],[1020,130],[1600,130],[180,970],[820,970],[1500,970]] as number[][]){
      g.fillStyle(0x8de3e9,.11); g.fillEllipse(lx,ly,100,34);
      g.fillStyle(0x8de3e9,.8); g.fillRoundedRect(lx-24,ly-3,48,6,3);
    }
    // Workstations and storage collision blocks
    this.topObstacles=[
      {x:205,y:145,w:270,h:72},
      {x:715,y:125,w:280,h:72},
      {x:990,y:360,w:270,h:72},
      {x:1335,y:700,w:300,h:72},
      {x:575,y:785,w:92,h:104},
      {x:720,y:820,w:130,h:74},
      {x:1220,y:870,w:150,h:70},
      {x:1540,y:350,w:100,h:110}
    ];
    this.topObstacles.forEach((r,i)=>{
      g.fillStyle(0x0a151c,.8); g.fillRoundedRect(r.x+7,r.y+9,r.w,r.h,8);
      g.fillStyle(i%2===0?0x354d57:0x2a424c,1); g.fillRoundedRect(r.x,r.y,r.w,r.h,8);
      g.lineStyle(2,0x78949b,.55); g.strokeRoundedRect(r.x,r.y,r.w,r.h,8);
      g.fillStyle(0x8de3e9,.65); g.fillRect(r.x+18,r.y+12,r.w-36,3);
      for(let n=0;n<Math.floor(r.w/34);n++){
        g.fillStyle(0x82979b,.45); g.fillRect(r.x+14+n*30,r.y+r.h-13,18,3);
      }
    });
    this.drawTerminal(g,340,270,0xd6a66c);
    this.drawTerminal(g,855,255,0x8de3e9);
    this.drawTerminal(g,1125,485,0x8de3e9);
    this.drawTerminal(g,1485,825,0xd6a66c);
    // Airlock marker and deck markings
    g.lineStyle(4,0xd6a66c,.75); g.strokeCircle(170,850,46);
    g.lineStyle(2,0x8de3e9,.55); g.strokeCircle(170,850,34);
    g.fillStyle(0x8de3e9,.55); g.fillCircle(170,850,5);
    g.lineStyle(2,0x8de3e9,.24);
    g.lineBetween(170,650,170,800); g.lineBetween(170,900,170,980);
    g.lineBetween(470,270,680,270); g.lineBetween(985,255,1085,255);
    g.lineBetween(1255,485,1400,485);
  }

  drawTerminal(g:Phaser.GameObjects.Graphics,x:number,y:number,accent:number){
    g.fillStyle(0x07131a,.9); g.fillRoundedRect(x-34,y-28,68,56,8);
    g.fillStyle(0x29434d,1); g.fillRoundedRect(x-30,y-24,60,48,6);
    g.lineStyle(2,accent,.9); g.strokeRoundedRect(x-30,y-24,60,48,6);
    g.fillStyle(accent,.16); g.fillRoundedRect(x-20,y-15,40,22,3);
    g.fillStyle(accent,.9); g.fillRect(x-15,y-9,30,3);
    g.fillStyle(0x9bb2b6,.7); g.fillCircle(x-12,y+15,2); g.fillCircle(x,y+15,2); g.fillCircle(x+12,y+15,2);
  }

  updateHud(){
    const objectives=[
      ['TRACE THE DAMAGE','Find the ruptured fuel line and stabilise the lander.'],
      ['ISOLATE THE LINE','Secure the pressure valve before the fuel system fails.'],
      ['REACH THE AIRLOCK','Cross the surface and enter the station manually.'],
      ['RECOVER THE FLIGHT LOG','Search the crew module for the recorder.'],
      ['RESTORE AUXILIARY POWER','Route station power back to the science systems.'],
      ['CALIBRATE THE GRAVITY ARRAY','Capture the anomalous time-shift signature.'],
      ['ACCESS THE ORBITAL RELAY','Reach the relay console and establish a carrier lock.'],
      ['TRANSMIT THE WARNING','Hold the carrier inside the target band, then transmit.'],
      ['THE SIGNAL WAS YOURS','The reply arrived six years before transmission.']
    ];
    const current=objectives[Math.min(this.stage,objectives.length-1)];
    document.querySelector('#objective')!.textContent=current[0];
    document.querySelector('#detail')!.textContent=current[1];
    const tasks=[
      ['Locate the ruptured fuel line',this.leakFound],
      ['Isolate the pressure valve',this.valveIsolated],
      ['Enter the station airlock',this.airlockEntered],
      ['Recover the flight recorder',this.recorderRecovered],
      ['Restore auxiliary power',this.powerRestored],
      ['Record the gravity signature',this.scanComplete],
      ['Lock the orbital carrier',this.alignReady],
      ['Transmit the warning',this.transmitted]
    ];
    document.querySelector('#tasks')!.innerHTML=tasks.map(t=>'<div class="'+(t[1]?'done':'')+'">'+t[0]+'</div>').join('');
    document.querySelector('#mode')!.textContent=this.mode==='side'?'SURFACE // EXTERIOR':'HABITAT DECK // INTERIOR';
  }

  toast(message:string){
    const el=document.querySelector('#toast') as HTMLElement;
    el.textContent=message;
    el.style.opacity='1';
    el.style.transform='translate(-50%,-50%) scale(1)';
    this.time.delayedCall(1900,()=>{el.style.opacity='0';el.style.transform='translate(-50%,-44%) scale(.98)'});
  }

  prompt(message:string){
    const el=document.querySelector('#prompt') as HTMLElement;
    el.textContent=message;
    el.style.display=message?'block':'none';
  }

  animateAction(){
    this.topV.x=0; this.topV.y=0; this.vx=0;
    if(this.mode==='side'){
      this.tweens.killTweensOf(this.sideTorso);
      this.tweens.add({targets:this.sideTorso,angle:-24,y:-39,duration:170,ease:'Sine.easeOut',yoyo:true,hold:420,repeat:1});
      this.tweens.add({targets:this.player,scaleY:.92,duration:140,yoyo:true,repeat:2,ease:'Sine.easeInOut'});
    }else{
      this.tweens.add({targets:this.topRig,scaleX:.88,scaleY:1.08,duration:160,yoyo:true,repeat:2,ease:'Sine.easeInOut'});
    }
    for(let i=0;i<7;i++){
      const p=this.add.circle(this.player.x+Phaser.Math.Between(-18,18),this.player.y+Phaser.Math.Between(-26,5),Phaser.Math.Between(2,4),i%2?0x8dfaff:0xd6a66c,.95).setDepth(30);
      this.tweens.add({targets:p,x:p.x+Phaser.Math.Between(-38,38),y:p.y-Phaser.Math.Between(25,65),alpha:0,scale:.1,duration:450+Math.random()*250,onComplete:()=>p.destroy()});
    }
  }

  transitionMode(next:Mode,x:number,y:number){
    this.useProgress=0; this.useTargetId=''; this.useHeld=false;
    this.cameras.main.fadeOut(360,2,8,13);
    this.time.delayedCall(370,()=>{
      this.mode=next;
      if(next==='top'){
        this.top={x,y}; this.topV={x:0,y:0}; this.player.setPosition(x,y);
        this.cameras.main.stopFollow();
        this.cameras.main.setBounds(0,0,1800,1100);
        this.drawWorld(); this.setRigVisibility(); this.updateHud();
        this.cameras.main.setZoom(1.08);
        this.cameras.main.startFollow(this.player,true,.12,.12);
        this.cameras.main.setDeadzone(120,80);
      }else{
        this.x=x; this.jumpY=0; this.vx=0; this.vy=0; this.player.setPosition(x,590);
        this.cameras.main.stopFollow();
        this.cameras.main.setBounds(0,0,1800,900);
        this.drawWorld(); this.setRigVisibility(); this.updateHud();
        this.cameras.main.setZoom(1.04);
        this.cameras.main.startFollow(this.player,true,.10,.10);
        this.cameras.main.setDeadzone(150,90);
      }
      this.cameras.main.fadeIn(620,2,8,13);
      this.cameras.main.shake(170,.0018);
    });
  }

  currentTarget():ActionTarget|null{
    if(this.mode==='side'){
      if(this.stage===0 && Math.abs(this.x-314)<70) return {id:'leak',x:314,y:558,label:'SCAN THE FUEL RUPTURE',duration:1.0};
      if(this.stage===1 && Math.abs(this.x-499)<72) return {id:'valve',x:499,y:558,label:'ISOLATE PRESSURE VALVE',duration:1.5};
      if(this.stage===2 && Math.abs(this.x-807)<78) return {id:'airlock',x:807,y:558,label:'CYCLE THE AIRLOCK',duration:.65};
      return null;
    }
    const targets:ActionTarget[]=[];
    if(this.stage===3) targets.push({id:'recorder',x:855,y:300,label:'RECOVER FLIGHT RECORDER',duration:1.25});
    if(this.stage===4) targets.push({id:'power',x:340,y:330,label:'ROUTE AUXILIARY POWER',duration:1.5});
    if(this.stage===5) targets.push({id:'scanner',x:1125,y:550,label:'CALIBRATE GRAVITY ARRAY',duration:1.8});
    if(this.stage===6) targets.push({id:'relay',x:1485,y:805,label:'ACCESS ORBITAL RELAY',duration:1.1});
    let nearest:ActionTarget|null=null;
    let best=Infinity;
    targets.forEach(t=>{
      const d=Phaser.Math.Distance.Between(this.top.x,this.top.y,t.x,t.y);
      if(d<76 && d<best){best=d;nearest=t;}
    });
    return nearest;
  }

  completeTarget(id:TargetId){
    this.useProgress=0; this.useTargetId=''; this.useHeld=false;
    this.animateAction();
    switch(id){
      case 'leak':
        this.leakFound=true; this.stage=1;
        this.toast('RUPTURE CONFIRMED // PRESSURE FALLING');
        this.cameras.main.flash(180,90,220,225);
        break;
      case 'valve':
        this.valveIsolated=true; this.stage=2;
        this.toast('VALVE CLOSED // FUEL SYSTEM STABLE');
        this.cameras.main.shake(260,.0025);
        break;
      case 'airlock':
        this.airlockEntered=true; this.stage=3;
        this.toast('AIRLOCK SEALED // ENTERING HABITAT');
        this.time.delayedCall(520,()=>this.transitionMode('top',170,850));
        break;
      case 'recorder':
        this.recorderRecovered=true; this.stage=4;
        this.toast('FLIGHT RECORDER RECOVERED');
        this.cameras.main.flash(240,90,220,225);
        this.showSubtitle('RECORDER // LAST ENTRY: “WE HEARD THE TRANSMISSION BEFORE IT HAPPENED.”');
        break;
      case 'power':
        this.powerRestored=true; this.stage=5;
        this.toast('AUXILIARY POWER ONLINE');
        this.cameras.main.shake(300,.003);
        this.showSubtitle('SYSTEM // GRAVITY ARRAY IS RECEIVING POWER.');
        break;
      case 'scanner':
        this.scanComplete=true; this.stage=6;
        this.toast('ANOMALOUS TIME-SHIFT RECORDED');
        this.cameras.main.flash(420,70,220,230);
        this.showSubtitle('SCANNER // THE SIGNAL ORIGIN IS INSIDE THE EVENT HORIZON.');
        break;
      case 'relay':
        this.relayAccessed=true; this.stage=7;
        this.startAlignment();
        break;
    }
    this.updateHud();
  }

  showSubtitle(message:string){
    const el=document.querySelector('#subtitle') as HTMLElement;
    el.textContent=message; el.style.display='block';
    this.time.delayedCall(3300,()=>{el.style.display='none'});
  }

  startAlignment(){
    this.align=0; this.alignReady=false;
    const el=document.querySelector('#signal') as HTMLElement;
    el.style.display='block';
    el.textContent='CARRIER PHASE  //  HOLD RIGHT TO TUNE  //  LEFT TO CORRECT';
    this.toast('ORBITAL RELAY LINK ESTABLISHED');
  }

  transmit(){
    if(!this.alignReady||this.transmitted)return;
    this.transmitted=true; this.stage=8;
    this.cameras.main.fadeOut(180,5,16,23);
    this.time.delayedCall(190,()=>this.cameras.main.fadeIn(500,5,16,23));
    this.beam=this.add.graphics().setDepth(20);
    const pulse=this.add.circle(1485,805,9,0x8dfaff,.95).setDepth(21);
    this.tweens.add({targets:pulse,y:-120,scale:6,alpha:0,duration:2400,ease:'Cubic.easeIn',onComplete:()=>pulse.destroy()});
    for(let i=0;i<24;i++){
      const p=this.add.circle(1485+Phaser.Math.Between(-24,24),790,Phaser.Math.Between(2,5),0x8dfaff,.95).setDepth(21);
      this.tweens.add({targets:p,x:p.x+Phaser.Math.Between(-110,110),y:Phaser.Math.Between(-100,500),alpha:0,scale:.1,duration:1500+i*60,onComplete:()=>p.destroy()});
    }
    const rings=this.add.graphics().setDepth(20); let r=10;
    this.time.addEvent({delay:35,repeat:45,callback:()=>{rings.clear();rings.lineStyle(2,0x78f5ff,.75);rings.strokeCircle(1485,805,r+=8)}});
    this.tweens.add({targets:this.cameras.main,zoom:1.04,duration:450,yoyo:true,repeat:1});
    this.cameras.main.shake(700,.008);
    const signal=document.querySelector('#signal') as HTMLElement;
    signal.textContent='DISTRESS BEACON TRANSMITTED';
    this.toast('UPLINK ESTABLISHED // SIGNAL IN TRANSIT');
    this.time.delayedCall(2700,()=>this.showSubtitle('UNKNOWN TRANSMISSION: MERCER. LISTEN CAREFULLY. YOU HAVE TO STOP THE SECOND LANDING.'));
    this.time.delayedCall(7000,()=>{
      this.cameras.main.flash(900,110,235,240);
      this.updateHud();
      signal.textContent='CHAPTER 01 COMPLETE';
      this.showSubtitle('END OF CHAPTER 01 // THE SIGNAL WAS YOURS.');
    });
  }

  sideUpdate(dt:number){
    const left=this.keys.A.isDown||this.keys.LEFT.isDown;
    const right=this.keys.D.isDown||this.keys.RIGHT.isDown;
    const jump=this.keys.SPACE.isDown||this.keys.W.isDown||this.keys.UP.isDown;
    const axis=(right?1:0)-(left?1:0);
    const target=axis*235;
    this.vx=Phaser.Math.Linear(this.vx,target,Math.min(1,dt*10));
    if(!axis)this.vx*=Math.pow(.02,dt);
    this.x=Phaser.Math.Clamp(this.x+this.vx*dt,20,1770);
    if(jump&&this.grounded){
      this.vy=-455; this.grounded=false;
      this.tweens.add({targets:this.sideRig,scaleY:1.12,scaleX:.94,duration:100,yoyo:true,ease:'Quad.easeOut'});
    }
    this.vy+=1180*dt; this.jumpY+=this.vy*dt;
    if(this.jumpY>0){
      this.jumpY=0; this.vy=0;
      if(!this.grounded)this.tweens.add({targets:this.sideRig,scaleY:.84,scaleX:1.1,duration:100,yoyo:true,ease:'Back.easeOut'});
      this.grounded=true;
    }
    this.player.setPosition(this.x,590+this.jumpY);
    if(Math.abs(this.vx)>9)this.face=Math.sign(this.vx);
    this.sideRig.setScale(this.face,1);
    this.phase+=Math.abs(this.vx)*dt*.038;
    const moving=Math.abs(this.vx)>14 && this.grounded;
    this.sideTorso.y=moving?Math.abs(Math.sin(this.phase*2))*2:Math.sin(this.time.now*.002)*1.1;
    this.sideLegs.forEach((leg,i)=>{
      leg.clear();
      const a=this.phase+i*Math.PI;
      const s=moving?Math.sin(a):0;
      leg.lineStyle(7,0xbccbc6,1);
      leg.beginPath(); leg.moveTo(i?5:-5,-25);
      leg.lineTo((i?8:-8)+s*7,-13-Math.max(0,Math.cos(a))*4);
      leg.lineTo((i?10:-10)+s*12,-3); leg.strokePath();
      leg.fillStyle(0x263c45,1); leg.fillRoundedRect((i?10:-10)+s*12-6,-5,13,6,2);
    });
    this.sideArms.clear();
    const swing=moving?Math.sin(this.phase)*10:0;
    this.sideArms.lineStyle(6,0xcbd6d1,1);
    this.sideArms.lineBetween(-10,-56,-13-swing,-30);
    this.sideArms.lineBetween(10,-56,13+swing,-30);
  }

  collidesTop(x:number,y:number):boolean{
    const radius=14;
    if(x<100+radius||x>1700-radius||y<100+radius||y>1000-radius)return true;
    return this.topObstacles.some(r=>x+radius>r.x&&x-radius<r.x+r.w&&y+radius>r.y&&y-radius<r.y+r.h);
  }

  topUpdate(dt:number){
    const left=this.keys.A.isDown||this.keys.LEFT.isDown;
    const right=this.keys.D.isDown||this.keys.RIGHT.isDown;
    const up=this.keys.W.isDown||this.keys.UP.isDown;
    const down=this.keys.S.isDown||this.keys.DOWN.isDown;
    let dx=(right?1:0)-(left?1:0);
    let dy=(down?1:0)-(up?1:0);
    const length=Math.hypot(dx,dy);
    if(length>0){dx/=length;dy/=length;}
    const speed=238;
    this.topV.x=Phaser.Math.Linear(this.topV.x,dx*speed,Math.min(1,dt*11));
    this.topV.y=Phaser.Math.Linear(this.topV.y,dy*speed,Math.min(1,dt*11));
    if(!dx)this.topV.x*=Math.pow(.025,dt);
    if(!dy)this.topV.y*=Math.pow(.025,dt);
    const nx=this.top.x+this.topV.x*dt;
    if(!this.collidesTop(nx,this.top.y))this.top.x=nx; else this.topV.x=0;
    const ny=this.top.y+this.topV.y*dt;
    if(!this.collidesTop(this.top.x,ny))this.top.y=ny; else this.topV.y=0;
    this.player.setPosition(this.top.x,this.top.y);
    const moving=Math.hypot(this.topV.x,this.topV.y)>18;
    if(moving){
      this.topFacing.set(dx,dy).normalize();
      this.topRig.rotation=Math.atan2(this.topFacing.y,this.topFacing.x)+Math.PI/2;
    }
    this.phase+=moving?dt*12:dt*1.2;
    const step=moving?Math.sin(this.phase)*4:Math.sin(this.time.now*.002)*.7;
    this.topLegs[0].y=18+step; this.topLegs[1].y=18-step;
    this.topArms[0].y=2-step*.65; this.topArms[1].y=2+step*.65;
    this.topRig.y=moving?Math.abs(Math.sin(this.phase*2))*1.4:Math.sin(this.time.now*.002)*.5;
  }

  update(_time:number,delta:number){
    const dt=Math.min(delta/1000,.05);
    if(this.mode==='side')this.sideUpdate(dt); else this.topUpdate(dt);
    const target=this.currentTarget();
    const usePressed=this.keys.E.isDown||this.keys.ENTER.isDown||this.useHeld;
    if(target){
      if(this.useTargetId!==target.id){this.useTargetId=target.id;this.useProgress=0;}
      if(usePressed){
        this.useProgress=Math.min(target.duration,this.useProgress+dt);
        const pct=Math.floor(this.useProgress/target.duration*100);
        this.prompt('HOLD [E]  '+target.label+'  '+pct+'%');
        if(this.useProgress>=target.duration)this.completeTarget(target.id);
      }else{
        this.useProgress=Math.max(0,this.useProgress-dt*.8);
        this.prompt('[E]  '+target.label);
      }
    }else{
      this.useProgress=0; this.useTargetId='';
      if(this.mode==='top'&&this.stage===7&&!this.alignReady&&!this.transmitted)this.prompt('HOLD RIGHT TO TUNE  //  LEFT TO CORRECT');
      else if(this.stage===8)this.prompt('CHAPTER COMPLETE');
      else this.prompt('');
    }

    if(this.stage===7&&this.relayAccessed&&!this.alignReady&&!this.transmitted){
      const right=this.keys.D.isDown||this.keys.RIGHT.isDown;
      const left=this.keys.A.isDown||this.keys.LEFT.isDown;
      this.align=Phaser.Math.Clamp(this.align+((right?42:0)-(left?42:0))*dt,0,100);
      const signal=document.querySelector('#signal') as HTMLElement;
      signal.textContent='CARRIER PHASE  //  '+Math.floor(this.align)+'%';
      if(this.align>=100){
        this.alignReady=true;
        signal.textContent='PHASE LOCKED  //  HOLD ACTION TO TRANSMIT';
        this.cameras.main.flash(350,80,230,240);
        this.toast('CARRIER PHASE LOCKED');
        this.updateHud();
      }
    }
    if(this.alignReady&&!this.transmitted&&usePressed)this.transmit();
    const clock=document.querySelector('#clock')!;
    clock.innerHTML='04:17:'+String(Math.floor(this.time.now/1000)%60).padStart(2,'0')+'<br><small>KEPLER-186f</small>';
  }
}

const game=new Phaser.Game({
  type:Phaser.AUTO,
  parent:'game',
  backgroundColor:'#081522',
  scale:{mode:Phaser.Scale.RESIZE,width:1600,height:900},
  render:{antialias:true},
  scene:[Campaign],
  input:{activePointers:4}
});

const scene=()=>game.scene.getScene('campaign') as Campaign;
document.querySelector('#deploy')!.addEventListener('click',()=>{
  document.querySelector('#intro')!.setAttribute('style','display:none');
  document.querySelector('#controls')!.classList.add('active');
});
const action=document.querySelector('#action')!;
action.addEventListener('pointerdown',e=>{e.preventDefault();scene().useHeld=true;});
['pointerup','pointercancel','lostpointercapture','pointerleave'].forEach(eventName=>{
  action.addEventListener(eventName,()=>{scene().useHeld=false;});
});
document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button=>{
  const key=button.dataset.key!.toUpperCase();
  button.addEventListener('pointerdown',e=>{
    e.preventDefault();
    const current=scene();
    if(current.keys[key])current.keys[key].isDown=true;
    button.setPointerCapture(e.pointerId);
  });
  ['pointerup','pointercancel','lostpointercapture','pointerleave'].forEach(eventName=>{
    button.addEventListener(eventName,()=>{const current=scene();if(current.keys&&current.keys[key])current.keys[key].isDown=false;});
  });
});
document.addEventListener('contextmenu',e=>e.preventDefault());
