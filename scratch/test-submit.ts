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
      const tabLi = document.querySelector('#tab-title-reviews') as HTMLElement;
      if (tabLi) tabLi.click();
    });
    await page.waitForTimeout(2000);

    console.log('Clicking star-5...');
    await page.locator('.stars a.star-5').click();
    await page.waitForTimeout(1000);

    const reviewText = "Sản phẩm dùng rất thích, mướt da mịn màng cực kỳ. Mua lần thứ 2 rồi vẫn rất hài lòng.";
    const name = "Trần Minh Quang";
    const email = `khaihoan.test.${Date.now()}@gmail.com`;

    console.log('Filling comment...');
    await page.locator('textarea#comment').fill(reviewText);

    console.log('Filling author...');
    await page.locator('input#author').fill(name);

    console.log('Filling email...');
    await page.locator('input#email').fill(email);

    await page.waitForTimeout(1500);

    console.log('Clicking submit...');
    await page.locator('#submit').click();
    await page.waitForTimeout(6000);

    const currentUrl = await page.url();
    console.log('Current URL after submit:', currentUrl);

    const commentValue = await page.locator('textarea#comment').inputValue().catch(() => '');
    console.log('Comment field value after submit:', commentValue ? 'STILL FILLED' : 'CLEARED/EMPTY');

  } catch (err) {
    console.error(err);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(() => {});
  }
}

main().catch(console.error);
