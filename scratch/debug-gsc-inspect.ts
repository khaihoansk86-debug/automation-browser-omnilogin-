import { OmniLogin } from '@omnilogin/sdk';
import fs from 'fs';
import path from 'path';

// Simple env loader
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  const omni = new OmniLogin({ host: process.env.OMNILOGIN_HOST || 'http://localhost:35353', timeout: 60000 });
  const profileId = 37;

  console.log(`Opening Profile ${profileId}...`);
  const openProfileSafely = async (id: number) => {
    try {
      return await omni.open(id, { headless: false });
    } catch (err: any) {
      console.log(`Open failed: ${err.message}. Retrying...`);
      await omni.close(id).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 3000));
      return await omni.open(id, { headless: false });
    }
  };

  const { session } = await openProfileSafely(profileId);
  try {
    const page = session.page;
    const gscUrl = 'https://search.google.com/u/0/search-console?resource_id=https%3A%2F%2Fkhaihoanderma.com%2F';
    console.log(`Navigating to GSC: ${gscUrl}`);
    await page.goto(gscUrl, { timeout: 45000, waitUntil: 'domcontentloaded' });

    console.log('Waiting for search input...');
    const searchSelector = 'input[aria-label*="Inspect any URL"], input[aria-label*="Kiểm tra mọi URL"]';
    const input = page.locator(searchSelector).first();
    await input.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(2000);

    const testUrl = 'https://khaihoanderma.com/product/md-care-mandelic-5-gel-cleanser-sua-rua-mat-lam-sach-diu-nhe-voi-mandelic-acid-5/';
    console.log(`Typing test URL: ${testUrl}`);
    
    // Focus and fill value using javascript to bypass typing issues
    console.log('Focusing input...');
    await input.click();
    await page.waitForTimeout(1000);
    
    console.log(`Setting input value to: ${testUrl}`);
    await page.evaluate(({ selector, value }) => {
      const el = document.querySelector(selector) as HTMLInputElement;
      if (el) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { selector: searchSelector, value: testUrl });

    await page.waitForTimeout(1000);
    console.log('Pressing Enter...');
    await input.press('Enter');

    console.log('Pressed Enter. Waiting for inspection results page...');
    // GSC inspection page usually takes 10-30 seconds to load and retrieve data
    await page.waitForTimeout(15000);

    // Take screenshot
    const screenshotPath = path.join(process.cwd(), 'scratch', 'gsc-inspect-result.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Let's dump text elements and buttons
    const pageInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"]'));
      const text = document.body.innerText;
      return {
        textSnippet: text.substring(0, 1000),
        buttons: buttons.map(el => ({
          tagName: el.tagName,
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 100),
          className: el.className,
          role: el.getAttribute('role') || ''
        })).filter(b => b.text.length > 0)
      };
    });

    console.log('Page Text Snippet:', pageInfo.textSnippet);
    console.log('Detected Buttons:', JSON.stringify(pageInfo.buttons, null, 2));

  } catch (err: any) {
    console.error('Error during GSC inspection:', err.message || err);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(() => {});
  }
}

main().catch(console.error);
