import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from '../config.js';
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

  async function openProfileSafely(omni: OmniLogin, id: number) {
    try {
      return await omni.open(id, { headless: false });
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('already') || errMsg.includes('openned') || errMsg.includes('open')) {
        console.log(`Profile ${id} browser is already open. Closing and retrying in 3s...`);
        await omni.close(id).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 3000));
        return await omni.open(id, { headless: false });
      }
      throw err;
    }
  }

  const { session } = await openProfileSafely(omni, profileId);
  try {
    const page = session.page;
    const gscUrl = 'https://search.google.com/u/0/search-console?resource_id=https%3A%2F%2Fkhaihoanderma.com%2F';
    console.log(`Navigating to GSC: ${gscUrl}`);
    await page.goto(gscUrl, { timeout: 45000, waitUntil: 'domcontentloaded' });
    
    // Wait for the inspect URL search input
    console.log('Waiting for search input...');
    const searchSelector = 'input[placeholder*="Inspect"], input[placeholder*="Kiểm tra"], input[aria-label*="Inspect"], input[aria-label*="Kiểm tra"]';
    await page.locator(searchSelector).first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(5000);

    const screenshotPath = path.join(process.cwd(), 'scratch', 'gsc-overview.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Dump interesting HTML structures
    const inputHtml = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea, [role="search"]'));
      return inputs.map(el => ({
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        role: el.getAttribute('role') || ''
      }));
    });
    console.log('Detected inputs:', JSON.stringify(inputHtml, null, 2));

  } catch (err: any) {
    console.error('Error during GSC inspection:', err.message || err);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(() => {});
  }
}

main().catch(console.error);
