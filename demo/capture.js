const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'frames');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

const HTML = 'file://' + path.join(__dirname, 'demo.html');

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function waitForAnim(page) {
    // Wait for animation to settle (no more animReq ticks)
    await page.waitForFunction(() => {
        return new Promise(resolve => {
            let last = null;
            function check() {
                const vb = document.getElementById('dag-svg').getAttribute('viewBox');
                if (vb === last) return resolve(true);
                last = vb;
                setTimeout(check, 60);
            }
            setTimeout(check, 80);
        });
    }, { timeout: 3000 });
    await sleep(80);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 900, height: 560 });
    await page.goto(HTML, { waitUntil: 'networkidle' });
    await sleep(400);

    let frame = 0;
    async function shot(repeat) {
        const fname = path.join(OUT_DIR, `f${String(frame).padStart(4,'0')}.png`);
        await page.screenshot({ path: fname });
        // Duplicate frames to control timing in the GIF
        for (let i = 1; i < (repeat || 1); i++) {
            const copy = path.join(OUT_DIR, `f${String(frame + i).padStart(4,'0')}.png`);
            fs.copyFileSync(fname, copy);
        }
        frame += (repeat || 1);
    }

    // ── Scene 1: full graph (hold 2s) ──
    await page.evaluate(() => window.setStatus('Full graph — all 21 models across 5 layers'));
    await shot(20); // 20 × 100ms = 2s

    // ── Scene 2: open fct_orders ──
    await page.evaluate(() => {
        window.setStatus('Opening fct_orders.sql …');
        window.highlightNode('fct_orders');
    });
    // Capture animation frames (480ms)
    for (let t = 0; t < 10; t++) { await sleep(55); await shot(1); }
    await waitForAnim(page);
    await page.evaluate(() => window.setStatus('fct_orders selected — parents & children highlighted'));
    await shot(25); // hold 2.5s

    // ── Scene 3: switch to dim_customers ──
    await page.evaluate(() => {
        window.setStatus('Switching to dim_customers.sql …');
        window.highlightNode('dim_customers');
    });
    for (let t = 0; t < 10; t++) { await sleep(55); await shot(1); }
    await waitForAnim(page);
    await page.evaluate(() => window.setStatus('dim_customers selected — upstream & downstream visible'));
    await shot(25);

    // ── Scene 4: switch to mrt_orders ──
    await page.evaluate(() => {
        window.setStatus('Switching to mrt_orders.sql …');
        window.highlightNode('mrt_orders');
    });
    for (let t = 0; t < 10; t++) { await sleep(55); await shot(1); }
    await waitForAnim(page);
    await page.evaluate(() => window.setStatus('mrt_orders selected — 2 parents visible'));
    await shot(22);

    // ── Scene 5: zoom back out to full graph ──
    await page.evaluate(() => {
        window.setStatus('Double-click canvas → fit all models');
        window.fitView();
        // Clear highlight
        setTimeout(function() { window.highlightNode(null); }, 60);
    });
    for (let t = 0; t < 10; t++) { await sleep(55); await shot(1); }
    await waitForAnim(page);
    await page.evaluate(() => window.setStatus('Full graph view — open a model file to focus'));
    await shot(18);

    await browser.close();
    console.log('Captured ' + frame + ' frames to ' + OUT_DIR);
})();
