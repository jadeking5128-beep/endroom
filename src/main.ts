import Phaser from 'phaser';
import './style.css';

type Mode='side'|'top';
type Task={name:string;done:boolean};
class Campaign extends Phaser.Scene {
  mode:Mode='side'; x=120; y=0; vx=0; vy=0; grounded=true; face=1; phase=0; stage=0;
  keys!:Record<string,Phaser.Input.Keyboard.Key>; player!:Phaser.GameObjects.Container; torso!:Phaser.GameObjects.Container;
  g!:Phaser.GameObjects.Graphics; top={x:130,y:430}; nodes=[false,false,false]; router=false; scan=false; relay=false; align=0; alignReady=false; transmitted=false; beam?:Phaser.GameObjects.Graphics;
  tasks:Task[]=[{name:'Find the ruptured fuel line',done:false},{name:'Isolate the pressure valve',done:false},{name:'Recover the flight recorder',done:false}];
  constructor(){super('campaign')}
  create(){
    this.g=this.add.graphics();this.drawWorld();
    this.player=this.add.container(this.x,590);this.buildAstronaut();
    this.keys=this.input.keyboard!.addKeys('W,A,S,D,SPACE,SHIFT,E,ENTER,LEFT,RIGHT,UP,DOWN') as Record<string,Phaser.Input.Keyboard.Key>;
    this.cameras.main.setBounds(0,0,1800,900);this.cameras.main.startFollow(this.player,true,.09,.09);
    this.input.keyboard!.on('keydown-E',()=>this.interact());this.input.keyboard!.on('keydown-ENTER',()=>this.interact());
    this.events.on('update',(_t:number,dt:number)=>this.updateGame(dt));
    for(let i=0;i<60;i++){const p=this.add.circle(Phaser.Math.Between(0,1800),Phaser.Math.Between(0,900),Phaser.Math.Between(1,2),0xc3e1df,.2);this.tweens.add({targets:p,x:p.x+Phaser.Math.Between(-100,100),y:p.y-Phaser.Math.Between(30,130),alpha:.02,duration:Phaser.Math.Between(3000,7000),yoyo:true,repeat:-1})}
    this.hud();this.cameras.main.fadeIn(800);
  }
  buildAstronaut(){
    this.player.add(this.add.ellipse(0,3,38,9,0x02070a,.5));
    this.player.add(this.add.rectangle(-14,-40,15,35,0x415b64).setStrokeStyle(2,0x91a8aa));
    this.torso=this.add.container(0,-44);this.torso.add([this.add.rectangle(0,0,27,40,0xc6d2ce).setStrokeStyle(2,0x667f83),this.add.rectangle(0,0,16,19,0x243e49),this.add.rectangle(0,-7,6,3,0xd6a66c)]);
    this.player.add(this.torso);
    this.player.add(this.add.circle(0,-76,14,0xcbd6d1).setStrokeStyle(2,0x718b90));
    this.player.add(this.add.ellipse(3,-77,21,15,0x143541).setStrokeStyle(1,0x9bdde4));
    for(let i=0;i<2;i++){const limb=this.add.graphics();limb.setData('leg',i);this.player.add(limb)}
    const arms=this.add.graphics();arms.setData('arms',true);this.player.add(arms);
  }
  drawWorld(){
    const g=this.g;g.clear();
    if(this.mode==='side'){
      g.fillGradientStyle(0x081522,0x081522,0x263c49,0x263c49,1);g.fillRect(0,0,1800,900);
      g.fillStyle(0xd7c6a5,.9);g.fillCircle(1390,175,43);
      for(let i=0;i<4;i++){g.fillStyle([0x354956,0x2b3e49,0x22343f,0x1c2b35][i],1);g.fillEllipse(600+i*150,430+i*45,2000,180)}
      g.fillStyle(0x62584c,1);g.fillRect(0,590,1800,310);g.lineStyle(3,0x9a8870,.8);g.lineBetween(0,590,1800,590);
      // wrecked lander, station equipment, relay mast and anomaly
      g.fillStyle(0x9eafb0,1);g.fillRoundedRect(680,470,190,115,12);g.fillStyle(0x183946,1);g.fillRect(710,492,50,28);g.fillStyle(0xd6a66c,1);g.fillRect(780,488,7,12);
      g.fillStyle(0x293f48,1);g.fillRect(1070,492,95,98);g.fillStyle(0x92e0e6,1);g.fillRect(1082,510,70,4);
      g.lineStyle(4,0x9bdde4,.85);g.strokeEllipse(1450,470,110,165);g.lineStyle(2,0xd6a66c,.9);g.strokeEllipse(1450,470,72,125);
      g.fillStyle(0x294650,1);g.fillRect(1640,380,24,210);g.lineStyle(4,0xb8c8c6,.9);g.lineBetween(1652,380,1585,445);g.lineBetween(1652,380,1718,445);g.lineBetween(1585,445,1718,445);
      for(let i=0;i<8;i++){g.fillStyle(0x354b54,1);g.fillRoundedRect(120+i*210,510-(i%2)*25,56,78,5)}
    }else{
      g.fillGradientStyle(0x0b202b,0x0b202b,0x172e39,0x172e39,1);g.fillRect(0,0,1800,900);
      for(let x=0;x<1800;x+=90)for(let y=0;y<900;y+=90){g.lineStyle(1,0x6b9299,.13);g.strokeRect(x,y,90,90)}
      g.fillStyle(0x263f49,1);g.fillRoundedRect(70,70,1660,760,24);g.lineStyle(5,0x91b1b4,.6);g.strokeRoundedRect(70,70,1660,760,24);
      [[300,220],[700,450],[1200,220]].forEach(([x,y],i)=>{g.fillStyle([0xd6a66c,0x8de3e9,0x8de3e9][i],1);g.fillCircle(x,y,25);g.lineStyle(3,0x9bdde4,.8);g.strokeCircle(x,y,38);g.fillStyle(0x10242d,1);g.fillRect(x-10,y-5,20,10)});
      g.fillStyle(0x314c56,1);g.fillRoundedRect(200,130,230,110,10);g.fillRoundedRect(580,360,240,120,10);g.fillRoundedRect(1050,130,300,110,10);
      g.fillStyle(0x9be8ec,.7);g.fillRect(225,160,180,3);g.fillRect(610,390,180,3);g.fillRect(1080,160,230,3);
    }
  }
  hud(){
    const title=['SECURE THE LANDER','RECOVER THE FLIGHT LOG','RESTORE AUXILIARY POWER','CALIBRATE THE GRAVITY SCAN','TRANSMIT THE DISTRESS BEACON','THE SIGNAL WAS YOURS'][this.stage];
    const desc=['Stabilise the ruptured fuel system before the lander fails.','Reach the station and recover its flight recorder.','Reroute power from the station interior to the orbital relay.','Record the time-shift signature inside the anomaly field.','Align the carrier wave and transmit a distress signal.','The reply arrived six years before transmission.'][this.stage];
    document.querySelector('#objective')!.textContent=title;document.querySelector('#detail')!.textContent=desc;
    document.querySelector('#tasks')!.innerHTML=this.tasks.map(t=>'<div class="'+(t.done?'done':'')+'">'+t.name+'</div>').join('');
    document.querySelector('#mode')!.textContent=this.mode==='side'?'SIDE VIEW // SURFACE':'TOP-DOWN // STATION INTERIOR';
  }
  toast(s:string){const e=document.querySelector('#toast') as HTMLElement;e.textContent=s;e.style.opacity='1';this.time.delayedCall(1800,()=>e.style.opacity='0')}
  prompt(s:string){const e=document.querySelector('#prompt') as HTMLElement;e.style.display=s?'block':'none';e.textContent=s?'[ E ] '+s:''}
  interact(){
    if(this.mode==='side'){
      if(this.x>260&&this.x<360&&!this.tasks[0].done){this.tasks[0].done=true;this.toast('RUPTURED FUEL LINE LOCATED');this.hud();return}\n      if(this.x>400&&this.x<550&&this.tasks[0].done&&!this.tasks[1].done){this.tasks[1].done=true;this.nodes[0]=true;this.toast('PRESSURE VALVE ISOLATED');this.hud();return}
      if(this.x>650&&this.x<900&&this.tasks[0].done&&this.tasks[1].done){this.stage=1;this.mode='top';this.top={x:130,y:440};this.player.setPosition(this.top.x,this.top.y);this.cameras.main.stopFollow();this.cameras.main.setScroll(0,0);this.drawWorld();this.hud();this.toast('STATION INTERIOR // ACCESS GRANTED');return}
      if(this.x>1040&&this.x<1210&&this.stage>=1){this.tasks[2].done=true;this.stage=2;this.hud();this.toast('FLIGHT RECORDER RECOVERED');return}
    }else{
      const {x,y}=this.top;
      if(x>200&&x<470&&y>120&&y<300&&!this.router){this.router=true;this.tasks.push({name:'Reroute station power to the relay',done:true});this.stage=2;this.toast('POWER ROUTER ONLINE');this.hud();return}
      if(x>570&&x<840&&y>340&&y<510&&!this.scan){this.scan=true;this.stage=3;this.tasks.push({name:'Record the gravity time-shift signature',done:true});this.toast('TIME-SHIFT SIGNATURE RECORDED');this.hud();return}
      if(x>1040&&x<1380&&y>120&&y<300&&this.scan&&!this.relay){this.relay=true;this.stage=4;this.hud();this.startAlignment();return}
      if(x<190&&y>380){this.mode='side';this.x=770;this.player.setPosition(this.x,590);this.drawWorld();this.cameras.main.startFollow(this.player,true,.09,.09);this.hud()}
    }
  }
  startAlignment(){this.align=0;this.alignReady=false;document.querySelector('#signal')!.textContent='CARRIER PHASE CALIBRATION // USE ◀ ▶';document.querySelector('#signal')!.setAttribute('style','display:block');this.toast('MATCH THE CARRIER PHASE')}
  transmit(){
    if(!this.alignReady||this.transmitted)return;this.transmitted=true;this.beam=this.add.graphics().setDepth(20);
    const pulse=this.add.circle(1652,590,9,0x8dfaff,.95).setDepth(21);this.tweens.add({targets:pulse,y:-150,scale:6,alpha:0,duration:2300,ease:'Cubic.easeIn',onComplete:()=>pulse.destroy()});
    for(let i=0;i<22;i++){const p=this.add.circle(1652+Phaser.Math.Between(-24,24),570,Phaser.Math.Between(2,5),0x8dfaff,.95).setDepth(21);this.tweens.add({targets:p,x:p.x+Phaser.Math.Between(-110,110),y:Phaser.Math.Between(-120,420),alpha:0,scale:.1,duration:1600+i*65,onComplete:()=>p.destroy()})}
    const rings=this.add.graphics().setDepth(20);let r=10;this.time.addEvent({delay:35,repeat:45,callback:()=>{rings.clear();rings.lineStyle(2,0x78f5ff,.75);rings.strokeCircle(1652,590,r+=8)}});this.tweens.add({targets:this.cameras.main,zoom:1.04,duration:450,yoyo:true,repeat:1});this.cameras.main.shake(700,.008);
    document.querySelector('#signal')!.textContent='DISTRESS BEACON TRANSMITTED';this.toast('UPLINK ESTABLISHED // SIGNAL IN TRANSIT');
    this.time.delayedCall(2700,()=>{const sub=document.querySelector('#subtitle') as HTMLElement;sub.textContent='UNKNOWN TRANSMISSION: MERCER. LISTEN CAREFULLY. YOU HAVE TO STOP THE SECOND LANDING.';sub.style.display='block';this.time.delayedCall(4800,()=>sub.style.display='none')});
    this.time.delayedCall(7000,()=>{this.stage=5;this.hud();document.querySelector('#signal')!.textContent='CHAPTER 01 COMPLETE'});
  }
  updateGame(ms:number){
    const dt=Math.min(ms/1000,.04),left=this.keys.A.isDown||this.keys.LEFT.isDown,right=this.keys.D.isDown||this.keys.RIGHT.isDown,up=this.keys.W.isDown||this.keys.UP.isDown,down=this.keys.S.isDown||this.keys.DOWN.isDown;
    if(this.mode==='side'){
      const axis=(right?1:0)-(left?1:0);this.vx=Phaser.Math.Linear(this.vx,axis*225,.17);if(!axis)this.vx*=.76;this.x=Phaser.Math.Clamp(this.x+this.vx*dt,20,1770);
      if((this.keys.SPACE.isDown||this.keys.W.isDown)&&this.grounded){this.vy=-440;this.grounded=false}this.vy+=1100*dt;this.y+=this.vy*dt;if(this.y>0){this.y=0;this.vy=0;this.grounded=true}
      this.player.setPosition(this.x,590+this.y);if(Math.abs(this.vx)>10)this.face=Math.sign(this.vx);this.player.setScale(this.face,1);
      const moving=Math.abs(this.vx)>12;this.phase+=Math.abs(this.vx)*dt*.035;this.torso.y=moving?Math.abs(Math.sin(this.phase*2))*2:Math.sin(this.time.now*.002)*1.1;
      const legs=this.player.list.filter(o=>o instanceof Phaser.GameObjects.Graphics) as Phaser.GameObjects.Graphics[];
      legs.forEach((leg,i)=>{leg.clear();const a=this.phase+i*Math.PI,s=moving?Math.sin(a):0;leg.lineStyle(7,0xbccbc6,1);leg.beginPath();leg.moveTo(i?5:-5,-25);leg.lineTo((i?8:-8)+s*7,-13-Math.max(0,Math.cos(a))*4);leg.lineTo((i?10:-10)+s*12,-3);leg.strokePath();leg.fillStyle(0x263c45,1);leg.fillRoundedRect((i?10:-10)+s*12-6,-5,13,6,2)});
      const arms=this.player.list.filter(o=>o instanceof Phaser.GameObjects.Graphics)[2] as Phaser.GameObjects.Graphics|undefined;if(arms){arms.clear();const swing=moving?Math.sin(this.phase)*8:0;arms.lineStyle(6,0xcbd6d1,1);arms.lineBetween(-10,-56,-13-swing,-30);arms.lineBetween(10,-56,13+swing,-30)}
      const hint=this.x>650&&this.x<900?(this.tasks[0].done&&this.tasks[1].done?'ENTER STATION':'COMPLETE FUEL-LINE REPAIR'):this.x>260&&this.x<360&&!this.tasks[0].done?'LOCATE RUPTURED LINE':this.x>400&&this.x<550?'ISOLATE PRESSURE VALVE':this.x>1040&&this.x<1210&&this.stage>=1?'RECOVER FLIGHT RECORDER':'';this.prompt(hint);
      if(this.x>650&&this.x<900&&this.stage===0)this.prompt('COMPLETE FUEL-LINE REPAIR FIRST');
    }else{
      const dx=(right?1:0)-(left?1:0),dy=(down?1:0)-(up?1:0);this.top.x=Phaser.Math.Clamp(this.top.x+dx*210*dt,90,1710);this.top.y=Phaser.Math.Clamp(this.top.y+dy*210*dt,100,800);this.player.setPosition(this.top.x,this.top.y);this.torso.y=Math.sin(this.time.now*.004)*1.2;
      const hint=this.top.x<190&&this.top.y>380?'EXIT TO SURFACE':this.top.x>200&&this.top.x<470&&this.top.y>120&&this.top.y<300&&!this.router?'RESTORE POWER ROUTER':this.top.x>570&&this.top.x<840&&this.top.y>340&&this.top.y<510&&!this.scan?'CALIBRATE GRAVITY SCANNER':this.top.x>1040&&this.top.x<1380&&this.top.y>120&&this.top.y<300&&this.scan&&!this.relay?'ACCESS ORBITAL RELAY':'';this.prompt(hint);
    }
    if(this.align<100&&this.relay&&!this.transmitted){this.align=Phaser.Math.Clamp(this.align+((right?1:0)-(left?1:0))*45*dt,0,100);if(this.align>=100){this.alignReady=true;document.querySelector('#signal')!.textContent='PHASE LOCKED // PRESS ACTION TO TRANSMIT';this.toast('CARRIER PHASE LOCKED')}}
    if(this.beam){this.beam.clear();this.beam.fillStyle(0x78f5ff,.12);this.beam.fillRect(1644,0,16,900);this.beam.fillStyle(0x8dfaff,.9);this.beam.fillRect(1650,0,4,900)}
    const clock=document.querySelector('#clock')!;clock.innerHTML='04:17:'+String(Math.floor(this.time.now/1000)%60).padStart(2,'0')+'<br><small>KEPLER-186f</small>';
  }
}
const game=new Phaser.Game({type:Phaser.AUTO,parent:'game',backgroundColor:'#081522',scale:{mode:Phaser.Scale.RESIZE,width:1600,height:900},render:{antialias:true},scene:[Campaign],input:{activePointers:3}});
document.querySelector('#deploy')!.addEventListener('click',()=>{document.querySelector('#intro')!.setAttribute('style','display:none');document.querySelector('#controls')!.setAttribute('style','display:flex')});
const scene=()=>game.scene.getScene('campaign') as Campaign;
document.querySelector('#action')!.addEventListener('pointerdown',e=>{e.preventDefault();if(scene().relay&&!scene().transmitted)scene().transmit();else scene().interact()});
document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b=>{const key=b.dataset.key!.toUpperCase();b.addEventListener('pointerdown',e=>{e.preventDefault();(scene().keys[key] as any).isDown=true});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,()=>{if(scene().keys)(scene().keys[key] as any).isDown=false}))});
document.addEventListener('contextmenu',e=>e.preventDefault());
