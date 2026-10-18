const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page = await browser.newPage({viewport:{width:412,height:915},serviceWorkers:'block'});
 const errors=[]; page.on('pageerror', e => errors.push(e.message));
 const saved = new Set();
 await page.route('https://api.wanikani.com/v2/**', async route => {
   const path = new URL(route.request().url()).pathname; let data;
   if (path.endsWith('/user')) data={id:42,username:'fixture',preferences:{}};
   else if (path.endsWith('/assignments')) data=Array.from({length:12},(_,i)=>({id:i+1,data:{subject_id:i+1,srs_stage:1,available_at:'2020-01-01T00:00:00Z'}})).filter(a=>!saved.has(a.id));
   else if (path.endsWith('/subjects')) data=Array.from({length:12},(_,i)=>({id:i+1,object:'radical',data:{characters:'一',meanings:[{meaning:'one',accepted_answer:true}]}}));
   else if (path.endsWith('/study_materials')) data=[];
   else if (path.endsWith('/reviews')) {
     const payload=JSON.parse(route.request().postData()).review;
     assert.ok(!saved.has(payload.subject_id),'must not save a review twice');
     saved.add(payload.subject_id); data={};
   } else throw new Error(path);
   await route.fulfill({json:{data}});
 });
 await page.goto('http://localhost:4173');
 await page.locator('#api-token').fill('fixture-token'); await page.locator('#login-btn').click();
 await page.getByRole('button',{name:'Do 10 reviews',exact:true}).focus();
 await page.keyboard.press('Enter');
 await page.locator('#answer-input').waitFor();
 assert.equal(await page.locator('#progress').textContent(),'0/10 completed');
 const labelColor = await page.locator('#task-mode-label').evaluate(e=>getComputedStyle(e).color);
 assert.equal(await page.locator('#answer-input').evaluate(e=>getComputedStyle(e).borderTopColor),labelColor);
 assert.equal(await page.locator('#task-mode-label').textContent(),'Radical Name');
 for(let i=0;i<10;i++) {
   await page.locator('#answer-input').fill('one'); await page.locator('#submit-btn').click(); await page.locator('#result-primary-btn').click();
 }
 await page.getByRole('button',{name:'Do another 2',exact:true}).waitFor();
 assert.equal(saved.size,10);
 await page.keyboard.press('Enter');
 await page.locator('#answer-input').fill('wrong'); await page.locator('#submit-btn').click(); await page.locator('#result-primary-btn').click();
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('takashika_reviews_42')));
 assert.equal(progress[0].incorrectMeaningAnswers,1);
 page.on('dialog', d=>d.accept());
 await page.reload(); await page.locator('#quick-btn').click();
 await page.locator('#pause-btn').click();
 assert.equal(await page.locator('#home-screen').isVisible(),true);
 await page.locator('#all-reviews-btn').click();
 for(let i=0;i<2;i++) {
   await page.locator('#answer-input').fill('one'); await page.locator('#submit-btn').click(); await page.locator('#result-primary-btn').click();
 }
 await page.getByText('Session complete!',{exact:true}).waitFor();
 assert.equal(saved.size,12); assert.equal(await page.locator('#another-batch-btn').isVisible(),false);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('takashika_reviews_42'))),[]);
 await page.screenshot({path:'/tmp/takashika-android-complete.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: ten-item batches, remainder, Enter default, radical colors, persistent mistakes, pause/resume, full reviews, no duplicate saves.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
