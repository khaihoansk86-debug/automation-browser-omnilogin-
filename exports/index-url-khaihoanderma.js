const DEFAULTS = {
  filePath: 'C:\\Users\\Admin\\Downloads\\khaihoanderma.txt',
  progressDbPath: 'C:\\Users\\Admin\\Downloads\\khaihoanderma-progress.json',
  exportPath: 'C:\\Users\\Admin\\Downloads\\index-url-output.json',
  gscUrl: 'https://search.google.com/u/0/search-console?resource_id=https%3A%2F%2Fkhaihoanderma.com%2F'
};

function param(name) {
  return typeof __params !== 'undefined' && __params ? __params[name] : undefined;
}

function reportStep(step, detail) {
  const reporter = param('reporter');
  if (reporter) {
    try {
      reporter(step, detail);
    } catch (e) {
      console.log('[reporter-error]', e.message || String(e));
    }
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gotoSafe(url, label = '[nav]') {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`${label} Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return;
    } catch (err) {
      console.warn(`${label} Attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt >= 2) throw err;
      await wait(3000);
    }
  }
}

async function generateReviewWithAI(productTitle, productDesc, openAiApiKey) {
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
          'Authorization': `Bearer ${openAiApiKey}`
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

      const data = await response.json();
      const contentText = data.choices?.[0]?.message?.content;
      if (!contentText) throw new Error('OpenAI returned empty message content.');

      const parsed = JSON.parse(contentText);
      const name = String(parsed.name || '').trim();
      const email = String(parsed.email || '').trim();
      const review = String(parsed.review || '').trim();

      if (!name || !email || !review) {
        throw new Error('OpenAI returned invalid JSON structure.');
      }

      return { name, email, review };
    } catch (err) {
      console.warn(`[AI-Warning] Attempt ${attempts} failed: ${err.message}`);
      if (attempts >= 3) throw err;
    }
  }
}

