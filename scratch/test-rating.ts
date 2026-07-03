import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from '../src/config.js';

async function main() {
  const omni = new OmniLogin({ host: appConfig.omniloginHost, timeout: 60_000 });
  const profileId = 37;
  console.log(`Opening Profile ${profileId}...`);
  const { session } = await omni.open(profileId, { headless: false });
  try {
    const page = session.page;
    const url = 'https://khaihoanderma.com/product/azemix-body-lotion-kem-duong-trang-da-mo-tham-duong-am-chuyen-sau/';
    console.log(`Going to: ${url}`);
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    console.log('Clicking review tab...');
    await page.evaluate(() => {
      const tab = document.querySelector('#tab-title-reviews a') as HTMLElement;
      if (tab) tab.click();
    });
    await page.waitForTimeout(2000);

    console.log('Clicking star-5...');
    await page.locator('.stars a.star-5').click();
    await page.waitForTimeout(1000);

    const selectValue = await page.locator('select#rating').inputValue();
    console.log('Select rating value after clicking star-5:', selectValue);

  } catch (err) {
    console.error(err);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(() => {});
  }
}

main().catch(console.error);
