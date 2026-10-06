// Скриншоты 7 участков страницы (по фигуре): сначала `python3 -m http.server 8765` в корне репо.
// node tools/walk_v9.js <папка_вывода>
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const out = process.argv[2] + '/';
  const p = await b.newPage({ viewport: {width:1440,height:900}, deviceScaleFactor: 1 });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error' && !/CERT/.test(m.text())) errs.push(m.text().slice(0,300)); });
  await p.goto('http://localhost:8765/v9/', { waitUntil: 'load' }); await p.waitForTimeout(4000);
  const max = await p.evaluate(()=>document.documentElement.scrollHeight - innerHeight);
  for (let i=0;i<7;i++){ await p.evaluate(y=>scrollTo(0,y), Math.round(max*(i+0.45)/7)); await p.waitForTimeout(5000); await p.screenshot({ path: out+'n'+i+'.png' }); }
  console.log(errs); await b.close();
})();
