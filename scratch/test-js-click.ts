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

    await page.evaluate(() => {
      const tab = document.querySelector('#tab-title-reviews a') as HTMLElement;
      if (tab) tab.click();
    });
    await page.waitForTimeout(2000);

    console.log('Clicking star-5 using JS click in evaluate...');
    await page.evaluate(() => {
      const star5 = document.querySelector('.stars a.star-5') as HTMLElement;
      if (star5) {
        // Try multiple ways to trigger the click
        star5.click();
        star5.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(1000);

    const checkResult = await page.evaluate(() => {
      const select = document.querySelector('select#rating') as HTMLSelectElement;
      const selectVal = select ? select.value : 'select not found';
      
      const star5 = document.querySelector('.stars a.star-5');
      const star5Class = star5 ? star5.className : 'star-5 not found';
      const star5Checked = star5 ? star5.getAttribute('aria-checked') : 'N/A';

      return {
        selectVal,
        star5Class,
        star5Checked
      };
    });

    console.log('DOM State after JS click:', JSON.stringify(checkResult, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await omni.close(profileId).catch(() => {});
  }
}

main().catch(console.error);
