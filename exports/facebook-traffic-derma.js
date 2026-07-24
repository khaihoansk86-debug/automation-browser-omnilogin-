const DEFAULTS = {
  fbSearchQuery: 'Dược mỹ phẩm-Khải Hoàn Derma',
  targetDomain: 'khaihoanderma.com',
  targetBaseUrl: 'https://khaihoanderma.com/',
  fbWarmupMinSeconds: 120,
  fbWarmupMaxSeconds: 180,
  targetSessionTotalSeconds: 420,
  exportPath: 'C:\\Users\\Admin\\Desktop\\key_derma\\facebook-traffic-derma-output.json',
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

function randomInt(min, max) {
  const low = Math.ceil(Number(min));
  const high = Math.floor(Number(max));
  return low + Math.floor(Math.random() * (high - low + 1));
}

function remainingMs(deadline) {
  return Math.max(0, deadline - Date.now());
}

function cleanUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

async function wait(ms) {
  await page.waitForTimeout(Math.max(0, Math.floor(ms)));
}

async function safeMouseMove(x, y, options) {
  try {
    await page.mouse.move(x, y, options);
  } catch (error) {
    console.log('[mouse] move error:', error.message || String(error));
  }
}

async function safeMouseWheel(deltaX, deltaY) {
  try {
    await page.mouse.wheel(deltaX, deltaY);
  } catch (error) {
    console.log('[mouse] wheel error:', error.message || String(error));
  }
}

async function moveMouseNaturally() {
  const x = randomInt(120, 1080);
  const y = randomInt(120, 620);
  await safeMouseMove(x, y, { steps: randomInt(8, 20) });
}

async function isVisibleSafe(locator) {
  try {
    return (await locator.count()) > 0 && (await locator.first().isVisible());
  } catch {
    return false;
  }
}

async function waitWithinBudget(ms, deadline) {
  const budget = remainingMs(deadline);
  if (budget <= 0) return false;
  await wait(Math.min(ms, budget));
  return remainingMs(deadline) > 0;
}

// ----------------------------------------------------
// Phase 1: Facebook Feed Warmup (2 - 3 minutes)
// ----------------------------------------------------
async function warmupFacebookFeed(config, deadline) {
  console.log('[fb-warmup] Navigating to Facebook home...');
  reportStep('fb_warmup_start', 'Mở Facebook và lướt tin ngẫu nhiên...');

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    console.log('[fb-warmup] Navigation error, continuing:', err.message || String(err));
  }
  await wait(3000 + randomInt(0, 2000));

  const targetDurationMs = randomInt(config.fbWarmupMinSeconds, config.fbWarmupMaxSeconds) * 1000;
  const warmupDeadline = Date.now() + Math.min(targetDurationMs, remainingMs(deadline));
  const startedAt = Date.now();

  let actionCount = 0;

  while (remainingMs(warmupDeadline) > 0) {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const totalSec = Math.floor(targetDurationMs / 1000);
    reportStep('fb_warmup_reading', { elapsed: elapsedSec, total: totalSec });

    const rand = Math.random();

    // Action A: Scroll Feed & Read (50%)
    if (rand < 0.50) {
      if (Math.random() < 0.60) await moveMouseNaturally();
      const direction = Math.random() < 0.85 ? 1 : -1;
      const deltaY = direction * randomInt(250, 650);
      await safeMouseWheel(0, deltaY);
      actionCount++;
      await waitWithinBudget(randomInt(3000, 8000), warmupDeadline);
    }
    // Action B: View Story (15%)
    else if (rand < 0.65) {
      console.log('[fb-warmup] Attempting to view a Facebook story...');
      try {
        const storyCard = page.locator('div[role="button"]:has-text("Tạo tin"), div[aria-label*="Story"], div[aria-label*="Tin"], a[href*="/stories/"]').first();
        if (await isVisibleSafe(storyCard)) {
          await storyCard.click().catch(() => {});
          await waitWithinBudget(randomInt(5000, 10000), warmupDeadline);
          await page.keyboard.press('Escape').catch(() => {});
          await wait(1500);
          actionCount++;
        }
      } catch (err) {
        console.log('[fb-warmup] story click error:', err.message || String(err));
      }
    }
    // Action C: Watch Reel / Video (20%)
    else if (rand < 0.85) {
      console.log('[fb-warmup] Pausing over video/reel content...');
      try {
        const videoEl = page.locator('video, a[href*="/watch/"], a[href*="/reel/"]').first();
        if (await isVisibleSafe(videoEl)) {
          await videoEl.scrollIntoViewIfNeeded().catch(() => {});
          await moveMouseNaturally();
          await waitWithinBudget(randomInt(8000, 18000), warmupDeadline);
          actionCount++;
        }
      } catch (err) {
        console.log('[fb-warmup] video pause error:', err.message || String(err));
      }
    }
    // Action D: Read Comments (15%)
    else {
      console.log('[fb-warmup] Expanding comments on post...');
      try {
        const commentBtn = page.locator('div[role="button"]:has-text("Bình luận"), div[role="button"]:has-text("Comment"), span:has-text("bình luận")').first();
        if (await isVisibleSafe(commentBtn)) {
          await commentBtn.scrollIntoViewIfNeeded().catch(() => {});
          await wait(600);
          await commentBtn.click().catch(() => {});
          await waitWithinBudget(randomInt(4000, 9000), warmupDeadline);
          await safeMouseWheel(0, 200);
          actionCount++;
        }
      } catch (err) {
        console.log('[fb-warmup] comment expand error:', err.message || String(err));
      }
    }
  }

  reportStep('fb_warmup_done', 'Đã hoàn thành lướt Facebook Feed 2-3 phút!');
  return { elapsedMs: Date.now() - startedAt, actionCount };
}

