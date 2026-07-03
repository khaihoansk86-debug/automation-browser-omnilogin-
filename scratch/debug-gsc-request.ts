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
  const omni = new OmniLogin({ host: process.env.OMNILOGIN_HOST || 'http://localhost:35353', timeout: 120000 });
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
    
    // Focus and fill value
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

    // Locate Request Indexing button
    const requestBtnSelector = 'div[role="button"]:has-text("Request indexing"), div[role="button"]:has-text("Yêu cầu lập chỉ mục")';
    const requestBtn = page.locator(requestBtnSelector).first();
    
    if (await requestBtn.count() > 0) {
      console.log('Request Indexing button found. Clicking it...');
      await requestBtn.click();
      
      console.log('Clicked! Waiting for live test / indexing submit dialog to finish (max 2.5 minutes)...');
      // Wait for the popup modal "Testing if live URL can be indexed..."
      // Let's wait in 10-second increments and print the page snippet or logs
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(10000);
        console.log(`Waiting... ${ (i + 1) * 10 } seconds elapsed.`);
        
        // Check if confirmation popup or "Got it" button is visible
        const gotItBtnSelector = 'span:has-text("Got it"), span:has-text("Đã hiểu"), button:has-text("Got it"), button:has-text("Đã hiểu"), div[role="button"]:has-text("Got it"), div[role="button"]:has-text("Đã hiểu")';
        const gotItBtn = page.locator(gotItBtnSelector).first();
        if (await gotItBtn.count() > 0 && await gotItBtn.isVisible()) {
          console.log('"Got it" button is now visible! Breaking wait.');
          break;
        }
      }

      // Take screenshot of modal/result
      const screenshotPath = path.join(process.cwd(), 'scratch', 'gsc-submit-result.png');
      await page.screenshot({ path: screenshotPath });
      console.log(`Submit screenshot saved to ${screenshotPath}`);

      // Let's dump dialog text and buttons
      const dialogInfo = await page.evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        return dialogs.map(d => ({
          text: (d.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 1000),
          buttons: Array.from(d.querySelectorAll('button, div[role="button"]')).map(b => (b.textContent || '').trim())
        }));
      });
      console.log('Detected Dialogs:', JSON.stringify(dialogInfo, null, 2));

      // Click Got it if present
      const gotItBtnSelector = 'span:has-text("Got it"), span:has-text("Đã hiểu"), button:has-text("Got it"), button:has-text("Đã hiểu"), div[role="button"]:has-text("Got it"), div[role="button"]:has-text("Đã hiểu")';
      const gotItBtn = page.locator(gotItBtnSelector).first();
      if (await gotItBtn.count() > 0) {
        console.log('Clicking "Got it" to close the dialog...');
        await gotItBtn.click();
        await page.waitForTimeout(3000);
      }
    } else {
      console.error('Request Indexing button NOT found!');
    }

  } catch (err: any) {
    console.error('Error during GSC inspection:', err.message || err);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(() => {});
  }
}

main().catch(console.error);
