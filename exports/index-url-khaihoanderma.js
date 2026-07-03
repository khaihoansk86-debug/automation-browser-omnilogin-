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

async function main() {
  const config = {
    filePath: String(param('filePath') || DEFAULTS.filePath),
    progressDbPath: String(param('progressDbPath') || DEFAULTS.progressDbPath),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
    gscUrl: String(param('gscUrl') || DEFAULTS.gscUrl)
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
  let progress = { indexed: [] };
  try {
    const rawProgress = await omni.file.read(config.progressDbPath);
    if (rawProgress) {
      progress = JSON.parse(rawProgress);
    }
  } catch (e) {
    console.log('[index] Starting fresh progress tracking');
  }

  if (!Array.isArray(progress.indexed)) {
    progress.indexed = [];
  }

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

      // Set search value programmatically to ensure React/Angular registration
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

      console.log('[index] Pressed Enter. Waiting for inspection data from Google Index...');
      reportStep('derma_page', { pageNum: i + 1, maxPages: urls.length });

      // Wait for Inspection Page results to load (checking for Request Indexing button)
      const requestBtnSelector = 'div[role="button"]:has-text("Request indexing"), div[role="button"]:has-text("Yêu cầu lập chỉ mục"), div[role="button"]:has-text("Request again"), div[role="button"]:has-text("Yêu cầu lại")';
      await page.locator(requestBtnSelector).first().waitFor({ state: 'visible', timeout: 50000 });
      
      // GSC retrieves data asynchronously. Wait for GSC loading/retrieving to finish and render the new URL's status card
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
        if (isRetrieving) {
          continue; // GSC is still loading data, keep waiting
        }
        
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

      // Check current index status using strict validation (URL is not on Google contains URL is on Google, so we must exclude "not" / "không")
      const isNotIndexed = pageText.includes('URL is not on Google') || pageText.includes('URL không nằm trên Google') || pageText.includes('không có trên Google') || pageText.includes('not in the index');
      const isAlreadyIndexed = (pageText.includes('URL is on Google') || pageText.includes('URL đã nằm trên Google') || pageText.includes('URL đã có trên Google') || pageText.includes('URL is in the index')) && !isNotIndexed;

      if (isAlreadyIndexed) {
        console.log('[index] URL is already indexed (GREEN status). Skipping request.');
        reportStep('derma_found', { keyword: targetUrl, pageNum: 1, position: 'Indexed' });
        alreadyIndexedCount++;
        progress.indexed.push(targetUrl);
        await omni.file.write(config.progressDbPath, JSON.stringify(progress, null, 2));
        await removeUrlFromFile(config.filePath, targetUrl);
        await page.waitForTimeout(3000);
        continue;
      }

      console.log('[index] URL is not indexed. Clicking Request Indexing...');
      reportStep('audit_start', 'Đang yêu cầu lập chỉ mục...');

      const requestBtn = page.locator(requestBtnSelector).first();
      await requestBtn.scrollIntoViewIfNeeded().catch(() => {});
      await requestBtn.click();

      console.log('[index] Live test started. Waiting for completion modal...');
      reportStep('audit_reading', { elapsed: 0, total: 180, url: 'Đang chạy Live Test...' });

      // Poll dialog states
      let submitted = false;
      const maxLiveTestSeconds = Math.floor(Math.random() * (90 - 60 + 1)) + 60;
      console.log(`[index] GSC Live test running. Max wait time: ${maxLiveTestSeconds}s.`);
      
      const maxAttempts = Math.floor(maxLiveTestSeconds / 5);
      for (let w = 0; w < maxAttempts; w++) {
        await page.waitForTimeout(5000);
        const elapsed = (w + 1) * 5;
        reportStep('audit_reading', { 
          elapsed: elapsed, 
          total: maxLiveTestSeconds, 
          url: `Đang chạy Live Test: ${elapsed}/${maxLiveTestSeconds}s (Ngẫu nhiên: ${maxLiveTestSeconds}s)...` 
        });

        // Read page text to determine completion
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
            unindexedUrls = urls.slice(i); // Current and all subsequent URLs
          } else {
            console.log('[index] Google Search Console indexing requested successfully.');
            submitted = true;
          }

          // Locate and click the close button
          const actionBtn = page.locator('button:visible, div[role="button"]:visible').filter({ hasText: /Dismiss|Got it|Đã hiểu|Bỏ qua|Đóng|Close/i }).first();
          if (await actionBtn.count() > 0 && await actionBtn.isVisible()) {
            console.log('[index] Clicking dialog close button.');
            await actionBtn.click().catch(() => {});
            await page.waitForTimeout(2000);
          }

          // Click outside (body top-left) to clear focus and dismiss modal backdrop fully
          await page.locator('body').click({ position: { x: 10, y: 10 } }).catch(() => {});
          await page.waitForTimeout(1000);
          break;
        }
      }

      if (quotaExceeded) {
        break;
      }

      if (submitted) {
        console.log('[index] Indexing requested successfully.');
        reportStep('audit_done', 'Hoàn tất gửi yêu cầu');
        successCount++;
        progress.indexed.push(targetUrl);
        await omni.file.write(config.progressDbPath, JSON.stringify(progress, null, 2));
        await removeUrlFromFile(config.filePath, targetUrl);
        
        // Wait random delay of 60 to 90 seconds AFTER a successful submission
        const delaySec = Math.floor(Math.random() * (90 - 60 + 1)) + 60;
        console.log(`[index] Waiting for random delay of ${delaySec} seconds after indexing submission...`);
        for (let d = 0; d < delaySec; d += 5) {
          reportStep('audit_reading', { 
            elapsed: d, 
            total: delaySec, 
            url: `Nghỉ giãn cách sau khi index: ${d}/${delaySec}s (Ngẫu nhiên: ${delaySec}s)...` 
          });
          await page.waitForTimeout(5000);
        }
      } else {
        console.warn('[index] Live test dialog wait timed out or failed.');
        hasError = true;
        errorMessage = 'Yêu cầu lập chỉ mục thất bại (không xuất hiện hộp thoại hoàn thành).';
        unindexedUrls = urls.slice(i); // Current and all subsequent URLs
        // Save failure screenshot locally for debugging
        try {
          const buf = await page.screenshot();
          await omni.file.write(`C:\\Users\\Admin\\Downloads\\gsc-error-submit-${i}.png`, buf);
        } catch (e) {}
        break;
      }

    } catch (inspectErr) {
      console.error(`[index] Error inspecting URL ${targetUrl}:`, inspectErr.message || inspectErr);
      hasError = true;
      errorMessage = inspectErr.message || String(inspectErr);
      unindexedUrls = urls.slice(i); // Current and all subsequent URLs
      
      // Capture screenshot on error
      try {
        const buf = await page.screenshot();
        await omni.file.write(`C:\\Users\\Admin\\Downloads\\gsc-error-inspect-${i}.png`, buf);
      } catch (e) {}
      break;
    }
  }

  // Determine unindexed URLs if we finished cleanly
  if (!quotaExceeded && !hasError) {
    unindexedUrls = urls.filter(u => !progress.indexed.includes(u));
  }

  // Export results JSON for the bot
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
  console.log('[index] Exported execution results to: ' + config.exportPath);
}

await main();
