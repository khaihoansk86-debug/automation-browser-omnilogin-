import { OmniLogin } from '@omnilogin/sdk';

async function main() {
  const omni = new OmniLogin({ host: 'http://localhost:35353', timeout: 60_000 });

  console.log('Fetching all profiles...');
  const result = await omni.profiles.list({ page: 1, pageSize: 100 });
  const profiles = result.docs;
  console.log(`Found ${profiles.length} profiles to process.`);

  // Let's sort profiles by ID to process them in order
  profiles.sort((a, b) => a.id - b.id);

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const profileId = profile.id;
    const profileName = profile.name;

    console.log(`\n===========================================`);
    console.log(`[${i + 1}/${profiles.length}] Processing Profile ${profileName} (ID: ${profileId})...`);

    let session;
    let email = null;
    let success = false;

    try {
      console.log(`Opening profile ${profileId}...`);
      const openResult = await omni.open(profileId, { headless: false });
      session = openResult.session;

      const page = session.page;
      console.log('Navigating to https://myaccount.google.com/...');
      
      // Navigate to myaccount
      await page.goto('https://myaccount.google.com/', { timeout: 25000, waitUntil: 'domcontentloaded' });
      
      // Wait for any redirects or dynamic rendering
      await page.waitForTimeout(3000);

      const url = await page.url();
      console.log(`Current URL: ${url}`);

      if (url.includes('myaccount.google.com')) {
        const content = await page.content();
        const emailRegex = /[a-zA-Z0-9._%+-]+@gmail\.com/gi;
        const matches = content.match(emailRegex);
        
        if (matches && matches.length > 0) {
          const cleanEmails = matches
            .map(m => m.toLowerCase())
            .filter(m => !m.includes('template') && !m.includes('example'));
          
          if (cleanEmails.length > 0) {
            // Get the first unique match
            email = cleanEmails[0];
          }
        }

        // Fallback or validation via page evaluate
        if (!email) {
          const evalEmail = await page.evaluate(() => {
            const regex = /[a-zA-Z0-9._%+-]+@gmail\.com/i;
            const match = document.body.innerText.match(regex);
            return match ? match[0] : null;
          });
          if (evalEmail) {
            email = evalEmail.toLowerCase();
          }
        }
      } else {
        console.log('Not logged in (redirected to another page).');
      }

      success = true;
    } catch (err) {
      console.error(`Error processing profile ${profileId}:`, err.message || String(err));
    } finally {
      console.log('Closing browser profile...');
      await omni.close(profileId).catch(err => {
        console.error(`Failed to close profile ${profileId}:`, err.message || String(err));
      });
    }

    if (success) {
      if (email) {
        const tags = [`gmail:${email}`, 'logged-in', 'gmail'];
        console.log(`Updating Profile ${profileName} tags to:`, tags);
        await omni.profiles.setTags([profileId], tags, false);
      } else {
        console.log(`No Gmail logged in for Profile ${profileName}. Clearing tags.`);
        await omni.profiles.setTags([profileId], [], false);
      }
    } else {
      console.log(`Failed to process Profile ${profileName}. Retaining existing tags.`);
    }

    // Small delay between profiles to let the system cool down
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n===========================================');
  console.log('All profiles processed successfully.');
}

main().catch(console.error);
