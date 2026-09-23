let canvas,context,width=0,height=0,ratio=1,compact=false;

function resize(data){
  width=data.width;height=data.height;ratio=data.ratio;compact=data.compact;
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  context.setTransform(ratio,0,0,ratio,0,0);
}

function draw(data){
  if(!context||!width||!height)return;
  context.clearRect(0,0,width,height);
  const scale=width/1920,spacing=Math.max(compact?14:10,width/(compact?85:110)),rowStep=compact?32:26;
  for(let line=-12;line<width/spacing+12;line++){
    const base=line*spacing;context.beginPath();
    for(let y=-40;y<=height+40;y+=rowStep){
      const phase=(y+data.scroll*.19)/(Math.max(width,800)*.17)+data.time*.000075;
      const broad=Math.sin(phase+base/width*5)*Math.sin(base/width*7+1.2)*120*scale;
      const tight=(Math.sin(phase*2.8+base/width*9)*24+Math.asin(Math.sin(phase*2.1+base/width*6))*21)*scale;
      let x=base+broad+tight;
      const distance=Math.hypot(x-data.pointerX,y-data.pointerY),radius=Math.max(130,width*.13);
      if(data.pointerActive&&distance<radius)x+=(x-data.pointerX)*Math.pow(1-distance/radius,2)*.52;
      if(y===-40)context.moveTo(x,y);else context.lineTo(x,y);
    }
    context.strokeStyle=line%5===0?'rgba(40,183,100,.38)':'rgba(50,143,109,.43)';
    context.lineWidth=line%9===0?.9:.65;context.stroke();
  }
}

addEventListener('message',event=>{
  if(event.data.type==='init'){canvas=event.data.canvas;context=canvas.getContext('2d');resize(event.data);}
  else if(event.data.type==='resize')resize(event.data);
  else if(event.data.type==='draw')draw(event.data);
});