async function main() {
  const config = {
    filePath: String(param('filePath') || DEFAULTS.filePath),
    progressDbPath: String(param('progressDbPath') || DEFAULTS.progressDbPath),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
    gscUrl: String(param('gscUrl') || DEFAULTS.gscUrl),
    openAiApiKey: String(param('openAiApiKey') || '')
  };

  async function removeUrlFromFile(filePath, urlToRemove) {
    try {
      const content = await omni.file.read(filePath);
      const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const remainingLines = lines.filter(line => line !== urlToRemove);
      await omni.file.write(filePath, remainingLines.join('\r\n'));
      console.log(`[index] Removed URL from queue file: ${urlToRemove}`);
    } catch (err) {
      console.error('[index] Failed to remove URL from file:', err.message || err);
    }
  }

  console.log('[index] Reading URL list from: ' + config.filePath);
  let fileContent = '';
  try {
    fileContent = await omni.file.read(config.filePath);
  } catch (err) {
    console.error('[index] Cannot read link file:', err.message || String(err));
    throw new Error('Không thể đọc file link tại ' + config.filePath);
  }

  const urls = fileContent.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  console.log(`[index] Found ${urls.length} URLs in text file.`);

  if (urls.length === 0) {
    console.log('[index] URL file is empty.');
    const output = {
      quotaExceeded: false,
      indexedCount: 0,
      alreadyIndexedCount: 0,
      unindexedUrls: [],
      finishedAt: new Date().toISOString()
    };
    await omni.file.write(config.exportPath, JSON.stringify(output, null, 2));
    return;
  }

  // Load progress database
  let progress = { indexed: [], reviewed: [] };
  try {
    const rawProgress = await omni.file.read(config.progressDbPath);
    if (rawProgress) {
      progress = JSON.parse(rawProgress);
    }
  } catch (e) {
    console.log('[index] Starting fresh progress tracking');
  }

  if (!Array.isArray(progress.indexed)) progress.indexed = [];
  if (!Array.isArray(progress.reviewed)) progress.reviewed = [];

  // ==========================================
  // PHASE 1: WooCommerce Product Reviews
  // ==========================================
  console.log('[review] Starting product review phase for URLs...');
  for (let i = 0; i < urls.length; i++) {
    const targetUrl = urls[i];
    const isProduct = targetUrl.includes('/product/') || targetUrl.includes('/san-pham/');
    
    if (!isProduct) {
      console.log(`[review] URL [${i + 1}/${urls.length}] is not a product. Skipping review: ${targetUrl}`);
      continue;
    }

    if (progress.reviewed.includes(targetUrl)) {
      console.log(`[review] URL [${i + 1}/${urls.length}] already reviewed. Skipping: ${targetUrl}`);
      continue;
    }

    console.log(`\n--------------------------------------------`);
    console.log(`[review] Reviewing product [${i + 1}/${urls.length}]: ${targetUrl}`);
    reportStep('derma_start', `Đánh giá: ${targetUrl}`);

    try {
      await gotoSafe(targetUrl, '[review]');
      await wait(3000);

      // Scroll and open review tab
      const reviewTab = page.locator('#tab-title-reviews a');
      if (await reviewTab.count() > 0) {
        await reviewTab.scrollIntoViewIfNeeded().catch(() => {});
        await reviewTab.click().catch(() => {});
      } else {
        await page.evaluate(() => {
          const tab = document.querySelector('#tab-title-reviews a');
          if (tab) tab.click();
        });
      }
      await wait(2000);

      // Check if reviews already exist
      const hasReviews = (await page.locator('.commentlist li').count()) > 0;
      if (hasReviews) {
        console.log('[review] Product already has reviews on website. Skipping review.');
        progress.reviewed.push(targetUrl);
        await omni.file.write(config.progressDbPath, JSON.stringify(progress, null, 2));
        continue;
      }

      // Check if comment form exists
      const commentFormExists = (await page.locator('textarea#comment').count()) > 0;
      if (!commentFormExists) {
        console.log('[review] Review form not found/disabled. Skipping.');
        continue;
      }

      if (!config.openAiApiKey) {
        console.warn('[review] OpenAI API Key is missing. Skipping AI review generation.');
        continue;
      }

      // Extract details
      const { productTitle, productDesc } = await page.evaluate(() => {
        const titleEl = document.querySelector('h1.product-title, h1.product_title');
        const descEl = document.querySelector('.woocommerce-product-details__short-description, #tab-description');
        return {
          productTitle: titleEl?.textContent?.trim() || '',
          productDesc: descEl?.textContent?.trim() || ''
        };
      });

      console.log(`[review] Extracted product title: "${productTitle}"`);
      reportStep('audit_start', 'Đang viết đánh giá bằng AI...');
      
      const generated = await generateReviewWithAI(productTitle, productDesc, config.openAiApiKey);
      console.log(`[review] Submitting review for "${generated.name}": "${generated.review}"`);
      
      // Select 5-star rating natively to trigger WooCommerce validation
      const starLinks = page.locator('.comment-form-rating a, .stars a, p.stars a');
      if (await starLinks.count() > 0) {
        // Cố gắng click vào thẻ a cuối cùng (tương ứng với 5 sao)
        await starLinks.last().scrollIntoViewIfNeeded().catch(() => {});
        await starLinks.last().click({ force: true });
      } else {
        await page.evaluate(() => {
          // Fallback JavaScript click
          const links = document.querySelectorAll('.comment-form-rating a, .stars a');
          if (links.length > 0) links[links.length - 1].click();
          
          const ratingSelect = document.querySelector('select#rating');
          if (ratingSelect) {
            ratingSelect.value = '5';
            ratingSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
      await wait(1000);

      await page.locator('textarea#comment').fill(generated.review);
      await page.locator('input#author').fill(generated.name);
      await page.locator('input#email').fill(generated.email);
      await wait(1500);

      const clicked = await page.evaluate(() => {
        const btn = document.querySelector('#commentform input[type="submit"], #commentform button[type="submit"], #submit.submit');
        if (btn) {
          btn.scrollIntoView({ block: 'center', inline: 'center' });
          btn.click();
          return true;
        }
        
        const form = document.querySelector('#commentform');
        if (form) {
          HTMLFormElement.prototype.submit.call(form);
          return true;
        }
        return false;
      });

      if (!clicked) {
        console.warn('[review] Không tìm thấy nút gửi đánh giá hoặc biểu mẫu.');
      }
      
      await wait(8000);

      const currentUrl = await page.url();
      const commentValue = await page.locator('textarea#comment').inputValue().catch(() => '');
      const isSuccess = currentUrl.includes('unapproved=') || currentUrl.includes('comment-') || commentValue === '';

      if (isSuccess) {
        console.log('[review] Review submitted successfully!');
        reportStep('audit_done', 'Đã đánh giá xong');
        progress.reviewed.push(targetUrl);
        await omni.file.write(config.progressDbPath, JSON.stringify(progress, null, 2));
      } else {
        throw new Error('[REVIEW_SUBMIT_FAILED] Không bấm gửi được đánh giá hoặc tải trang thất bại.');
      }
    } catch (err) {
      console.error('[review] Error during product review:', err.message || err);
      throw err;
    }
  }

  // ==========================================
  // PHASE 2: GSC Indexing
  // ==========================================
  console.log('[index] Starting GSC indexing phase...');
  console.log(`[index] Navigating to GSC: ${config.gscUrl}`);
  reportStep('gsc_navigating', 'Đang mở Google Search Console...');
  await page.goto(config.gscUrl, { timeout: 60000, waitUntil: 'domcontentloaded' });

  // Wait for GSC input box to load
  console.log('[index] Waiting for URL inspection input...');
  const searchSelector = 'input[aria-label*="Inspect any URL"], input[aria-label*="Kiểm tra mọi URL"]';
  await page.locator(searchSelector).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(3000);

  let successCount = 0;
  let alreadyIndexedCount = 0;
  let quotaExceeded = false;
  let hasError = false;
  let errorMessage = '';
  let unindexedUrls = [];

  for (let i = 0; i < urls.length; i++) {
    const targetUrl = urls[i];
    if (progress.indexed.includes(targetUrl)) {
      console.log(`[index] URL [${i + 1}/${urls.length}] already indexed previously: ${targetUrl}`);
      alreadyIndexedCount++;
      continue;
    }

    console.log(`\n--------------------------------------------`);
    console.log(`[index] URL [${i + 1}/${urls.length}] Inspecting: ${targetUrl}`);
    reportStep('derma_start', `${i + 1}/${urls.length}: ${targetUrl}`);

    try {
      console.log('[index] Navigating to GSC home to reset state...');
      await page.goto(config.gscUrl, { timeout: 60000, waitUntil: 'domcontentloaded' });
      const input = page.locator(searchSelector).first();
      await input.waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(2000);
      await input.click();
      await page.waitForTimeout(1000);

      // Set search value programmatically
      await page.evaluate(({ selector, value }) => {
        const el = document.querySelector(selector);
        if (el) {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, { selector: searchSelector, value: targetUrl });

      await page.waitForTimeout(1000);
      await input.press('Enter');

      console.log('[index] Pressed Enter. Waiting for inspection data...');
      reportStep('derma_page', { pageNum: i + 1, maxPages: urls.length });

      // Wait for Inspection Page results to load
      const requestBtnSelector = 'div[role="button"]:has-text("Request indexing"), div[role="button"]:has-text("Yêu cầu lập chỉ mục"), div[role="button"]:has-text("Request again"), div[role="button"]:has-text("Yêu cầu lại")';
      await page.locator(requestBtnSelector).first().waitFor({ state: 'visible', timeout: 50000 });
      
      console.log('[index] Waiting for GSC to load new URL status card...');
      let statusLoaded = false;
      let pageText = '';
      for (let attempt = 0; attempt < 60; attempt++) {
        await page.waitForTimeout(500);
        pageText = await page.evaluate(() => document.body.innerText);
        
        const isRetrieving = pageText.includes('Retrieving data') || 
                             pageText.includes('Đang truy xuất') || 
                             pageText.includes('Retrieving') || 
                             pageText.includes('truy xuất');
        if (isRetrieving) continue;
        
        const hasStatus = pageText.includes('URL is on Google') || 
                          pageText.includes('URL đã nằm trên Google') ||
                          pageText.includes('URL is not on Google') ||
                          pageText.includes('URL không nằm trên Google') ||
                          pageText.includes('URL is not in the index') ||
                          pageText.includes('URL không có trên Google') ||
                          pageText.includes('URL is in the index');
                          
        const hasNewUrl = pageText.includes(targetUrl);
        
        if (hasStatus && hasNewUrl) {
          statusLoaded = true;
          break;
        }
      }
      
      if (!statusLoaded) {
        console.log('[index] Warning: Status card load timed out or URL mismatch.');
      }

      const isNotIndexed = pageText.includes('URL is not on Google') || pageText.includes('URL không nằm trên Google') || pageText.includes('không có trên Google') || pageText.includes('not in the index');
      const isAlreadyIndexed = (pageText.includes('URL is on Google') || pageText.includes('URL đã nằm trên Google') || pageText.includes('URL đã có trên Google') || pageText.includes('URL is in the index')) && !isNotIndexed;

      if (isAlreadyIndexed) {
        console.log('[index] URL is already indexed. Skipping GSC request.');
        reportStep('derma_found', { keyword: targetUrl, pageNum: 1, position: 'Indexed' });
        alreadyIndexedCount++;
        progress.indexed.push(targetUrl);
        await omni.file.write(config.progressDbPath, JSON.stringify(progress, null, 2));
        await removeUrlFromFile(config.filePath, targetUrl);
        await page.waitForTimeout(3000);
        continue;
      }

      console.log('[index] URL is not indexed. Requesting Indexing...');
      reportStep('audit_start', 'Đang yêu cầu lập chỉ mục...');

      const requestBtn = page.locator(requestBtnSelector).first();
      await requestBtn.scrollIntoViewIfNeeded().catch(() => {});
      await requestBtn.click();

      console.log('[index] Live test started...');
      reportStep('audit_reading', { elapsed: 0, total: 180, url: 'Đang chạy Live Test...' });

      let submitted = false;
      const maxLiveTestSeconds = Math.floor(Math.random() * (90 - 60 + 1)) + 60;
      const maxAttempts = Math.floor(maxLiveTestSeconds / 5);
      for (let w = 0; w < maxAttempts; w++) {
        await page.waitForTimeout(5000);
        const elapsed = (w + 1) * 5;
        reportStep('audit_reading', { 
          elapsed: elapsed, 
          total: maxLiveTestSeconds, 
          url: `Đang chạy Live Test: ${elapsed}/${maxLiveTestSeconds}s...` 
        });

        const pageText = await page.locator('body').innerText().catch(() => '');
        const hasFinished = pageText.includes('Indexing requested') ||
                            pageText.includes('Đã yêu cầu lập chỉ mục') ||
                            pageText.includes('Oops! Something went wrong') ||
                            pageText.includes('problem submitting') ||
                            pageText.includes('Quota exceeded') ||
                            pageText.includes('Hạn ngạch đã vượt quá') ||
                            pageText.includes('thử lại sau');

        if (hasFinished) {
          const isQuotaError = pageText.includes('Quota exceeded') || 
                               pageText.includes('Hạn ngạch đã vượt quá') || 
                               pageText.includes('problem submitting') ||
                               pageText.includes('Oops! Something went wrong') ||
                               pageText.includes('thử lại sau');

          if (isQuotaError) {
            console.log('[index] Google Search Console daily indexing quota exceeded.');
            quotaExceeded = true;
            unindexedUrls = urls.slice(i);
          } else {
            console.log('[index] Indexing requested successfully.');
            submitted = true;
          }

          const actionBtn = page.locator('button:visible, div[role="button"]:visible').filter({ hasText: /Dismiss|Got it|Đã hiểu|Bỏ qua|Đóng|Close/i }).first();
          if (await actionBtn.count() > 0 && await actionBtn.isVisible()) {
            await actionBtn.click().catch(() => {});
            await page.waitForTimeout(2000);
          }

          await page.locator('body').click({ position: { x: 10, y: 10 } }).catch(() => {});
          await page.waitForTimeout(1000);
          break;
        }
      }

      if (quotaExceeded) break;

      if (submitted) {
        reportStep('audit_done', 'Hoàn tất gửi yêu cầu');
        successCount++;
        progress.indexed.push(targetUrl);
        await omni.file.write(config.progressDbPath, JSON.stringify(progress, null, 2));
        await removeUrlFromFile(config.filePath, targetUrl);
        
        const delaySec = Math.floor(Math.random() * (90 - 60 + 1)) + 60;
        console.log(`[index] Waiting for random delay of ${delaySec} seconds...`);
        for (let d = 0; d < delaySec; d += 5) {
          reportStep('audit_reading', { 
            elapsed: d, 
            total: delaySec, 
            url: `Nghỉ giãn cách: ${d}/${delaySec}s...` 
          });
          await page.waitForTimeout(5000);
        }
      } else {
        console.warn('[index] Live test failed.');
        hasError = true;
        errorMessage = 'Yêu cầu lập chỉ mục thất bại (không xuất hiện hộp thoại hoàn thành).';
        unindexedUrls = urls.slice(i);
        break;
      }

    } catch (inspectErr) {
      console.error(`[index] Error inspecting URL ${targetUrl}:`, inspectErr.message || inspectErr);
      hasError = true;
      errorMessage = inspectErr.message || String(inspectErr);
      unindexedUrls = urls.slice(i);
      break;
    }
  }

  if (!quotaExceeded && !hasError) {
    unindexedUrls = urls.filter(u => !progress.indexed.includes(u));
  }

  const finalOutput = {
    quotaExceeded,
    hasError,
    errorMessage,
    indexedCount: successCount,
    alreadyIndexedCount,
    unindexedUrls,
    finishedAt: new Date().toISOString()
  };

  await omni.file.write(config.exportPath, JSON.stringify(finalOutput, null, 2));
  console.log('[index] Exported execution results.');
}

await main();
