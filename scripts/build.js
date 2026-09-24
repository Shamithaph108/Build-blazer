import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['public/community.css','public/community.js','public/styles.css','public/site.js','public/admin.js','public/reference.css','public/reference.js','public/visual.css','public/visual.js','public/premium.css','public/premium.js','public/stack-gallery.js','public/carousel.css','public/carousel.js'],outdir:'dist',bundle:true,minify:true,target:['es2020'],legalComments:'none',external:['/images/*','/fonts/*']});
await writeFile('dist/version.txt',Date.now().toString(36));
console.log('Production CSS and JavaScript built. Server renders accessible HTML at request time.');
