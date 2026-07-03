import { OmniLogin } from '@omnilogin/sdk';

async function main() {
  const omni = new OmniLogin({ host: 'http://localhost:35353', timeout: 60_000 });
  const profileId = 37;

  console.log(`Opening profile ${profileId}...`);
  const { session } = await omni.open(profileId, { headless: false });

  try {
    const page = session.page;
    console.log('Navigating to https://www.facebook.com/?locale=vi_VN...');
    await page.goto('https://www.facebook.com/?locale=vi_VN', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const url = await page.url();
    console.log(`Current URL: ${url}`);

    const elements = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, button')).map(el => {
        return {
          tagName: el.tagName,
          id: el.id,
          name: el.name,
          type: el.type,
          className: el.className,
          value: el.value,
          text: el.textContent,
          placeholder: el.placeholder,
          isVisible: el.offsetWidth > 0 && el.offsetHeight > 0
        };
      });
      return inputs;
    });

    console.log('Inputs & Buttons found on page:');
    console.log(JSON.stringify(elements, null, 2));

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(console.error);
  }
}

main().catch(console.error);
