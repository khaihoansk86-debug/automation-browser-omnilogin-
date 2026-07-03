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

    const clickableElements = await page.evaluate(() => {
      // Find all elements that might be the login button
      const allEls = Array.from(document.querySelectorAll('*'));
      const candidates = [];
      
      allEls.forEach(el => {
        const text = (el.textContent || '').trim();
        const role = el.getAttribute('role');
        const ariaLabel = el.getAttribute('aria-label');
        const isClickable = el.onclick || el.getAttribute('role') === 'button' || el.tagName === 'BUTTON' || el.tagName === 'A';
        
        const hasLoginText = text === 'Đăng nhập' || text === 'Log In' || ariaLabel === 'Đăng nhập' || ariaLabel === 'Log In';
        const hasLoginClass = String(el.className).includes('login') || String(el.id).includes('login');
        
        if (hasLoginText || (isClickable && (hasLoginClass || text.includes('Đăng nhập') || text.includes('Log In')))) {
          // Check visibility
          const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
          if (isVisible) {
            candidates.push({
              tagName: el.tagName,
              id: el.id,
              className: el.className,
              text: text.substring(0, 50),
              role: role,
              ariaLabel: ariaLabel,
              outerHTML: el.outerHTML.substring(0, 200),
              parentId: el.parentElement ? el.parentElement.tagName + '#' + el.parentElement.id : 'none'
            });
          }
        }
      });
      return candidates;
    });

    console.log('Visible login button candidates:');
    console.log(JSON.stringify(clickableElements, null, 2));

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(console.error);
  }
}

main().catch(console.error);
