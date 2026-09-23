let canvas,context,width=0,height=0,step=4,particles=[],colors=[];

function prepare(data){
  width=data.width;height=data.height;step=data.step;particles=data.particles;colors=data.colors;
  if(!canvas){canvas=data.canvas;context=canvas.getContext('2d');}
  canvas.width=Math.round(width*data.ratio);canvas.height=Math.round(height*data.ratio);
  context.setTransform(data.ratio,0,0,data.ratio,0,0);
}

function draw(data){
  if(!context||!width||!height)return;
  context.clearRect(0,0,width,height);context.font=`${step*.94}px "Cipher Mono",monospace`;context.textAlign='center';context.textBaseline='middle';
  for(const point of particles){
    const dx=point.x-data.pointerX,dy=point.y-data.pointerY,distance=Math.hypot(dx,dy),radius=Math.max(55,width*.1);
    if(data.pointerActive&&distance<radius&&distance>0){const force=(1-distance/radius)*2.4;point.vx+=dx/distance*force;point.vy+=dy/distance*force;}
    point.vx+=(point.homeX-point.x)*.035;point.vy+=(point.homeY-point.y)*.035;point.vx*=.84;point.vy*=.84;point.x+=point.vx;point.y+=point.vy;
    context.fillStyle=colors[point.seed%colors.length];const glyph='CIPHER01#@%+*';context.fillText(glyph[(point.seed+Math.floor(data.time/900+point.seed/3))%glyph.length],point.x,point.y);
  }
}

addEventListener('message',event=>{
  if(event.data.type==='prepare')prepare(event.data);
  else if(event.data.type==='draw')draw(event.data);
});
