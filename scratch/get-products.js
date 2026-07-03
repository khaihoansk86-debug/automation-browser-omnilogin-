import { OmniLogin } from '@omnilogin/sdk';

async function main() {
  const omni = new OmniLogin({ host: 'http://localhost:35353', timeout: 60_000 });
  const profileId = 37;

  console.log(`Opening profile ${profileId}...`);
  const { session } = await omni.open(profileId, { headless: false });

  try {
    const page = session.page;
    console.log('Navigating to https://khaihoanderma.com/...');
    await page.goto('https://khaihoanderma.com/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const productLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map(a => a.href)
        .filter(href => href.includes('/san-pham/') || href.includes('/product/'))
        .filter((href, idx, self) => self.indexOf(href) === idx);
    });

    console.log(`Found ${productLinks.length} product links:`);
    console.log(productLinks);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(console.error);
  }
}

main().catch(console.error);
