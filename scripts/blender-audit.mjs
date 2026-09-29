import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire('file:///C:/Users/xianyv/.workbuddy/binaries/node/workspace/')
const puppeteer = require('puppeteer-core')
const browser = await puppeteer.launch({ executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true, args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] })
const base='http://127.0.0.1:5173/scripts/model-export/blender-preview.html'
const results=[], errors=[]
try {
 const page=await browser.newPage()
 page.setDefaultTimeout(90000)
 page.on('pageerror',e=>errors.push(String(e)))
 await page.setViewport({width:1440,height:1000})
 await page.goto(base,{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>window.testState?.room.value)
 const ready=()=>page.waitForFunction(()=>window.testState?.room.value?.diagnostics().assetSource==='blender-glb' && !window.testState.room.value.diagnostics().loading)
 const diagnostic=()=>page.evaluate(()=>window.testState.room.value.diagnostics())
 for(const theme of ['room','corridor','dining','nursing','rehab']){
  await page.evaluate(t=>window.testState.theme.value=t,theme)
  await ready()
  await page.waitForFunction(()=>window.testState.room.value.diagnostics().triangles>0)
  const d=await diagnostic()
  if(d.assetError||!d.pickables.length||d.actors<1)throw new Error('Model/actor/picking contract failed '+theme)
  results.push({test:'theme',theme,source:d.assetSource,actors:d.actors,triangles:d.triangles,calls:d.calls,pickables:d.pickables.length})
  await page.screenshot({path:`outputs/blender-models/${theme}-preview.png`})
 }
 await page.evaluate(()=>{window.testState.theme.value='room';window.testState.empty.value=true})
 await ready()
 if((await diagnostic()).actors!==0)throw new Error('Empty room generated actor')
 results.push({test:'empty-room',ok:true})
 await page.evaluate(()=>window.testState.empty.value=false)
 await ready()
 await page.click('.model-toolbar button:nth-child(2)')
 const paused=await diagnostic()
 await page.waitForFunction(()=>window.testState.room.value.diagnostics().paused)
 if(!paused.paused)throw new Error('Pause toggle failed')
 await page.click('.model-toolbar button:nth-child(3)')
 if(!(await diagnostic()).skeleton)throw new Error('Skeleton failed')
 results.push({test:'pause-skeleton',ok:true})
 // Click projected semantic mesh centres and verify at least one facility hit.
 await page.click('.model-toolbar button:nth-child(3)')
 const items=(await diagnostic()).pickables.filter(p=>/床|柜|按钮/.test(p.name))
 let picked=false
 for(const p of items){
  if(p.x<.05||p.x>.95||p.y<.20||p.y>.85)continue
  await page.mouse.click(p.x*1440,p.y*1000)
  try {await page.waitForSelector('.detail',{timeout:1500});picked=true;break}catch{}
 }
 if(!picked)throw new Error('Could not select GLB facility')
 results.push({test:'glb-pick',ok:true,name:await page.$eval('.detail b',e=>e.textContent)})
 await page.setViewport({width:375,height:812})
 await page.evaluate(()=>window.testState.room.value.resetView())
 await page.waitForFunction(()=>document.querySelector('canvas')?.clientWidth===375)
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
 if(overflow)throw new Error('Mobile overflow')
 await page.screenshot({path:'outputs/blender-models/room-mobile.png'})
 results.push({test:'mobile',overflow})
 // In-flight loads must not replace the last requested theme.
 await page.evaluate(async()=>{for(const t of ['dining','rehab','nursing','corridor','room']){window.testState.theme.value=t;await new Promise(r=>requestAnimationFrame(r))}})
 await ready()
 if(!(await diagnostic()).assetUrl.endsWith('care-room.glb'))throw new Error('Stale async model won race')
 results.push({test:'rapid-theme-switch',ok:true})
 const fallback=await browser.newPage()
 await fallback.setRequestInterception(true)
 fallback.on('request',r=>r.url().endsWith('.glb')?r.abort():r.continue())
 await fallback.goto(base,{waitUntil:'domcontentloaded'})
 await fallback.waitForFunction(()=>window.testState?.room.value?.diagnostics().assetError)
 const fd=await fallback.evaluate(()=>window.testState.room.value.diagnostics())
 if(fd.assetSource!=='procedural'||fd.loading||fd.actors!==2)throw new Error('GLB fallback failed')
 results.push({test:'asset-failure-fallback',ok:true})
 await fallback.close()
} catch(e){ errors.push(String(e)) } finally {await browser.close()}
fs.writeFileSync('outputs/blender-models/browser-audit.json',JSON.stringify({results,errors},null,2))
console.log(JSON.stringify({results,errors},null,2));process.exitCode=errors.length?1:0
