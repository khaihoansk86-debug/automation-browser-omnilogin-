import { OmniLogin } from '@omnilogin/sdk';

async function main() {
  const omni = new OmniLogin({ host: 'http://localhost:35353', timeout: 60_000 });
  const profileId = 37; // Profile 1

  console.log(`Opening profile ${profileId}...`);
  const { session } = await omni.open(profileId, { headless: false });

  try {
    const page = session.page;
    console.log('Navigating to https://myaccount.google.com/...');
    await page.goto('https://myaccount.google.com/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    
    // Wait a bit for dynamic content
    await page.waitForTimeout(5000);

    const title = await page.title();
    const url = await page.url();
    console.log(`Page Title: ${title}`);
    console.log(`Page URL: ${url}`);

    // Let's check page.content() for gmail
    const content = await page.content();
    const emailRegex = /[a-zA-Z0-9._%+-]+@gmail\.com/g;
    const contentMatches = content.match(emailRegex);
    console.log('Emails found in page source:', contentMatches);

    // Let's evaluate elements that contain text with @gmail.com
    const extractedEmail = await page.evaluate(() => {
      // Look for any elements containing text with @gmail.com
      const emailRegex = /[a-zA-Z0-9._%+-]+@gmail\.com/;
      
      // Let's check elements that commonly display account info
      const elements = Array.from(document.querySelectorAll('*'));
      for (const el of elements) {
        // Only leaf elements or elements with direct text
        if (el.children.length === 0 && el.textContent) {
          const match = el.textContent.match(emailRegex);
          if (match) return match[0];
        }
      }
      
      // Search all elements textContent
      const match = document.body.innerText.match(emailRegex);
      if (match) return match[0];
      
      return null;
    });

    console.log('Extracted email from page:', extractedEmail);

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(console.error);
  }
}

main().catch(console.error);
