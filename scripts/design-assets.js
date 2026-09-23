import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const lines=[];
for(let x=-200;x<1800;x+=15){let d='';for(let y=0;y<=1100;y+=10){const wave=Math.sin(y/190+x/260)*90+Math.sin(y/100-x/160)*27;d+=`${y===0?'M':'L'}${(x+wave).toFixed(1)},${y} `;}lines.push(`<path d="${d}"/>`);}
await writeFile('public/images/contours.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1100" fill="none"><g stroke="#2a7343" stroke-width=".65" opacity=".5">${lines.join('')}</g></svg>`);
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#050a07"/><rect x="40" y="40" width="1120" height="550" fill="none" stroke="#294832"/><text x="90" y="135" fill="#40ff83" font-size="20" font-family="monospace">STUDENT-LED. FUTURE-FOCUSED.</text><text x="80" y="345" fill="#40ff83" font-size="180" font-weight="bold" font-family="monospace">CIPHER</text><text x="90" y="435" fill="#d9f0df" font-size="28" font-family="sans-serif">Computer Science &amp; Engineering</text><text x="90" y="480" fill="#a0b6a7" font-size="24" font-family="sans-serif">St. Joseph Engineering College · Mangaluru</text></svg>`;
await sharp(Buffer.from(svg)).png().toFile('public/images/social-card.png');
