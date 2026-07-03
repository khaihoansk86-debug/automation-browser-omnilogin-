import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from './config.js';
async function main() {
    const omni = new OmniLogin({ host: appConfig.omniloginHost, timeout: 60_000 });
    const profileId = 37;
    const productUrl = "https://khaihoanderma.com/product/dr-hedison-hya-water-fluid-tinh-chat-cap-am-phuc-hoi-da-ha/";
    console.log(`Opening Profile ${profileId}...`);
    const { session } = await omni.open(profileId, { headless: false });
    const page = session.page;
    // Listen to page console messages
    page.on('console', msg => {
        console.log(`PAGE LOG: [${msg.type()}] ${msg.text()}`);
    });
    // Listen to dialogs (alerts)
    page.on('dialog', async (dialog) => {
        console.log(`PAGE DIALOG: [${dialog.type()}] ${dialog.message()}`);
        await dialog.dismiss();
    });
    try {
        console.log(`Navigating to ${productUrl}...`);
        await page.goto(productUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);
        console.log("Clicking review tab...");
        const reviewTab = page.locator('#tab-title-reviews a');
        if (await reviewTab.count() > 0) {
            await reviewTab.scrollIntoViewIfNeeded().catch(() => { });
            await reviewTab.click({ force: true }).catch(() => { });
        }
        await page.waitForTimeout(2000);
        console.log("Filling form...");
        // Click rating star and set select value
        await page.evaluate(() => {
            const star5 = document.querySelector('.stars a.star-5');
            if (star5) {
                star5.click();
                star5.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
            const ratingSelect = document.querySelector('select#rating');
            if (ratingSelect) {
                ratingSelect.value = '5';
                ratingSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await page.waitForTimeout(1000);
        await page.locator('textarea#comment').fill("Sản phẩm dùng rất thích, cấp ẩm tốt.");
        await page.locator('input#author').fill("Trần Thị Yến");
        await page.locator('input#email').fill("yentran37@gmail.com");
        await page.waitForTimeout(1500);
        console.log("Submitting form...");
        // Check form validity before submit
        const validityInfo = await page.evaluate(() => {
            const form = document.querySelector('#commentform');
            if (!form)
                return { formExists: false };
            const elements = Array.from(form.elements);
            const invalidElements = elements
                .filter(el => el.checkValidity && !el.checkValidity())
                .map(el => ({
                id: el.id,
                name: el.name,
                tagName: el.tagName,
                validationMessage: el.validationMessage,
                value: el.value
            }));
            return {
                formExists: true,
                checkValidity: form.checkValidity(),
                invalidElements
            };
        });
        console.log("Form Validity Info:", JSON.stringify(validityInfo, null, 2));
        await page.evaluate(() => {
            const form = document.querySelector('#commentform');
            if (form)
                HTMLFormElement.prototype.submit.call(form);
        });
        console.log("Waiting 10s to see what happens...");
        await page.waitForTimeout(10000);
        const currentUrl = await page.url();
        const commentValue = await page.locator('textarea#comment').inputValue().catch(() => '');
        console.log(`Result Url: ${currentUrl}`);
        console.log(`Comment field value: "${commentValue}"`);
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await omni.close(profileId).catch(() => { });
    }
}
main().catch(console.error);
