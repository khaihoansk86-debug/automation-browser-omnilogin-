import { OmniLogin } from '@omnilogin/sdk';

async function main() {
  const omni = new OmniLogin({ host: 'http://localhost:35353', timeout: 60_000 });
  const profileId = 37; // Profile 1

  console.log(`Opening profile ${profileId}...`);
  const { session } = await omni.open(profileId, { headless: false });

  try {
    const page = session.page;
    console.log('Navigating to https://www.facebook.com/...');
    await page.goto('https://www.facebook.com/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    
    // Wait for page to render
    await page.waitForTimeout(5000);

    const url = await page.url();
    console.log(`Current URL: ${url}`);

    // Let's inspect all elements matching [type="submit"]
    const submitsInfo = await page.evaluate(() => {
      const elList = Array.from(document.querySelectorAll('[type="submit"]'));
      return elList.map((el, idx) => {
        return {
          index: idx,
          tagName: el.tagName,
          id: el.id,
          name: el.name,
          className: el.className,
          outerHTML: el.outerHTML,
          isVisible: el.offsetWidth > 0 && el.offsetHeight > 0,
          display: window.getComputedStyle(el).display,
          parentId: el.parentElement ? el.parentElement.tagName + '#' + el.parentElement.id : 'none'
        };
      });
    });

    console.log(`Found ${submitsInfo.length} elements matching [type="submit"]:`);
    console.log(JSON.stringify(submitsInfo, null, 2));

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(console.error);
  }
}

main().catch(console.error);
