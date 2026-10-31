const {test}=require('node:test');
const assert=require('node:assert/strict');
const {newDb}=require('pg-mem');
const {chromium}=require('playwright-core');
const {createApp,migrate}=require('../server');

test('browser: register, edit, autosave, reload, plan and sign out',{skip:!process.env.CHROME_BIN},async()=>{
  const {Pool}=newDb().adapters.createPg();const pool=new Pool();await migrate(pool);
  const server=createApp(pool).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true});
    const page=await browser.newPage({viewport:{width:1365,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin);
    await page.locator('#register-tab').click();await page.locator('#auth-name').fill('Test Student');await page.locator('#auth-email').fill('browser@example.test');await page.locator('#auth-password').fill('browser testing password');await page.locator('#auth-submit').click();
    await page.locator('#auth-screen').waitFor({state:'hidden'});
    await page.locator('.nav-link[data-go="calculator"]').click();await page.locator('#add-course').click();
    await page.locator('[data-field="code"]').fill('CSC101');await page.locator('[data-field="grade"]').selectOption('A');
    await page.waitForFunction(()=>document.getElementById('term-gpa').textContent==='5.00');
    await page.waitForFunction(()=>document.getElementById('saved-status').textContent==='Saved to your account');
    await page.reload();await page.locator('#auth-screen').waitFor({state:'hidden'});await page.locator('[data-field="code"]').waitFor();assert.equal(await page.locator('[data-field="code"]').inputValue(),'CSC101');
    await page.locator('.nav-link[data-go="planner"]').click();await page.locator('#target-cgpa').fill('');assert.equal(await page.locator('#required-gpa').innerText(),'—');
    await page.locator('#target-cgpa').fill('4.5');await page.locator('#next-units').fill('20');assert.match(await page.locator('#planner-status').innerText(),/Aim for at least/);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    const nav=await page.locator('.nav-link').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,bottom:n.getBoundingClientRect().bottom})));
    assert.ok(nav.every(n=>Math.abs(n.y-nav[0].y)<2&&n.bottom<=844));
    assert.ok(nav.every((n,i)=>i===0||n.x>nav[i-1].x));
    if(process.env.UI_SCREENSHOT)await page.screenshot({path:process.env.UI_SCREENSHOT,fullPage:true});
    await page.locator('#sign-out').click();await page.locator('#auth-screen').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('auth-submit').disabled);
    await page.locator('#register-tab').click();await page.locator('#auth-name').fill('Other Student');await page.locator('#auth-email').fill('other-browser@example.test');await page.locator('#auth-password').fill('other browser password');await page.locator('#auth-submit').click();await page.locator('#auth-screen').waitFor({state:'hidden'});
    assert.equal(await page.locator('#stat-courses').innerText(),'0');assert.deepEqual(errors,[]);
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await pool.end();}
});
