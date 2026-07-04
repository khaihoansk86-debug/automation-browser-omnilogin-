import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from './config.js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

interface UsedReview {
  name: string;
  email: string;
  review: string;
  productUrl: string;
  timestamp: string;
}

const usedDbPath = path.join(process.cwd(), 'used-reviews.json');

function loadUsedReviews(): UsedReview[] {
  if (fs.existsSync(usedDbPath)) {
    try {
      return JSON.parse(fs.readFileSync(usedDbPath, 'utf8'));
    } catch {
      return [];
    }
  }
  return [];
}

function saveUsedReview(entry: UsedReview) {
  const db = loadUsedReviews();
  db.push(entry);
  fs.writeFileSync(usedDbPath, JSON.stringify(db, null, 2), 'utf8');
}

function isDuplicate(name: string, review: string, db: UsedReview[]): boolean {
  const normName = name.trim().toLowerCase();
  const normReview = review.replace(/[\s\p{P}]/gu, '').toLowerCase();

  return db.some(item => {
    const itemNormName = item.name.trim().toLowerCase();
    const itemNormReview = item.review.replace(/[\s\p{P}]/gu, '').toLowerCase();
    return itemNormName === normName || itemNormReview === normReview;
  });
}

async function generateReviewWithAI(productTitle: string, productDesc: string, usedDb: UsedReview[]): Promise<{ name: string; email: string; review: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not defined in environment variables. Please add it to your .env file.');
  }

  const prompt = `Bạn là một khách hàng nữ người Việt Nam mua hàng online.
Hãy viết một đánh giá sản phẩm 5 sao cực kỳ tự nhiên, ngắn gọn (1-2 câu), thực tế bằng tiếng Việt, tập trung vào công dụng của sản phẩm.
Thông tin sản phẩm:
- Tên sản phẩm: ${productTitle}
- Mô tả/Công dụng: ${productDesc}

Yêu cầu:
1. Đánh giá phải bám sát công dụng thực tế của sản phẩm (ví dụ: trị mụn thì khen xẹp mụn, phục hồi thì dịu da giảm đỏ rát, kem chống nắng thì thấm nhanh...).
2. Văn phong tự nhiên, ngắn gọn, giống người dùng thật viết (dùng các từ như "nha mọi người", "êm lắm", "rất ưng", "giao nhanh", "đóng gói kỹ").
3. Tạo một tên khách hàng nữ người Việt Nam tự nhiên, ngẫu nhiên (ví dụ: "Nguyễn Hồng Vy", "Lê Thu Trang",...).
4. Tạo một địa chỉ email ngẫu nhiên phù hợp với tên khách hàng nữ đó (ví dụ: "vyhong95@gmail.com", "thutrangle.98@gmail.com").
5. Đảm bảo tên khách hàng và nội dung đánh giá độc nhất, không trùng lặp.

Hãy trả về dưới định dạng JSON với cấu trúc sau:
{
  "name": "Tên khách hàng nữ",
  "email": "Email tương ứng",
  "review": "Nội dung đánh giá sản phẩm"
}`;

  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.8
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API returned error status ${response.status}: ${errText}`);
      }

      const data = await response.json() as any;
      const contentText = data.choices?.[0]?.message?.content;
      if (!contentText) throw new Error('OpenAI returned empty message content.');

      const parsed = JSON.parse(contentText) as { name: string; email: string; review: string };
      const name = String(parsed.name || '').trim();
      const email = String(parsed.email || '').trim();
      const review = String(parsed.review || '').trim();

      if (!name || !email || !review) {
        throw new Error('OpenAI returned invalid JSON structure.');
      }

      if (!isDuplicate(name, review, usedDb)) {
        return { name, email, review };
      } else {
        console.log(`[AI-Retry] Generated name or review is duplicated. Retrying (${attempts}/3)...`);
      }
    } catch (err: any) {
      console.warn(`[AI-Warning] Attempt ${attempts} failed: ${err.message}`);
      if (attempts >= 3) throw err;
    }
  }

  throw new Error('Failed to generate a unique review after 3 attempts.');
}

async function clearBrowserData(page: any) {
  try {
    console.log('Clearing browser cache and cookies...');
    await page.context().clearCookies();
    try {
      const client = await page.context().newCDPSession(page);
      await client.send('Network.clearBrowserCache');
      await client.detach().catch(() => {});
      console.log('Browser cache and cookies cleared successfully.');
    } catch (cdpErr: any) {
      console.log(`Note: CDP cache clearing failed: ${cdpErr.message}`);
    }
  } catch (err: any) {
    console.warn(`Failed to clear browser data: ${err.message}`);
  }
}

async function openProfileSafely(omni: OmniLogin, profileId: number, options: any) {
  try {
    return await omni.open(profileId, options);
  } catch (err: any) {
    const errMsg = err.message || '';
    if (errMsg.includes('already') || errMsg.includes('openned') || errMsg.includes('open')) {
      console.log(`Profile ${profileId} browser is already open/opening. Closing and retrying in 3s...`);
      await omni.close(profileId).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 3000));
      return await omni.open(profileId, options);
    }
    throw err;
  }
}

async function main() {
  const omni = new OmniLogin({ host: appConfig.omniloginHost, timeout: 60_000 });

  console.log('Fetching profiles list...');
  const profileResult = await omni.profiles.list({ page: 1, pageSize: 100 });
  const profiles = profileResult.docs.sort((a, b) => a.id - b.id);
  console.log(`Loaded ${profiles.length} profiles.`);

  if (profiles.length === 0) {
    console.error('No profiles found.');
    return;
  }

  // 1. Get product URLs from homepage and check reviews using the first profile
  const firstProfile = profiles[0];
  console.log(`Opening Profile ${firstProfile.name} (ID: ${firstProfile.id}) to fetch product links and scan reviews...`);
  
  let productUrls: string[] = [];
  let productsToReview: string[] = [];

  const reviewedDbPath = path.join(process.cwd(), 'reviewed-products.json');
  let reviewedProducts: string[] = [];
  if (fs.existsSync(reviewedDbPath)) {
    try {
      reviewedProducts = JSON.parse(fs.readFileSync(reviewedDbPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse reviewed-products.json', e);
    }
  }

  const { session } = await openProfileSafely(omni, firstProfile.id, { headless: false });
  try {
    const page = session.page;
    await clearBrowserData(page);
    await page.goto(appConfig.targetBaseUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    
    productUrls = (await page.evaluate(() => {
      // Find the section/heading that contains "sản phẩm mới về" (case insensitive)
      const allElements = Array.from(document.querySelectorAll(
        '.section-title-container, h2, h3, h4, .block-title, [class*="title"]'
      ));
      const newProductsSection = allElements.find(el =>
        el.textContent.trim().toLowerCase().includes('sản phẩm mới về')
      );
      if (!newProductsSection) {
        console.error('"Sản phẩm mới về" section not found on page.');
        return [];
      }

      // Walk down siblings to find the nearest .row or grid container with products
      let current: Element | null = newProductsSection;
      let productRow: Element | null = null;
      // Try parent's siblings first (in case heading is nested inside a wrapper)
      const parents = [newProductsSection, newProductsSection.parentElement, newProductsSection.parentElement?.parentElement].filter(Boolean) as Element[];
      outer: for (const parent of parents) {
        let sibling: Element | null = parent;
        while (sibling) {
          sibling = sibling.nextElementSibling;
          if (sibling && sibling.querySelector('.product-small, .product, article.product')) {
            productRow = sibling;
            break outer;
          }
        }
      }

      if (!productRow) {
        // Fallback: look inside the section's own parent for any product links
        const sectionParent = newProductsSection.closest('section, .section, .block, div') || newProductsSection.parentElement;
        if (sectionParent) productRow = sectionParent;
      }

      if (!productRow) {
        console.error('"Sản phẩm mới về" product row not found.');
        return [];
      }

      // Extract all product links inside the container
      const anchors = Array.from(productRow.querySelectorAll('a'));
      return anchors
        .map((a: HTMLAnchorElement) => a.href)
        .filter((href: string) => href.includes('/product/') || href.includes('/san-pham/'))
        .filter((href: string, idx: number, self: string[]) => self.indexOf(href) === idx);
    })) as string[];

    console.log(`Found ${productUrls.length} product URLs in "Sản phẩm mới về" section.`);

    // Check reviews on target website for each product using the already opened browser
    for (const productUrl of productUrls) {
      if (reviewedProducts.includes(productUrl)) {
        console.log(`Skipping locally reviewed product: ${productUrl}`);
        continue;
      }

      console.log(`Checking reviews on site for product: ${productUrl}`);
      try {
        await page.goto(productUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // Click reviews tab to reveal count
        const reviewTab = page.locator('#tab-title-reviews a');
        if (await reviewTab.count() > 0) {
          await reviewTab.scrollIntoViewIfNeeded().catch(() => {});
          await reviewTab.click().catch(() => {});
        } else {
          await page.evaluate(() => {
            const tab = document.querySelector('#tab-title-reviews a') as HTMLElement;
            if (tab) tab.click();
          });
        }
        await page.waitForTimeout(1000);

        const commentFormExists = (await page.locator('textarea#comment').count()) > 0;
        if (!commentFormExists) {
          console.log('Review form not found/disabled. Skipping.');
          continue;
        }

        const hasReviews = (await page.locator('.commentlist li').count()) > 0;
        if (hasReviews) {
          console.log('Product already has reviews on website. Marking as reviewed.');
          reviewedProducts.push(productUrl);
          fs.writeFileSync(reviewedDbPath, JSON.stringify(reviewedProducts, null, 2), 'utf-8');
          continue;
        }

        // Product is eligible!
        productsToReview.push(productUrl);
      } catch (err: any) {
        console.error(`Error checking reviews for ${productUrl}:`, err.message || err);
      }
    }
  } catch (err) {
    console.error('Failed to fetch product links or scan reviews:', err);
  } finally {
    await omni.close(firstProfile.id).catch(() => {});
  }

  console.log(`Found ${productsToReview.length} products verified to need reviews.`);
  if (productsToReview.length === 0) {
    console.log('Tất cả sản phẩm mới về đã được đánh giá.');
    return;
  }

  // 3. Loop through verified products and review each with exactly one profile
  let profileIndex = 0;
  for (const productUrl of productsToReview) {
    if (profileIndex >= profiles.length) {
      console.log('All available profiles have been used for this run. Stopping.');
      break;
    }

    const profile = profiles[profileIndex];
    profileIndex++;
    console.log(`\n--------------------------------------------`);
    console.log(`Reviewing product (${profileIndex}/${productsToReview.length}): ${productUrl}`);
    console.log(`Using Profile ${profile.name} (ID: ${profile.id})`);

    const openResult = await openProfileSafely(omni, profile.id, { headless: false });
    const page = openResult.session.page;

    try {
      await clearBrowserData(page);
      await page.goto(productUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);

      // Trigger WooCommerce review tab click using evaluate & Playwright locator for reliability
      const reviewTab = page.locator('#tab-title-reviews a');
      if (await reviewTab.count() > 0) {
        await reviewTab.scrollIntoViewIfNeeded().catch(() => {});
        await reviewTab.click().catch(() => {});
      } else {
        await page.evaluate(() => {
          const tab = document.querySelector('#tab-title-reviews a') as HTMLElement;
          if (tab) tab.click();
        });
      }
      await page.waitForTimeout(2000);

      // Check if the review form actually exists (meaning reviews are enabled for this product)
      const commentFormExists = (await page.locator('textarea#comment').count()) > 0;
      if (!commentFormExists) {
        console.log('Review form not found (reviews might be disabled for this product). Skipping.');
        continue;
      }

      // Check if product already has reviews
      const hasReviews = (await page.locator('.commentlist li').count()) > 0;
      if (hasReviews) {
        console.log('Product already has reviews. Skipping.');
        // Save to database to skip in future runs
        reviewedProducts.push(productUrl);
        fs.writeFileSync(reviewedDbPath, JSON.stringify(reviewedProducts, null, 2), 'utf-8');
        continue;
      }

      // No reviews yet, let's submit one!
      const { productTitle, productDesc } = await page.evaluate(() => {
        const titleEl = document.querySelector('h1.product-title, h1.product_title');
        const descEl = document.querySelector('.woocommerce-product-details__short-description, #tab-description');
        return {
          productTitle: titleEl?.textContent?.trim() || '',
          productDesc: descEl?.textContent?.trim() || ''
        };
      }) as any;

      console.log(`Extracted product title: "${productTitle}"`);

      // Generate a unique review using ChatGPT
      const usedDb = loadUsedReviews();
      const generated = await generateReviewWithAI(productTitle, productDesc, usedDb);

      console.log(`Submitting 5-star review for "${generated.name}" (${generated.email}): "${generated.review}"`);

      // Click the 5-star rating AND set the select value directly to guarantee rating selection
      await page.evaluate(() => {
        const star5 = document.querySelector('.stars a.star-5') as HTMLElement;
        if (star5) {
          star5.click();
          star5.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
        const ratingSelect = document.querySelector('select#rating') as HTMLSelectElement;
        if (ratingSelect) {
          ratingSelect.value = '5';
          ratingSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(1000);

      // Fill comment, name, and email using Playwright's native fill()
      await page.locator('textarea#comment').fill(generated.review);
      await page.locator('input#author').fill(generated.name);
      await page.locator('input#email').fill(generated.email);

      await page.waitForTimeout(1500);

      // Submit the review programmatically using HTMLFormElement.prototype.submit.call
      await page.evaluate(() => {
        const form = document.querySelector('#commentform') as HTMLFormElement;
        if (form) {
          HTMLFormElement.prototype.submit.call(form);
        }
      });
      
      // Wait for page to reload/submit
      await page.waitForTimeout(8000);

      // Verify success by checking current URL
      const currentUrl = await page.url();
      if (currentUrl.includes('wp-comments-post.php')) {
        const pageText = await page.evaluate(() => document.body.innerText) as string;
        throw new Error(`WooCommerce review post failed. Validation page content: ${pageText.trim().replace(/\s+/g, ' ').substring(0, 250)}`);
      }

      // Verify success by checking if the URL contains unapproved or comment, or if the comment textarea value is cleared
      const commentValue = await page.locator('textarea#comment').inputValue().catch(() => '');
      const isSuccess = currentUrl.includes('unapproved=') || currentUrl.includes('comment-') || commentValue === '';

      if (!isSuccess) {
        throw new Error(`WooCommerce review post failed (form is still filled, blocked by frontend validation). Current URL: ${currentUrl}`);
      }

      console.log('Review submitted successfully!');
      
      // Save used review to used-reviews.json database
      saveUsedReview({
        name: generated.name,
        email: generated.email,
        review: generated.review,
        productUrl,
        timestamp: new Date().toISOString()
      });

      // Save successful review to reviewed-products.json
      reviewedProducts.push(productUrl);
      fs.writeFileSync(reviewedDbPath, JSON.stringify(reviewedProducts, null, 2), 'utf-8');

    } catch (err) {
      console.error(`Error reviewing product ${productUrl}:`, err);
    } finally {
      await omni.close(profile.id).catch(() => {});
    }

    // Delay between reviews to look natural
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log('\n============================================');
  console.log('Completed auto-review script.');
}

main().catch(console.error);
