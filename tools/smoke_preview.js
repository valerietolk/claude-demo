// Проверка собранного превью: node tools/smoke_preview.js <папка с claude-seven.html> -> art9.png + ошибки
const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
(async () => {
  const d = path.resolve(process.argv[2]);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: {width:1280,height:800} });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({body: fs.readFileSync(path.resolve(__dirname,'../vendor/three.min.js')), contentType:'application/javascript'}));
  await p.goto('file://'+d+'/claude-seven.html'); await p.waitForTimeout(3000);
  await p.evaluate(()=>scrollTo(0, document.documentElement.scrollHeight*0.12)); await p.waitForTimeout(4000);
  await p.screenshot({path: d+'/art9.png'});
  console.log('errors:', errs, 'sections:', await p.evaluate(()=>document.querySelectorAll('#content section').length));
  await b.close();
})();
