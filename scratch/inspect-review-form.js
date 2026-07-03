import { OmniLogin } from '@omnilogin/sdk';

async function main() {
  const omni = new OmniLogin({ host: 'http://localhost:35353', timeout: 60_000 });
  const profileId = 37;

  console.log(`Opening profile ${profileId}...`);
  const { session } = await omni.open(profileId, { headless: false });

  try {
    const page = session.page;
    const productUrl = 'https://khaihoanderma.com/product/dr-hedison-egf-concentrate-ampoule-tinh-chat-phuc-hoi-tai-tao-da-sau-treatment/';
    console.log(`Navigating to ${productUrl}...`);
    await page.goto(productUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Let's inspect the review elements
    const reviewFormInfo = await page.evaluate(() => {
      // Find the review tab and click it if not active
      const reviewTab = document.querySelector('#tab-title-reviews a');
      if (reviewTab) {
        reviewTab.click();
      }
      
      const ratingStars = Array.from(document.querySelectorAll('.stars a, p.stars a')).map(a => {
        return {
          className: a.className,
          outerHTML: a.outerHTML,
          text: a.textContent
        };
      });

      const commentField = document.querySelector('textarea#comment');
      const nameField = document.querySelector('input#author');
      const emailField = document.querySelector('input#email');
      const submitBtn = document.querySelector('#submit, input[type="submit"]#submit');
      
      // Also check if there are existing reviews
      const reviewCountText = document.querySelector('#tab-title-reviews a')?.textContent || '';
      const hasReviews = document.querySelectorAll('.commentlist li').length > 0;

      return {
        reviewCountText,
        hasReviews,
        ratingStars,
        hasComment: !!commentField,
        hasName: !!nameField,
        hasEmail: !!emailField,
        hasSubmit: !!submitBtn,
        commentOuterHTML: commentField ? commentField.outerHTML : 'none',
        nameOuterHTML: nameField ? nameField.outerHTML : 'none',
        emailOuterHTML: emailField ? emailField.outerHTML : 'none',
        submitOuterHTML: submitBtn ? submitBtn.outerHTML : 'none'
      };
    });

    console.log('Review Form Elements Info:');
    console.log(JSON.stringify(reviewFormInfo, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('Closing profile...');
    await omni.close(profileId).catch(console.error);
  }
}

main().catch(console.error);
