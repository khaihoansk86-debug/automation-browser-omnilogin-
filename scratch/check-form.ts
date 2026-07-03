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

    console.log('Inspecting .comment-form-rating HTML:');
    const ratingHtml = await page.evaluate(() => {
      const ratingDiv = document.querySelector('.comment-form-rating');
      return ratingDiv ? ratingDiv.innerHTML : 'Not found';
    });
    console.log(ratingHtml);

    console.log('Inspecting stars selectors:');
    const starsInfo = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('.comment-form-rating *'));
      return elements.map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        text: el.textContent?.trim()
      }));
    });
    console.log(JSON.stringify(starsInfo, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(() => {});
  }
}

main().catch(console.error);