// ----------------------------------------------------
// Phase 2: Search for Facebook Page
// ----------------------------------------------------
async function searchFacebookPage(query, deadline) {
  console.log(`[fb-search] Searching for Fanpage: "${query}"...`);
  reportStep('fb_search_start', `Tìm kiếm Facebook Page: "${query}"...`);

  try {
    const searchInput = page.locator('input[aria-label*="Search Facebook"], input[aria-label*="Tìm kiếm trên Facebook"], input[placeholder*="Search"], input[type="search"], label[aria-label*="Search"] input, input[aria-label*="Tìm kiếm"]').first();
    
    if (await isVisibleSafe(searchInput)) {
      await searchInput.click().catch(() => {});
      await wait(500);
      await searchInput.fill(query).catch(() => {});
      await wait(800);
      await searchInput.press('Enter').catch(() => {});
    } else {
      console.log('[fb-search] Direct search input not found, navigating via URL...');
      await page.goto(`https://www.facebook.com/search/top/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
    }
  } catch (err) {
    console.log('[fb-search] Search action error, fallback navigation:', err.message || String(err));
    await page.goto(`https://www.facebook.com/search/top/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
  }

  await wait(4000 + randomInt(0, 2000));
  reportStep('fb_search_results', 'Đang quét kết quả tìm kiếm Page...');

  let pageFound = false;

  try {
    const pageLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const results = [];
      for (const a of anchors) {
        const text = (a.textContent || '').trim();
        const parentText = (a.closest('div[role="article"], div[role="main"] > div') || a.parentElement)?.textContent || '';
        const href = a.href || '';
        if (
          (text.includes('Khải Hoàn Derma') || text.includes('Dược mỹ phẩm-Khải Hoàn')) &&
          href.includes('facebook.com')
        ) {
          results.push({
            href,
            text,
            parentText,
            matchedInfo: parentText.includes('Spa') || parentText.includes('Vạn Thuỷ Tú') || parentText.includes('Phan Thiết') || parentText.includes('Bình Thuận')
          });
        }
      }
      return results;
    });

    console.log(`[fb-search] Found ${pageLinks.length} candidate Page links.`);

    if (pageLinks.length > 0) {
      const bestMatch = pageLinks.find(p => p.matchedInfo) || pageLinks[0];
      console.log('[fb-search] Opening target Fanpage:', bestMatch.href);

      const linkLocator = page.locator(`a[href="${bestMatch.href.replace(/"/g, '\\"')}"]`).first();
      if (await isVisibleSafe(linkLocator)) {
        await linkLocator.scrollIntoViewIfNeeded().catch(() => {});
        await wait(600);
        await linkLocator.click().catch(() => {});
        pageFound = true;
      } else {
        await page.goto(bestMatch.href, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
        pageFound = true;
      }
    }
  } catch (err) {
    console.log('[fb-search] Error matching page result:', err.message || String(err));
  }

  if (!pageFound) {
    console.log('[fb-search] Fallback: Navigating directly to Khải Hoàn Derma Fanpage URL...');
    await page.goto('https://www.facebook.com/khaihoanderma', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
  }

  await wait(4000 + randomInt(0, 2000));
  reportStep('fb_page_opened', 'Đã truy cập vào Fanpage Khải Hoàn Derma!');
  return true;
}

// ----------------------------------------------------
// Phase 3 & 4: Browse Fanpage & Target Website
// ----------------------------------------------------
async function auditFanpageAndWebsite(config, totalTargetDeadline) {
  console.log('[fb-target] Starting 7-minute combined Fanpage & Website interaction phase...');
  reportStep('fb_target_start', 'Bắt đầu lướt bài đăng Fanpage & tìm link Website...');

  let targetWebOpened = false;
  let activePage = page;

  // Step 3.1: Scroll 1 - 10 posts on Fanpage
  const postCount = randomInt(5, 10);
  console.log(`[fb-target] Will scroll up to ${postCount} posts on Fanpage...`);

  for (let pIndex = 1; pIndex <= postCount; pIndex++) {
    if (remainingMs(totalTargetDeadline) <= 30000 || targetWebOpened) break;

    console.log(`[fb-target] Inspection post ${pIndex}/${postCount}...`);
    reportStep('fb_post_reading', { postNum: pIndex, maxPosts: postCount });

    // Scroll down to reveal next post
    if (Math.random() < 0.65) await moveMouseNaturally();
    await safeMouseWheel(0, randomInt(350, 700));
    await waitWithinBudget(randomInt(4000, 9000), totalTargetDeadline);

    // Expand "Xem thêm" (See more) if available
    try {
      const seeMoreBtn = activePage.locator('div[role="button"]:has-text("Xem thêm"), div[role="button"]:has-text("See more"), span:has-text("Xem thêm")').first();
      if (await isVisibleSafe(seeMoreBtn)) {
        await seeMoreBtn.click().catch(() => {});
        await wait(1000);
      }
    } catch (e) {}

    // Check for target website link (khaihoanderma.com)
    try {
      const webLinks = await activePage.evaluate((targetDomain) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        const matches = [];
        for (const a of anchors) {
          const href = a.href || '';
          const text = (a.textContent || '').trim();
          if (href.includes(targetDomain) || href.includes('khaihoanderma') || text.includes('khaihoanderma.com')) {
            matches.push({ href, text, rawHref: a.getAttribute('href') || '' });
          }
        }
        return matches;
      }, config.targetDomain);

      if (webLinks.length > 0) {
        const targetLinkInfo = webLinks[0];
        console.log(`[fb-target] Found target link on post ${pIndex}: "${targetLinkInfo.href}"! Clicking now...`);
        reportStep('fb_link_found', `Tìm thấy link Web: ${targetLinkInfo.text || targetLinkInfo.href}`);

        const pageContext = activePage.context();
        const initialPagesCount = pageContext.pages().length;

        const targetAnchor = activePage.locator(`a[href="${targetLinkInfo.rawHref.replace(/"/g, '\\"')}"]`).first();
        if (await isVisibleSafe(targetAnchor)) {
          await targetAnchor.scrollIntoViewIfNeeded().catch(() => {});
          await wait(800);
          await targetAnchor.click().catch(() => {});
        } else {
          await activePage.goto(targetLinkInfo.href, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
        }

        await wait(3000);

        const newPages = pageContext.pages();
        if (newPages.length > initialPagesCount) {
          activePage = newPages[newPages.length - 1];
          console.log('[fb-target] Switched to new browser tab for target website!');
        }

        try {
          const proceedBtn = activePage.locator('button:has-text("Tiếp tục"), button:has-text("Continue"), a:has-text("Mở liên kết"), div[role="button"]:has-text("Tiếp tục")').first();
          if (await isVisibleSafe(proceedBtn)) {
            await proceedBtn.click().catch(() => {});
            await wait(2000);
          }
        } catch (e) {}

        targetWebOpened = true;
        break;
      }
    } catch (err) {
      console.log('[fb-target] Link search error:', err.message || String(err));
    }
  }

  // Fallback: If no link found in posts, navigate to targetBaseUrl directly
  if (!targetWebOpened) {
    console.log('[fb-target] No link found in scrolled posts. Navigating directly to target website...');
    reportStep('fb_link_fallback', 'Chuyển sang trang Web mục tiêu Khải Hoàn Derma...');
    try {
      await activePage.goto(config.targetBaseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      targetWebOpened = true;
    } catch (e) {}
  }

  await wait(3000);

  // ----------------------------------------------------
  // Phase 4: Target Website Audit & Cart Interaction
  // ----------------------------------------------------
  console.log('[web-audit] Interacting with target website (khaihoanderma.com)...');
  reportStep('web_audit_start', 'Đang lướt xem sản phẩm, hình ảnh & tương tác Web...');

  const visitedSet = new Set();
  let addedToCart = false;

  const currentWebUrl = cleanUrl(await activePage.url().catch(() => config.targetBaseUrl));
  visitedSet.add(currentWebUrl);

  while (remainingMs(totalTargetDeadline) > 10000) {
    const elapsedSec = Math.floor((420000 - remainingMs(totalTargetDeadline)) / 1000);
    reportStep('web_audit_reading', { elapsed: elapsedSec, total: 420, url: await activePage.url().catch(() => '') });

    // Scroll & View Content
    if (Math.random() < 0.70) {
      const deltaY = (Math.random() < 0.80 ? 1 : -1) * randomInt(280, 680);
      try {
        await activePage.mouse.wheel(0, deltaY);
      } catch (e) {}
      await waitWithinBudget(randomInt(3000, 7000), totalTargetDeadline);
    }

    // Inspect Tabs (Description / Ingredients / Reviews)
    try {
      const descTab = activePage.locator('#tab-title-description a, li.description_tab a').first();
      if (await isVisibleSafe(descTab)) {
        await descTab.click().catch(() => {});
        await waitWithinBudget(3000, totalTargetDeadline);
      }
      const reviewTab = activePage.locator('#tab-title-reviews a, li.reviews_tab a').first();
      if (await isVisibleSafe(reviewTab)) {
        await reviewTab.click().catch(() => {});
        await waitWithinBudget(3000, totalTargetDeadline);
      }
    } catch (e) {}

    // Add to Cart Simulation (35-50% chance)
    if (!addedToCart && Math.random() < 0.40) {
      try {
        const cartBtn = activePage.locator('button.single_add_to_cart_button, a.add_to_cart_button, .ajax_add_to_cart, button:has-text("Thêm vào giỏ"), a:has-text("Thêm vào giỏ")').first();
        if (await isVisibleSafe(cartBtn)) {
          console.log('[web-audit] Simulating Add to Cart click!');
          reportStep('web_add_to_cart', 'Bỏ sản phẩm vào giỏ hàng thành công!');
          await cartBtn.click().catch(() => {});
          addedToCart = true;
          await waitWithinBudget(4000, totalTargetDeadline);
        }
      } catch (e) {}
    }

    // Click Related / Internal Product Link
    if (Math.random() < 0.45 && remainingMs(totalTargetDeadline) > 40000) {
      try {
        const productLinks = await activePage.evaluate((targetDomain) => {
          const anchors = Array.from(document.querySelectorAll('a[href*="/product/"], a[href*="/cua-hang/"], .products a[href]'));
          return anchors
            .map(a => a.href)
            .filter(href => href.includes(targetDomain))
            .slice(0, 10);
        }, config.targetDomain);

        const unvisited = productLinks.filter(l => !visitedSet.has(cleanUrl(l)));
        if (unvisited.length > 0) {
          const nextLink = unvisited[0];
          visitedSet.add(cleanUrl(nextLink));
          console.log('[web-audit] Navigating to next product:', nextLink);
          await activePage.goto(nextLink, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await waitWithinBudget(4000, totalTargetDeadline);
        }
      } catch (e) {}
    }
  }

  reportStep('web_audit_done', 'Hoàn tất toàn bộ 7 phút lướt Facebook & Website!');
  return {
    targetWebOpened,
    addedToCart,
    visitedPagesCount: visitedSet.size,
  };
}

// ----------------------------------------------------
// Main Script Entry Point
// ----------------------------------------------------
async function main() {
  const config = {
    fbSearchQuery: String(param('fbSearchQuery') || DEFAULTS.fbSearchQuery),
    targetDomain: String(param('targetDomain') || DEFAULTS.targetDomain),
    targetBaseUrl: String(param('targetBaseUrl') || DEFAULTS.targetBaseUrl),
    fbWarmupMinSeconds: Number(param('fbWarmupMinSeconds') || DEFAULTS.fbWarmupMinSeconds),
    fbWarmupMaxSeconds: Number(param('fbWarmupMaxSeconds') || DEFAULTS.fbWarmupMaxSeconds),
    targetSessionTotalSeconds: Number(param('targetSessionTotalSeconds') || DEFAULTS.targetSessionTotalSeconds),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
  };

  console.log('[fb-flow] Starting Facebook Warmup & Traffic Injection flow with config:', JSON.stringify(config));

  // Phase 1: Facebook Feed Warmup (2 - 3 minutes)
  const warmupDeadline = Date.now() + (config.fbWarmupMaxSeconds + 30) * 1000;
  const warmupStats = await warmupFacebookFeed(config, warmupDeadline);

  // Phase 2: Search for Facebook Page
  const searchDeadline = Date.now() + 60000;
  await searchFacebookPage(config.fbSearchQuery, searchDeadline);

  // Phase 3 & 4: Combined Fanpage & Website Session (7 minutes / 420s)
  const totalTargetMs = config.targetSessionTotalSeconds * 1000;
  const totalTargetDeadline = Date.now() + totalTargetMs;
  const auditStats = await auditFanpageAndWebsite(config, totalTargetDeadline);

  const finalOutput = {
    app: 'facebook-traffic-derma',
    warmupStats,
    auditStats,
    finishedAt: new Date().toISOString(),
  };

  console.log('[fb-flow] Flow completed successfully:', JSON.stringify(finalOutput, null, 2));

  await omni.file.export(finalOutput, {
    path: config.exportPath,
    format: 'json',
    onConflict: 'overwrite',
  }).catch(() => {});

  return finalOutput;
}

return await main();
