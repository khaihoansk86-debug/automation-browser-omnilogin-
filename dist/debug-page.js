import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from './config.js';
async function main() {
    const omni = new OmniLogin({ host: appConfig.omniloginHost, timeout: 60_000 });
    const profileId = 37;
    const productUrl = "https://khaihoanderma.com/product/dr-hedison-egf-concentrate-ampoule-tinh-chat-phuc-hoi-tai-tao-da-sau-treatment/";
    console.log(`Opening Profile ${profileId}...`);
    const { session } = await omni.open(profileId, { headless: false });
    const page = session.page;
    try {
        console.log(`Navigating to ${productUrl}...`);
        await page.goto(productUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);
        // Get Tab title info
        const tabText = await page.evaluate(() => {
            const tab = document.querySelector('#tab-title-reviews a');
            return tab ? tab.textContent : null;
        });
        console.log(`Tab text: "${tabText}"`);
        // Click tab
        console.log("Clicking review tab...");
        await page.evaluate(() => {
            const tab = document.querySelector('#tab-title-reviews a');
            if (tab)
                tab.click();
        });
        await page.waitForTimeout(2000);
        // Check elements
        const elementsInfo = await page.evaluate(() => {
            const commentForm = document.querySelector('#commentform');
            const commentlist = document.querySelector('.commentlist');
            const commentlistLi = document.querySelectorAll('.commentlist li');
            const ratingSelect = document.querySelector('select#rating');
            const stars = document.querySelector('.stars');
            return {
                commentFormHTML: commentForm ? commentForm.outerHTML : null,
                commentlistExists: !!commentlist,
                commentlistOuterHTML: commentlist ? commentlist.outerHTML.substring(0, 500) : null,
                commentlistLiCount: commentlistLi.length,
                ratingSelectOuterHTML: ratingSelect ? ratingSelect.outerHTML : null,
                starsOuterHTML: stars ? stars.outerHTML : null
            };
        });
        console.log("Elements Info:", JSON.stringify(elementsInfo, null, 2));
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await omni.close(profileId).catch(() => { });
    }
}
main().catch(console.error);
