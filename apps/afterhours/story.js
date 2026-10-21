'use strict';
// Small, hand-drawn films. The audio clock is the only timeline: seeking,
// repeating, pausing and changing songs cannot leave a film out of sync.
window.AfterhoursStory = class {
  constructor(audio) {
    this.audio = audio;
    this.cover = document.getElementById('cover');
    this.canvas = document.getElementById('story-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.available = Boolean(this.ctx);
    this.active = false;
    this.frame = 0;
    this.chapter = -1;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion.addEventListener('change', () => this.update());
    document.addEventListener('visibilitychange', () => this.update());
    this.resize = new ResizeObserver(() => {
      const size = Math.min(1440, Math.round(this.cover.clientWidth * Math.min(devicePixelRatio || 1, 2)));
      if (size && this.canvas.width !== size) { this.canvas.width = size; this.canvas.height = size; this.draw(); }
    });
    this.resize.observe(this.cover);
  }
  select(track, index) {
    this.track = track;
    this.chapter = -1;
    this.cover.dataset.scene = track.visual || 'window';
    document.getElementById('cover-title').textContent = track.title.toUpperCase();
    document.getElementById('cover-collection').textContent = track.coverLabel || 'AFTERHOURS';
    document.getElementById('cover-number').textContent = `VOL. ${String(index + 1).padStart(2, '0')}`;
    document.getElementById('cover-note').textContent = track.coverNote || 'TAKE YOUR TIME. PRESS PLAY.';
    const chapters = document.getElementById('story-chapters');
    chapters.replaceChildren();
    for (const part of track.story || []) { const dot = document.createElement('span'); dot.title = part.title; chapters.append(dot); }
    this.update();
  }
  toggle() {
    if (!this.available || !this.track?.story?.length) return;
    this.active = !this.active;
    this.cover.classList.toggle('is-animated', this.active);
    document.getElementById('story-caption').hidden = !this.active;
    document.getElementById('film-state').hidden = !this.active;
    document.getElementById('animate').setAttribute('aria-pressed', String(this.active));
    document.getElementById('animate-label').textContent = this.active ? 'Still cover' : 'Animate';
    this.update();
  }
  update() {
    cancelAnimationFrame(this.frame); this.frame = 0;
    if (!this.track || !this.available) return;
    const parts = this.track.story || [];
    const now = this.audio.currentTime || 0;
    let chapter = 0;
    parts.forEach((part, index) => { if (now >= part.at) chapter = index; });
    if (chapter !== this.chapter) {
      this.chapter = chapter;
      const part = parts[chapter];
      document.getElementById('story-chapter').textContent = part ? `${String(chapter + 1).padStart(2, '0')} / ${String(parts.length).padStart(2, '0')} — ${part.title}` : '';
      document.getElementById('story-line').textContent = part?.text || '';
      document.querySelectorAll('#story-chapters span').forEach((dot, index) => dot.classList.toggle('reached', index <= chapter));
    }
    const caption = parts[chapter];
    this.canvas.setAttribute('aria-label', this.active && caption ? `${this.track.title}: ${caption.title}. ${caption.text}` : `${this.track.title} — illustrated ${this.track.visual || 'night'} cover`);
    const still = this.reducedMotion.matches;
    document.getElementById('film-state').textContent = still ? 'STORY STILLS' : this.audio.paused ? 'STORY PAUSED' : 'VISUAL STORY';
    document.getElementById('animation-hint').textContent = this.active ? (still ? 'Quiet story stills · reduced motion.' : this.audio.paused ? 'Press Play to bring it to life.' : 'A little film, in time with the music.') : 'Every song has a little story.';
    this.draw();
    if (this.active && !still && !this.audio.paused && !this.audio.ended && !document.hidden) {
      let last = 0;
      const tick = stamp => {
        if (stamp - last >= 1000 / 30) { this.draw(); last = stamp; }
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    }
  }
  draw() {
    if (!this.ctx || !this.track) return;
    const c = this.ctx, W = 960;
    const staticTime = this.active ? this.track.story?.[this.chapter]?.at || 0 : this.track.duration * .12;
    const t = this.active && !this.reducedMotion.matches ? this.audio.currentTime || 0 : staticTime;
    const p = Math.min(1, t / this.track.duration);
    const beat = (1 + Math.cos(t * Math.PI * 2 * (this.track.bpm || 80) / 60)) / 2;
    c.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / W, 0, 0);
    c.clearRect(0, 0, W, W);
    const rect = (x,y,w,h,color) => { c.fillStyle = color; c.fillRect(x,y,w,h); };
    const circle = (x,y,r,color) => { c.fillStyle = color; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill(); };
    const line = (points,color,width=1) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.stroke(); };
    const polygon = (points,color) => { c.fillStyle = color; c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill(); };
    const glow = (x,y,r,color) => { const g = c.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,color); g.addColorStop(1,'transparent'); circle(x,y,r,g); };
    const sky = (top,bottom) => { const g = c.createLinearGradient(0,0,0,W); g.addColorStop(0,top); g.addColorStop(1,bottom); rect(0,0,W,W,g); };
    const random = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    const stars = (amount=75,opacity=1) => {
      for (let i=0;i<amount;i++) { const a = opacity * (.2 + random(i+7)*.5 + .12*Math.sin(t*.3+i)); circle(random(i)*W,70+random(i+42)*500,random(i+8)*1.8+.5,`rgba(223,235,223,${a})`); }
    };
    const city = (base, color, travel=0, windows=true, height=240) => {
      const shift = (travel % 120 + 120) % 120;
      for (let i=-1;i<10;i++) {
        const x=i*120-shift, h=70+random(i+23)*height;
        rect(x,base-h,110,h,color);
        rect(x+18,base-h-8,65,10,color);
        if (windows) for (let row=0;row<Math.floor(h/34)-1;row++) for (let col=0;col<4;col++) {
          if (random(i*31+row*7+col)>.54) rect(x+16+col*22,base-h+20+row*30,5,10,'#d6b47b66');
        }
      }
    };
    const hills = (base,color,phase=0) => {
      const points = [[0,W],[0,base]];
      for (let x=0;x<=W;x+=20) points.push([x,base+Math.sin(x*.006+phase)*42+Math.sin(x*.013+phase)*14]);
      points.push([W,W]); polygon(points,color);
    };
    const firefly = (x,y,scale=1) => { glow(x,y,48*scale,'#ffce6b48'); circle(x,y,(3+beat)*scale,'#ffe4a3'); };
    const plane = (x,y,size,rotation=0) => {
      c.save(); c.translate(x,y); c.rotate(rotation); c.scale(size,size);
      polygon([[-48,-20],[60,0],[-39,30],[-16,3]],'#e8e6d5');
      polygon([[-16,3],[60,0],[-12,16]],'#a2b6bd');
      line([[-48,-20],[-16,3],[60,0]],'#fff5dc',1); c.restore();
    };
    const birds = (amount,y) => {
      for (let i=0;i<amount;i++) { const x=(t*13+i*137)%1160-100, h=y+Math.sin(i*2)*50; line([[x-9,h+Math.sin(t*2+i)*4],[x,h],[x+9,h+Math.sin(t*2+i)*4]],'#263f4a',2); }
    };

    if (['room','garden','curtain'].includes(this.track.visual)) {
      // Furniture music gets quiet tableaux: no beat pulses, flying objects or
      // busy movement. Only daylight, a curtain and an occasional leaf shift.
      sky('#34494c','#8c9b87');
      const daylight=c.createLinearGradient(0,180,0,690); daylight.addColorStop(0,'#a9b8a4'); daylight.addColorStop(1,'#d3c7a0');
      glow(680,310,300,'#f3db9c24');
      if(this.track.visual === 'garden') {
        rect(100,180,760,470,'#233f43'); rect(115,195,730,440,daylight);
        hills(550,'#829b89',.5); hills(640,'#647f73',1.5);
        rect(100,625,760,18,'#b7b49b'); rect(0,700,W,260,'#3b5151');
        line([[0,710],[960,710]],'#87998b',3);
        rect(470,580,280,19,'#b0a384'); rect(485,599,12,105,'#6d7767'); rect(721,599,12,105,'#6d7767');
        rect(470,540,280,15,'#a0967b'); rect(490,554,6,30,'#788372'); rect(725,554,6,30,'#788372');
        polygon([[190,605],[300,605],[280,715],[210,715]],'#a0876c');
        line([[245,610],[244,420],[214,328]],'#364e43',6);
        for(let i=0;i<12;i++) {
          const y=355+i*21, side=i%2?1:-1, sway=Math.sin(t*.12+i)*3;
          line([[244,y+30],[244+side*50+sway,y]],'#44634c',2);
          c.save(); c.translate(244+side*43+sway,y); c.rotate(side*.7); c.fillStyle=i%3?'#637f60':'#8a9c71'; c.beginPath(); c.ellipse(0,0,17,34,0,0,Math.PI*2); c.fill(); c.restore();
        }
        circle(669,590,14,'#d8c6a1');
      } else {
        rect(255,175,470,440,'#203a3d'); rect(270,190,440,410,daylight);
        hills(530,'#8a9f8e',.7); // Mask the hills outside the window frame.
        rect(0,0,255,W,'#52665e'); rect(725,0,235,W,'#52665e'); rect(255,615,470,345,'#52665e');
        rect(480,185,9,420,'#536c64'); rect(270,397,440,8,'#536c64');
        polygon([[270,613],[705,613],[960,940],[398,940]],'#e2ce9c16');
        rect(236,610,506,15,'#a2a88d');
        if(this.track.visual === 'curtain') {
          const sway=Math.sin(t*.13)*6;
          polygon([[248,160],[362,160],[349+sway,390],[377+sway,646],[255,661]],'#d5d3b9dd');
          polygon([[620,160],[735,160],[725,661],[598-sway,646],[635-sway,390]],'#c7ccb4e8');
          for(let i=0;i<4;i++) {
            line([[265+i*23,165],[269+i*21+sway*.4,405],[269+i*25+sway,650]],'#f4eedb2b',3);
            line([[638+i*23,165],[643+i*20-sway*.4,405],[613+i*26-sway,650]],'#f4eedb24',3);
          }
          rect(380,676,208,15,'#a18f71'); rect(397,691,8,134,'#4a5145'); rect(562,691,8,134,'#4a5145');
          rect(469,640,35,36,'#d5c6a6'); line([[486,640],[487,584]],'#879a70',2); circle(488,582,7,'#e2cfa5');
        } else {
          rect(185,674,590,17,'#ad9d7e'); rect(209,691,13,152,'#31453f'); rect(738,691,13,152,'#31453f');
          polygon([[400,644],[485,630],[485,666],[400,675]],'#c9c4a8');
          polygon([[485,630],[562,642],[570,675],[485,666]],'#e2d8b9');
          line([[485,631],[485,665]],'#899681',2);
          for(let i=0;i<4;i++) line([[415,649+i*5],[470,641+i*6]],'#9b9f8455',1);
          rect(631,640,33,34,'#d2c09a'); c.strokeStyle='#d2c09a'; c.lineWidth=5; c.beginPath(); c.arc(667,655,10,-Math.PI/2,Math.PI/2); c.stroke();
          line([[286,674],[286,496],[324,473]],'#c4b38e',5); polygon([[292,471],[350,471],[373,512],[271,512]],'#bbae8a');
          glow(324,550,100,'#eed39c18');
        }
      }
      // The light changes almost imperceptibly over the whole composition.
      rect(0,0,W,W,`rgba(230,193,139,${p*.06})`);
    } else if (this.track.visual === 'train') {
      sky('#0c202e','#557175'); stars(50);
      glow(700,260,190,'#bdd6c71a'); circle(700,260,32,'#d7ddc1');
      hills(540,'#2e515b',t*.025); hills(600,'#23434c',t*.04);
      if (p<.65) {
        c.save(); c.globalAlpha=Math.max(0,1-p/.65);
        city(650,'#19353e',t*20); city(700,'#112a35',t*45); c.restore();
      }
      rect(0,680,W,40,'#0b242d');
      for (let i=0;i<3;i++) { const x=((i*420-t*95)%1260+1260)%1260-150; rect(x,290,8,430,'#0d222d'); line([[x-55,325],[x+65,325]],'#0d222d',5); }
      line([[0,325],[960,325]],'#1e3640',2);
      if(p>.5) { glow(740,605,65,'#f7ca6f27'); rect(725,593,32,24,'#182f36'); rect(736,600,7,9,'#ffe0a1'); }
      // The scenery moves; the passenger's window, cup and reflection stay put.
      rect(0,0,55,W,'#10252c'); rect(905,0,55,W,'#10252c'); rect(0,0,W,170,'#10252c');
      rect(0,718,W,242,'#102329'); rect(55,700,850,18,'#83918a'); rect(55,718,850,17,'#344d50');
      line([[66,684],[66,183],[894,183],[894,684]],'#76938b66',5);
      polygon([[95,190],[330,190],[600,696],[365,696]],'#d8e8d607');
      circle(240,649,38,'#0b1b22'); polygon([[218,680],[267,682],[305,790],[181,790]],'#0b1b22');
      rect(676,708,65,59,'#b09b79'); c.strokeStyle='#b09b79'; c.lineWidth=8; c.beginPath(); c.arc(745,731,17,-Math.PI/2,Math.PI/2); c.stroke();
      for(let i=0;i<3;i++) line([[690+i*15,698],[686+i*15+Math.sin(t+i)*5,675],[692+i*15,650]],'#e1d3b840',2);
      firefly(470+Math.sin(t*.2)*120,410+Math.cos(t*.3)*30,.7);
    } else if (this.track.visual === 'space') {
      sky('#111b36','#493e62');
      glow(470,420,480,'#8e79c337'); glow(180,680,330,'#4aa5a82b'); stars(140);
      c.save(); c.translate(694,316); c.rotate(-.3);
      c.strokeStyle='#c6c3c135'; c.lineWidth=12; c.beginPath(); c.ellipse(0,0,166,39,0,0,Math.PI*2); c.stroke();
      const planet=c.createLinearGradient(-70,-70,90,100); planet.addColorStop(0,'#adabb2'); planet.addColorStop(1,'#354564'); circle(0,0,79,planet);
      c.strokeStyle='#e6d7bf77'; c.lineWidth=5; c.beginPath(); c.ellipse(0,0,166,39,0,0,Math.PI); c.stroke(); c.restore();
      c.save(); c.translate(460,510); c.rotate(-.35); c.strokeStyle='#cdd7d529'; c.lineWidth=1; c.setLineDash([3,12]); c.beginPath(); c.ellipse(0,0,340,135,0,0,Math.PI*2); c.stroke(); c.restore();
      const x=260+p*300, y=570-p*230+Math.sin(t*.35)*20;
      glow(x,y,150,'#f7d6a51c'); plane(x,y,1.25,-.25+Math.sin(t*.2)*.08);
      if(p>.4) for(let i=0;i<5;i++) { const a=t*.08+i*1.25; plane(460+Math.cos(a)*295,470+Math.sin(a)*150,.3+i*.06,a*.08); }
      if(p>.55) {
        const constellation=[[165,310],[249,240],[328,286],[387,185],[477,220]];
        line(constellation,'#dbe4dc55',1); constellation.forEach(([cx,cy])=>circle(cx,cy,3,'#f9e8bf'));
      }
      firefly(x+85,y-24,1.3);
    } else if (this.track.visual === 'sea') {
      sky('#112b3b','#66888a'); stars(50,.7);
      glow(300,300,170,'#f5dfb126'); circle(300,300,44,'#dbddbf');
      hills(535,'#355965',1); rect(0,550,W,410,'#1b4654');
      for(let row=0;row<32;row++) {
        const y=560+row*13, points=[];
        for(let x=0;x<=W;x+=12) points.push([x,y+Math.sin(x*.014+t*.65+row*.5)*(2+row*.14)]);
        line(points,row%3===0?'#b7d2c02e':'#51888d48',row%3===0?2:1);
        const sx=300+Math.sin(row*2+t*.3)*row*2; line([[sx-row*2,y],[sx+row*2,y]],'#d9d5b42b',2);
      }
      polygon([[665,590],[735,536],[826,525],[960,595]],'#173b47');
      polygon([[758,535],[770,355],[801,355],[816,535]],'#bcc5b1');
      rect(762,344,48,22,'#ead5a0'); polygon([[754,342],[786,317],[818,342]],'#1b3540');
      rect(779,472,15,36,'#294751');
      const sweep=Math.sin(t*.18)*160;
      polygon([[786,352],[100+sweep,246],[100+sweep,445]],'#f9df9c0d'); glow(785,352,65,'#ffe3a738');
      const bx=200+p*330, by=623+Math.sin(t*.8)*5;
      c.save(); c.translate(bx,by); c.rotate(Math.sin(t*.6)*.025);
      polygon([[-65,0],[67,0],[43,25],[-43,25]],'#122e3c'); line([[0,-143],[0,0]],'#c3b594',4);
      polygon([[-5,-139],[-5,-12],[-64,-12]],'#d8d6bd'); polygon([[6,-119],[6,-15],[55,-15]],'#94b4b1'); firefly(25,-8,.8); c.restore();
      if(p>.4) birds(4,420);
    } else if (this.track.visual === 'dawn') {
      sky(`rgb(${49+Math.round(p*45)},${49+Math.round(p*29)},${80+Math.round(p*12)})`,`rgb(${163+Math.round(p*70)},${119+Math.round(p*61)},${112+Math.round(p*16)})`);
      stars(40,1-p);
      const sy=660-p*355; glow(560,sy,340,'#ffd49c5c'); circle(560,sy,73,'#f8d7a0');
      hills(600,'#6c737d',1); city(690,'#4a5965',0,false,230); city(775,'#303e4a',0,true,160);
      if(p>.25) birds(7,340);
      rect(0,754,W,206,'#1d2f38'); rect(0,739,W,15,'#9b8e7b');
      for(let i=0;i<8;i++) rect(i*140,773,1,187,'#9eaaa213');
      // A listener on the rooftop, feet over the edge, watching morning arrive.
      circle(470,649,22,'#172a33'); polygon([[453,670],[483,669],[500,742],[441,742]],'#263b43');
      line([[457,737],[455,781],[471,790]],'#172a33',13); line([[487,737],[495,777],[511,783]],'#172a33',13);
      line([[450,683],[422,730],[402,737]],'#263b43',12);
      rect(733,699,50,40,'#9b7765');
      for(let i=0;i<5;i++) { line([[756,700],[728+i*14,646+Math.sin(i)*20]],'#526f63',3); c.save(); c.translate(730+i*14,656+Math.sin(i)*20); c.rotate(i*.65); c.fillStyle='#627c66'; c.beginPath(); c.ellipse(0,0,9,21,0,0,Math.PI*2); c.fill(); c.restore(); }
      firefly(375-p*90,595-p*140,.8*(1-p)+.3);
    } else {
      sky('#10232f','#305056'); stars(55,.6);
      glow(735,230,110,'#d4e3cf15'); circle(735,230,28,'#c5d5c3');
      city(715,'#19343e',0,true,290); city(880,'#102a34',0,true,220);
      const open=Math.max(0,(p-.48)/.52);
      glow(477,440,350,'#e0b66d20');
      polygon([[290,642],[670,642],[890,960],[70,960]],'#e5c18c08');
      rect(278,202,404,459,'#0a1b26');
      const interior=c.createLinearGradient(290,220,665,650); interior.addColorStop(0,'#dbbb82'); interior.addColorStop(1,'#8e7457');
      rect(292,217,376,428,interior);
      // A curtain, a houseplant, a small table: the room is quietly inhabited.
      polygon([[294,218],[353,218],[330,630],[294,644]],'#665e4b80');
      polygon([[605,218],[667,218],[667,644],[632,623]],'#6b614880');
      rect(472,562,115,7,'#4e5145'); rect(487,569,5,76,'#4e5145'); rect(570,569,5,76,'#4e5145');
      rect(530,544,18,18,'#e5d0a4');
      rect(355,590,42,52,'#545a47');
      for(let i=0;i<5;i++) { line([[375,594],[350+i*13,512+Math.sin(i)*30]],'#425545',3); c.save(); c.translate(350+i*13,520+Math.sin(i)*30); c.rotate(i*.8); c.fillStyle='#465b48'; c.beginPath(); c.ellipse(0,0,10,26,0,0,Math.PI*2); c.fill(); c.restore(); }
      rect(472,217,12,428,'#102731'); rect(292,423,376,12,'#102731');
      if(open>0) { polygon([[484,218],[484+open*100,244],[484+open*100,625],[484,645]],'#102731ab'); line([[484,218],[484+open*100,244],[484+open*100,625],[484,645]],'#7e938466',3); }
      rect(260,655,440,17,'#0b1c25'); rect(275,672,410,6,'#61736b');
      for(let i=0;i<90;i++) {
        const x=random(i)*1100-60, y=(random(i+120)*1100+t*(45+random(i)*50))%1100-80;
        line([[x,y],[x-11,y+33]],'#bfd7cd20',1);
      }
      const travel=Math.min(1,Math.max(0,(p-.2)/.8));
      firefly(620+Math.sin(t*.3)*14+travel*120,560-travel*330+Math.cos(t*.4)*9,1.2);
      if(p>.72) for(let i=0;i<12;i++) firefly(100+random(i+5)*760,310+random(i+66)*400,.3);
    }
    // A soft lens vignette and paper grain tie the collection together.
    const vignette=c.createRadialGradient(480,420,200,480,480,690); vignette.addColorStop(0,'transparent'); vignette.addColorStop(1,'#06151c99'); rect(0,0,W,W,vignette);
    for(let i=0;i<260;i++) rect(random(i+1000)*W,random(i+2000)*W,1,1,'#eff5dd18');
  }
};
