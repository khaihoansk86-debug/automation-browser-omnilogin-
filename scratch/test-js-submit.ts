import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from '../src/config.js';

async function main() {
  const omni = new OmniLogin({ host: appConfig.omniloginHost, timeout: 60_000 });
  const profileId = 37;
  const { session } = await omni.open(profileId, { headless: false });
  try {
    const page = session.page;
    const url = 'https://khaihoanderma.com/product/azemix-body-lotion-kem-duong-trang-da-mo-tham-duong-am-chuyen-sau/';
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    console.log('Clicking review tab...');
    await page.evaluate(() => {
      const tab = document.querySelector('#tab-title-reviews a') as HTMLElement;
      if (tab) tab.click();
      const tabLi = document.querySelector('#tab-title-reviews') as HTMLElement;
      if (tabLi) tabLi.click();
    });
    await page.waitForTimeout(2000);

    console.log('Clicking star-5 via JS...');
    await page.evaluate(() => {
      const star5 = document.querySelector('.stars a.star-5') as HTMLElement;
      if (star5) {
        star5.click();
        star5.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1000);

    const reviewText = "Sản phẩm xài cực kỳ êm da, dưỡng ẩm tốt và không hề gây bết rít hay mụn ẩn.";
    const name = "Trần Minh Quang";
    const email = `khaihoan.review.test.${Date.now()}@gmail.com`;

    console.log('Filling form fields...');
    await page.locator('textarea#comment').fill(reviewText);
    await page.locator('input#author').fill(name);
    await page.locator('input#email').fill(email);
    await page.waitForTimeout(1000);

    console.log('Submitting review...');
    await page.locator('#submit').click();
    await page.waitForTimeout(6000);

    const currentUrl = await page.url();
    console.log('Current URL after submit:', currentUrl);

    const commentValue = await page.locator('textarea#comment').inputValue().catch(() => '');
    console.log('Comment value after submit:', commentValue ? 'STILL FILLED (failed)' : 'CLEARED (success)');

  } catch (err) {
    console.error(err);
  } finally {
    await omni.close(profileId).catch(() => {});
  }
}

main().catch(console.error);
