const DEFAULTS = {
  fbSearchQuery: 'Dược mỹ phẩm-Khải Hoàn Derma',
  targetDomain: 'khaihoanderma.com',
  targetBaseUrl: 'https://khaihoanderma.com/',
  fbWarmupMinSeconds: 60,  // 1 minute
  fbWarmupMaxSeconds: 120, // 2 minutes
  targetWebMinSeconds: 120, // 2 minutes
  targetWebMaxSeconds: 240, // 4 minutes
  exportPath: 'C:\\Users\\Admin\\Desktop\\key_derma\\facebook-traffic-derma-output.json',
};

const WEBSITE_SEARCH_KEYWORDS = [
  'mụn viêm',
  'phục hồi da',
  'tretinoin',
  'serum',
  'kem chống nắng',
  'kẽm',
  'niacinamide',
  'sữa rửa mặt',
  'tẩy trang',
];

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
// Step 1: Facebook Feed Warmup (1 - 2 minutes)
// ----------------------------------------------------
async function watchFacebookStory(activePage, warmupDeadline) {
  try {
    // Scroll to top of feed to see Story tray
    await activePage.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await wait(1500);

    const storyClicked = await activePage.evaluate(() => {
      // Find Story cards in Facebook top tray
      const storyCandidates = Array.from(document.querySelectorAll('a[href*="/stories/"], div[role="button"][aria-label*="story" i], div[role="button"][aria-label*="tin" i], div[role="button"][aria-label*="Story" i], div[role="button"][aria-label*="Tin" i]'));
      for (const card of storyCandidates) {
        const text = (card.textContent || '').trim();
        if (!text.includes('Tạo tin') && !text.includes('Create story') && !text.includes('Tạo Story')) {
          const rect = card.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 20 && rect.top >= 0 && rect.top < 450) {
            try {
              card.scrollIntoView({ block: 'center', inline: 'center' });
              card.click();
              return true;
            } catch (e) {}
          }
        }
      }
      return false;
    });

    if (storyClicked) {
      console.log('[fb-warmup] Successfully opened Facebook Story! Watching 8-12 seconds...');
      reportStep('fb_warmup_story', 'Đang mở xem Story trên Facebook...');
      await waitWithinBudget(randomInt(8000, 12000), warmupDeadline);
      await activePage.keyboard.press('Escape').catch(() => {});
      await wait(1500);
      return true;
    }
  } catch (err) {
    console.log('[fb-warmup] watchFacebookStory error:', err.message || String(err));
  }
  return false;
}

async function watchFacebookVideo(activePage, warmupDeadline) {
  try {
    const videoClicked = await activePage.evaluate(() => {
      const videoEls = Array.from(document.querySelectorAll('video, a[href*="/watch/"], a[href*="/reel/"]'));
      for (const v of videoEls) {
        const rect = v.getBoundingClientRect();
        if (rect.width > 80 && rect.height > 80 && rect.top > 0 && rect.top < window.innerHeight) {
          try {
            v.scrollIntoView({ block: 'center' });
            v.click();
            return true;
          } catch (e) {}
        }
      }
      return false;
    });

    if (videoClicked) {
      console.log('[fb-warmup] Focused on Video/Reel! Watching 10-16 seconds...');
      reportStep('fb_warmup_video', 'Đang tạm dừng xem Video/Reel trên Feed...');
      await waitWithinBudget(randomInt(10000, 16000), warmupDeadline);
      return true;
    }
  } catch (err) {
    console.log('[fb-warmup] watchFacebookVideo error:', err.message || String(err));
  }
  return false;
}

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

  // 1. Thao tác 1: Bắt buộc thử xem Story ở đầu trang
  await watchFacebookStory(page, warmupDeadline);

  let actionCount = 0;
  let videoWatched = false;

  while (remainingMs(warmupDeadline) > 0) {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const totalSec = Math.floor(targetDurationMs / 1000);
    reportStep('fb_warmup_reading', { elapsed: elapsedSec, total: totalSec });

    // 2. Thao tác 2: Cuộn mượt qua các bài đăng trên Feed dùng window.scrollBy
    if (Math.random() < 0.60) await moveMouseNaturally();

    const scrollDistance = randomInt(450, 850);
    await page.evaluate((dist) => {
      window.scrollBy({ top: dist, behavior: 'smooth' });
    }, scrollDistance).catch(() => {});

    await safeMouseWheel(0, randomInt(200, 400));
    actionCount++;
    await waitWithinBudget(randomInt(3000, 5500), warmupDeadline);

    // 3. Thao tác 3: Tạm dừng xem Video / Reel khi gặp trên feed
    if (!videoWatched && Math.random() < 0.40 && remainingMs(warmupDeadline) > 15000) {
      videoWatched = await watchFacebookVideo(page, warmupDeadline);
      if (videoWatched) actionCount++;
    }

    // 4. Thao tác 4: Xem & cuộn qua phần bình luận nếu có
    if (Math.random() < 0.20 && remainingMs(warmupDeadline) > 12000) {
      try {
        const commentBtn = page.locator('div[role="button"]:has-text("Bình luận"), div[role="button"]:has-text("Comment"), span:has-text("bình luận")').first();
        if (await isVisibleSafe(commentBtn)) {
          console.log('[fb-warmup] Expanding comments on post...');
          reportStep('fb_warmup_comment', 'Bấm mở đọc bình luận trên bài đăng...');
          await commentBtn.scrollIntoViewIfNeeded().catch(() => {});
          await wait(600);
          await commentBtn.click().catch(() => {});
          await waitWithinBudget(randomInt(3000, 5000), warmupDeadline);
          await page.keyboard.press('Escape').catch(() => {});
          // Scroll past comment section immediately
          await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' })).catch(() => {});
          await wait(1000);
          actionCount++;
        }
      } catch (e) {}
    }
  }

  reportStep('fb_warmup_done', 'Đã hoàn thành lướt Facebook Feed 1-2 phút!');
  return { elapsedMs: Date.now() - startedAt, actionCount };
}

// ----------------------------------------------------
// Step 2: Search for Facebook Page
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

async function expandSeeMoreButtons(activePage) {
  try {
    const clickedCount = await activePage.evaluate(() => {
      let count = 0;
      const candidates = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], span, div, a'));
      for (const el of candidates) {
        const text = (el.textContent || '').trim();
        if (
          text === 'Xem thêm' ||
          text === 'See more' ||
          text.includes('Xem thêm') ||
          text.includes('See more')
        ) {
          if (text.length < 35) {
            try {
              el.click();
              count++;
            } catch (e) {}
          }
        }
      }
      return count;
    });
    if (clickedCount > 0) {
      console.log(`[fb-target] Clicked ${clickedCount} "Xem thêm" button(s) to expand post text!`);
      await wait(1500);
    }
  } catch (err) {
    console.log('[fb-target] expandSeeMoreButtons error:', err.message || String(err));
  }
}

function safeGetPages(pg) {
  try {
    const ctx = (typeof pg.context === 'function') ? pg.context() : (pg.context || null);
    if (ctx && typeof ctx.pages === 'function') {
      return ctx.pages();
    }
  } catch (e) {}
  try {
    if (typeof browser !== 'undefined' && browser && typeof browser.pages === 'function') {
      return browser.pages();
    }
  } catch (e) {}
  return [pg];
}

async function findAndClickPostWebsiteLink(activePage, targetDomain) {
  try {
    const linkLocatorInfo = await activePage.evaluate((domain) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const href = a.href || '';
        const rawHref = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim();

        const isDirect = href.includes(domain) || text.includes(domain) || rawHref.includes(domain);
        const isFbRedirect = href.includes('l.facebook.com/l.php') && (decodeURIComponent(href).includes(domain) || decodeURIComponent(rawHref).includes(domain));

        if (isDirect || isFbRedirect) {
          a.scrollIntoView({ block: 'center', inline: 'center' });
          const rect = a.getBoundingClientRect();
          try {
            a.click();
          } catch (e) {}
          return {
            success: true,
            href,
            rawHref,
            text: text || href,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          };
        }
      }
      return { success: false };
    }, targetDomain);

    if (linkLocatorInfo.success) {
      console.log(`[fb-target] Located and clicked target link in DOM: ${linkLocatorInfo.href}`);

      if (linkLocatorInfo.x > 0 && linkLocatorInfo.y > 0 && linkLocatorInfo.y < 1200) {
        try {
          await activePage.mouse.click(linkLocatorInfo.x, linkLocatorInfo.y).catch(() => {});
        } catch (e) {}
      }

      return {
        success: true,
        href: linkLocatorInfo.href
      };
    }
  } catch (err) {
    console.log('[fb-target] findAndClickPostWebsiteLink error:', err.message || String(err));
  }
  return { success: false };
}

// ----------------------------------------------------
// Step 3 & 4: Fanpage Posts Scroll & Target Website Interactions
// ----------------------------------------------------
async function auditFanpageAndWebsite(config, globalDeadline) {
  console.log('[fb-target] Starting Fanpage 10 posts inspection & website referral phase...');
  reportStep('fb_target_start', 'Bắt đầu lướt 10 bài đăng Fanpage & tìm link Website...');

  let targetWebOpened = false;
  let activePage = page;
  let clickedLinkInfo = null;

  // Step 3: Lướt xem từ từ 10 bài ngẫu nhiên gần nhất trên Fanpage
  const maxPostsToInspect = 10;

  for (let postIdx = 1; postIdx <= maxPostsToInspect; postIdx++) {
    if (targetWebOpened || remainingMs(globalDeadline) <= 60000) break;

    console.log(`[fb-target] Inspecting Fanpage post ${postIdx}/${maxPostsToInspect}...`);
    reportStep('fb_post_reading', { postNum: postIdx, maxPosts: maxPostsToInspect });

    // Cuộn xuống từ từ để xem bài đăng tiếp theo
    if (Math.random() < 0.65) await moveMouseNaturally();
    await safeMouseWheel(0, randomInt(380, 750));
    await wait(randomInt(3000, 5000)); // Dừng lại từ từ 3-5s đọc bài

    // Bấm nút "Xem thêm" trên bài đăng
    await expandSeeMoreButtons(activePage);

    // Kiểm tra và bấm link khaihoanderma.com trên bài đăng
    const clickResult = await findAndClickPostWebsiteLink(activePage, config.targetDomain);

    if (clickResult.success) {
      clickedLinkInfo = clickResult;
      console.log(`[fb-target] Clicked post website link: ${clickResult.href}`);
      reportStep('fb_link_found', `Đã bấm mở link trên bài đăng Fanpage sang ${config.targetDomain}`);

      await wait(4000);

      // Check open tabs safely without throwing page.context is not a function
      const pages = safeGetPages(activePage);
      console.log(`[fb-target] Total open tabs in context: ${pages.length}`);

      const targetTab = pages.find(p => {
        try { return p.url().includes(config.targetDomain); } catch { return false; }
      }) || pages.find(p => {
        try { return p.url().includes('l.facebook.com'); } catch { return false; }
      });

      if (targetTab) {
        activePage = targetTab;
        await activePage.bringToFront().catch(() => {});
        console.log('[fb-target] Switched activePage to target tab:', await activePage.url().catch(() => ''));
      }

      // Outbound redirect modal handler ("Bạn đang rời khỏi Facebook")
      try {
        const currentUrl = await activePage.url().catch(() => '');
        if (currentUrl.includes('l.facebook.com') || currentUrl.includes('facebook.com')) {
          const proceedBtn = activePage.locator('button:has-text("Tiếp tục"), button:has-text("Continue"), a:has-text("Mở liên kết"), div[role="button"]:has-text("Tiếp tục"), a[href*="khaihoanderma.com"]').first();
          if (await isVisibleSafe(proceedBtn)) {
            console.log('[fb-target] Outbound redirect modal detected! Clicking Continue/Tiếp tục...');
            await proceedBtn.click().catch(() => {});
            await wait(5000);

            const updatedPages = safeGetPages(activePage);
            const webTab = updatedPages.find(p => {
              try { return p.url().includes(config.targetDomain); } catch { return false; }
            });
            if (webTab) {
              activePage = webTab;
              await activePage.bringToFront().catch(() => {});
            }
          }
        }
      } catch (e) {}

      // Verify activePage URL
      const finalUrl = await activePage.url().catch(() => '');
      console.log('[fb-target] Final activePage URL before Step 4:', finalUrl);

      if (!finalUrl.includes(config.targetDomain)) {
        console.log('[fb-target] Direct redirect fallback: navigating activePage to target website...');
        const destinationUrl = clickResult.href.includes(config.targetDomain) ? clickResult.href : config.targetBaseUrl;
        await activePage.goto(destinationUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
      }

      targetWebOpened = true;
      break;
    }
  }

  // ----------------------------------------------------
  // Step 4: Target Website Interactions (Random 2 - 4 Minutes / 120-240s)
  // ----------------------------------------------------
  const targetWebSeconds = randomInt(config.targetWebMinSeconds, config.targetWebMaxSeconds);
  console.log(`[web-audit] Starting ${targetWebSeconds}-second natural interaction on target website (2-4 minutes)...`);
  reportStep('web_audit_start', `Đang lướt đọc bài, xem sản phẩm & giỏ hàng (${targetWebSeconds}s)...`);

  const webDurationMs = targetWebSeconds * 1000;
  const webDeadline = Date.now() + webDurationMs;
  const webStartedAt = Date.now();

  const visitedSet = new Set();
  let addedToCart = false;
  let searchPerformed = false;

  const currentWebUrl = cleanUrl(await activePage.url().catch(() => config.targetBaseUrl));
  visitedSet.add(currentWebUrl);

  while (remainingMs(webDeadline) > 0) {
    const elapsedSec = Math.floor((Date.now() - webStartedAt) / 1000);
    const totalSec = targetWebSeconds;
    reportStep('web_audit_reading', { elapsed: elapsedSec, total: totalSec, url: await activePage.url().catch(() => '') });

    const actionRoll = Math.random();

    // Action A: Lướt đọc bài & xem ảnh sản phẩm (40%)
    if (actionRoll < 0.40) {
      const deltaY = (Math.random() < 0.80 ? 1 : -1) * randomInt(280, 680);
      try {
        await activePage.mouse.wheel(0, deltaY);
      } catch (e) {}
      await waitWithinBudget(randomInt(3000, 7000), webDeadline);
    }
    // Action B: Mở Tab Mô tả / Thành phần / Đánh giá sản phẩm (20%)
    else if (actionRoll < 0.60) {
      try {
        const descTab = activePage.locator('#tab-title-description a, li.description_tab a').first();
        if (await isVisibleSafe(descTab)) {
          await descTab.click().catch(() => {});
          await waitWithinBudget(3000, webDeadline);
        }
        const reviewTab = activePage.locator('#tab-title-reviews a, li.reviews_tab a').first();
        if (await isVisibleSafe(reviewTab)) {
          await reviewTab.click().catch(() => {});
          await waitWithinBudget(3000, webDeadline);
        }
      } catch (e) {}
    }
    // Action C: Tìm kiếm sản phẩm trên thanh tìm kiếm của Website (15%)
    else if (!searchPerformed && actionRoll < 0.75 && remainingMs(webDeadline) > 25000) {
      try {
        const searchInput = activePage.locator('input[name="s"], input[type="search"], .search-field, input[placeholder*="Tìm"], input[placeholder*="Search"]').first();
        if (await isVisibleSafe(searchInput)) {
          const keyword = WEBSITE_SEARCH_KEYWORDS[Math.floor(Math.random() * WEBSITE_SEARCH_KEYWORDS.length)];
          console.log(`[web-audit] Internal site search for keyword: "${keyword}"...`);
          reportStep('web_search', `Tìm kiếm nội bộ website: "${keyword}"...`);

          await searchInput.click().catch(() => {});
          await wait(500);
          await searchInput.fill(keyword).catch(() => {});
          await wait(800);
          await searchInput.press('Enter').catch(() => {});
          searchPerformed = true;
          await waitWithinBudget(randomInt(4000, 8000), webDeadline);
        }
      } catch (e) {}
    }
    // Action D: Bỏ sản phẩm vào giỏ hàng (15%)
    else if (!addedToCart && actionRoll < 0.90) {
      try {
        const cartBtn = activePage.locator('button.single_add_to_cart_button, a.add_to_cart_button, .ajax_add_to_cart, button:has-text("Thêm vào giỏ"), a:has-text("Thêm vào giỏ")').first();
        if (await isVisibleSafe(cartBtn)) {
          console.log('[web-audit] Simulating Add to Cart click!');
          reportStep('web_add_to_cart', 'Bỏ sản phẩm vào giỏ hàng thành công!');
          await cartBtn.click().catch(() => {});
          addedToCart = true;
          await waitWithinBudget(4000, webDeadline);
        }
      } catch (e) {}
    }
    // Action E: Xem các sản phẩm/bài viết tương tự (10%)
    else {
      try {
        const productLinks = await activePage.evaluate((targetDomain) => {
          const anchors = Array.from(document.querySelectorAll('a[href]'));
          return anchors
            .map(a => a.href)
            .filter(href => href.includes(targetDomain) && !href.includes('#'))
            .slice(0, 15);
        }, config.targetDomain);

        const unvisited = productLinks.filter(l => !visitedSet.has(cleanUrl(l)));
        if (unvisited.length > 0) {
          const nextLink = unvisited[0];
          visitedSet.add(cleanUrl(nextLink));
          console.log('[web-audit] Navigating to next product/article:', nextLink);
          await activePage.goto(nextLink, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await waitWithinBudget(4000, webDeadline);
        }
      } catch (e) {}
    }
  }

  reportStep('web_audit_done', `Hoàn tất ${targetWebSeconds}s lướt đọc bài & tương tác Website!`);
  return {
    targetWebOpened,
    addedToCart,
    visitedPagesCount: visitedSet.size,
    clickedLinkInfo,
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
    targetWebMinSeconds: Number(param('targetWebMinSeconds') || DEFAULTS.targetWebMinSeconds),
    targetWebMaxSeconds: Number(param('targetWebMaxSeconds') || DEFAULTS.targetWebMaxSeconds),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
  };

  console.log('[fb-flow] Starting Facebook Warmup & Traffic Injection flow with config:', JSON.stringify(config));

  // Step 1: Facebook Feed Warmup (1 - 2 minutes)
  const warmupDeadline = Date.now() + (config.fbWarmupMaxSeconds + 30) * 1000;
  const warmupStats = await warmupFacebookFeed(config, warmupDeadline);

  // Step 2: Search for Facebook Page
  const searchDeadline = Date.now() + 60000;
  await searchFacebookPage(config.fbSearchQuery, searchDeadline);

  // Step 3 & 4: Fanpage Posts Scroll & Target Website Interactions (Random 2 - 4 minutes)
  const globalDeadline = Date.now() + (config.targetWebMaxSeconds + 180) * 1000;
  const auditStats = await auditFanpageAndWebsite(config, globalDeadline);

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
async function watchFacebookStory(activePage, warmupDeadline) {
  try {
    const storyClicked = await activePage.evaluate(() => {
      const storyCards = Array.from(document.querySelectorAll('a[href*="/stories/"], div[role="button"][aria-label*="story"], div[role="button"][aria-label*="Story"], div[role="button"][aria-label*="tin"], div[role="button"][aria-label*="Tin"]'));
      for (const card of storyCards) {
        const text = (card.textContent || '').trim();
        if (!text.includes('Tạo tin') && !text.includes('Create story') && !text.includes('Tạo Story')) {
          const rect = card.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 20 && rect.top < 350) {
            try {
              card.click();
              return true;
            } catch (e) {}
          }
        }
      }
      return false;
    });

    if (storyClicked) {
      console.log('[fb-warmup] Successfully opened Facebook Story! Watching 6-12 seconds...');
      reportStep('fb_warmup_story', 'Đang xem Story ngẫu nhiên trên Facebook...');
      await waitWithinBudget(randomInt(6000, 12000), warmupDeadline);
      await activePage.keyboard.press('Escape').catch(() => {});
      await wait(1500);
      return true;
    }
  } catch (err) {
    console.log('[fb-warmup] watchFacebookStory error:', err.message || String(err));
  }
  return false;
}

async function watchFacebookVideo(activePage, warmupDeadline) {
  try {
    const videoClicked = await activePage.evaluate(() => {
      const videoEls = Array.from(document.querySelectorAll('video, a[href*="/watch/"], a[href*="/reel/"]'));
      for (const v of videoEls) {
        const rect = v.getBoundingClientRect();
        if (rect.width > 80 && rect.height > 80 && rect.top > 0 && rect.top < window.innerHeight) {
          try {
            v.scrollIntoView({ block: 'center' });
            v.click();
            return true;
          } catch (e) {}
        }
      }
      return false;
    });

    if (videoClicked) {
      console.log('[fb-warmup] Successfully focused on Video/Reel! Watching 10-20 seconds...');
      reportStep('fb_warmup_video', 'Đang tạm dừng xem Video/Reel ngẫu nhiên...');
      await waitWithinBudget(randomInt(10000, 20000), warmupDeadline);
      return true;
    }
  } catch (err) {
    console.log('[fb-warmup] watchFacebookVideo error:', err.message || String(err));
  }
  return false;
}

// ----------------------------------------------------
// Phase 1: Facebook Feed Warmup (Random 1 - 2 minutes)
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

  // 1. Try viewing a Story at top of feed (6-12s)
  if (Math.random() < 0.70) {
    await watchFacebookStory(page, warmupDeadline);
  }

  let actionCount = 0;
  let videoWatched = false;

  while (remainingMs(warmupDeadline) > 0) {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const totalSec = Math.floor(targetDurationMs / 1000);
    reportStep('fb_warmup_reading', { elapsed: elapsedSec, total: totalSec });

    // Always scroll feed down to see next post
    if (Math.random() < 0.60) await moveMouseNaturally();
    const deltaY = randomInt(350, 750);
    await safeMouseWheel(0, deltaY);
    actionCount++;
    await waitWithinBudget(randomInt(2500, 5000), warmupDeadline);

    // Random action: Watch Video (30% chance, max 1 time)
    if (!videoWatched && Math.random() < 0.35 && remainingMs(warmupDeadline) > 20000) {
      videoWatched = await watchFacebookVideo(page, warmupDeadline);
      if (videoWatched) actionCount++;
    }

    // Random action: Read comment (30% chance)
    if (Math.random() < 0.30 && remainingMs(warmupDeadline) > 15000) {
      try {
        const commentBtn = page.locator('div[role="button"]:has-text("Bình luận"), div[role="button"]:has-text("Comment"), span:has-text("bình luận")').first();
        if (await isVisibleSafe(commentBtn)) {
          console.log('[fb-warmup] Expanding comments on post...');
          reportStep('fb_warmup_comment', 'Bấm mở đọc bình luận trên bài đăng...');
          await commentBtn.scrollIntoViewIfNeeded().catch(() => {});
          await wait(600);
          await commentBtn.click().catch(() => {});
          await waitWithinBudget(randomInt(3000, 6000), warmupDeadline);
          await page.keyboard.press('Escape').catch(() => {}); // Close comment popover if open
          await wait(1000);
          actionCount++;
        }
      } catch (e) {}
    }
  }

  reportStep('fb_warmup_done', 'Đã hoàn thành lướt Facebook Feed 1-2 phút!');
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

async function expandSeeMoreButtons(activePage) {
  try {
    const clickedCount = await activePage.evaluate(() => {
      let count = 0;
      const candidates = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], span, div, a'));
      for (const el of candidates) {
        const text = (el.textContent || '').trim();
        if (
          text === 'Xem thêm' ||
          text === 'See more' ||
          text.includes('Xem thêm') ||
          text.includes('See more')
        ) {
          if (text.length < 35) {
            try {
              el.click();
              count++;
            } catch (e) {}
          }
        }
      }
      return count;
    });
    if (clickedCount > 0) {
      console.log(`[fb-target] Clicked ${clickedCount} "Xem thêm" button(s) to expand post text!`);
      await wait(1500);
    }
  } catch (err) {
    console.log('[fb-target] expandSeeMoreButtons error:', err.message || String(err));
  }
}

async function findAndClickPostWebsiteLink(activePage, targetDomain) {
  try {
    const linkResult = await activePage.evaluate((domain) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const href = a.href || '';
        const rawHref = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim();

        const isDirect = href.includes(domain) || text.includes(domain);
        const isFbRedirect = href.includes('l.facebook.com/l.php') && decodeURIComponent(href).includes(domain);

        if (isDirect || isFbRedirect) {
          const rect = a.getBoundingClientRect();
          try {
            a.scrollIntoView({ block: 'center', inline: 'center' });
            a.click();
          } catch (e) {}
          return {
            success: true,
            href,
            rawHref,
            text: text || href,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          };
        }
      }
      return { success: false };
    }, targetDomain);

    if (linkResult.success) {
      console.log(`[fb-target] Found and clicked post link in DOM: ${linkResult.href}`);
      if (linkResult.x > 0 && linkResult.y > 0 && linkResult.y < 1200) {
        try {
          await activePage.mouse.click(linkResult.x, linkResult.y).catch(() => {});
        } catch (e) {}
      }
      return linkResult;
    }
  } catch (err) {
    console.log('[fb-target] findAndClickPostWebsiteLink error:', err.message || String(err));
  }
  return { success: false };
}

// ----------------------------------------------------
// Phase 3 & 4: Browse Fanpage Posts & Target Website
// ----------------------------------------------------
async function auditFanpageAndWebsite(config, globalDeadline) {
  console.log('[fb-target] Starting Fanpage post scrolling & website referral phase...');
  reportStep('fb_target_start', 'Bắt đầu lướt bài đăng Fanpage & tìm link Website...');

  let targetWebOpened = false;
  let activePage = page;
  let clickedLinkInfo = null;

  let pIndex = 1;
  const maxScrollAttempts = 20;

  while (pIndex <= maxScrollAttempts && !targetWebOpened && remainingMs(globalDeadline) > 60000) {
    console.log(`[fb-target] Inspection Fanpage post section ${pIndex}...`);
    reportStep('fb_post_reading', { postNum: pIndex, maxPosts: 15 });

    if (Math.random() < 0.65) await moveMouseNaturally();
    await safeMouseWheel(0, randomInt(380, 750));
    await wait(randomInt(3000, 6000));

    // Expand "Xem thêm" (See more) to reveal truncated links inside post text
    await expandSeeMoreButtons(activePage);

    // Find and click the website link inside post text
    const clickResult = await findAndClickPostWebsiteLink(activePage, config.targetDomain);

    if (clickResult.success) {
      clickedLinkInfo = clickResult;
      console.log(`[fb-target] Successfully clicked post link to ${clickResult.href}!`);
      reportStep('fb_link_found', `Đã bấm mở link bài đăng Fanpage sang ${config.targetDomain}`);

      await wait(4000);

      const pageContext = typeof activePage.context === 'function' ? activePage.context() : page.context();
      const pages = pageContext.pages();
      const targetTab = pages.find(p => p.url().includes(config.targetDomain)) ||
                        pages.find(p => p.url().includes('l.facebook.com'));

      if (targetTab) {
        activePage = targetTab;
      }

      try {
        const currentUrl = await activePage.url().catch(() => '');
        if (currentUrl.includes('l.facebook.com') || currentUrl.includes('facebook.com')) {
          const proceedBtn = activePage.locator('button:has-text("Tiếp tục"), button:has-text("Continue"), a:has-text("Mở liên kết"), div[role="button"]:has-text("Tiếp tục"), a[href*="khaihoanderma.com"]').first();
          if (await isVisibleSafe(proceedBtn)) {
            console.log('[fb-target] Outbound redirect modal detected! Clicking Continue/Tiếp tục...');
            await proceedBtn.click().catch(() => {});
            await wait(4000);
          }
        }
      } catch (e) {}

      targetWebOpened = true;
      break;
    }

    pIndex++;
  }

  // ----------------------------------------------------
  // Phase 4: Target Website Interaction (Random 2 - 4 Minutes / 120 - 240s)
  // ----------------------------------------------------
  const targetWebSeconds = randomInt(config.targetWebMinSeconds, config.targetWebMaxSeconds);
  console.log(`[web-audit] Starting ${targetWebSeconds}-second natural interaction on target website...`);
  reportStep('web_audit_start', `Đang lướt đọc bài, xem sản phẩm & giỏ hàng (${targetWebSeconds}s)...`);

  const webDurationMs = targetWebSeconds * 1000;
  const webDeadline = Date.now() + webDurationMs;
  const webStartedAt = Date.now();

  const visitedSet = new Set();
  let addedToCart = false;

  const currentWebUrl = cleanUrl(await activePage.url().catch(() => config.targetBaseUrl));
  visitedSet.add(currentWebUrl);

  while (remainingMs(webDeadline) > 0) {
    const elapsedSec = Math.floor((Date.now() - webStartedAt) / 1000);
    const totalSec = targetWebSeconds;
    reportStep('web_audit_reading', { elapsed: elapsedSec, total: totalSec, url: await activePage.url().catch(() => '') });

    // Scroll & View Content
    if (Math.random() < 0.70) {
      const deltaY = (Math.random() < 0.80 ? 1 : -1) * randomInt(280, 680);
      try {
        await activePage.mouse.wheel(0, deltaY);
      } catch (e) {}
      await waitWithinBudget(randomInt(3000, 7000), webDeadline);
    }

    // Inspect Tabs (Description / Ingredients / Reviews)
    try {
      const descTab = activePage.locator('#tab-title-description a, li.description_tab a').first();
      if (await isVisibleSafe(descTab)) {
        await descTab.click().catch(() => {});
        await waitWithinBudget(3000, webDeadline);
      }
      const reviewTab = activePage.locator('#tab-title-reviews a, li.reviews_tab a').first();
      if (await isVisibleSafe(reviewTab)) {
        await reviewTab.click().catch(() => {});
        await waitWithinBudget(3000, webDeadline);
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
          await waitWithinBudget(4000, webDeadline);
        }
      } catch (e) {}
    }

    // Click Related / Internal Product Link
    if (Math.random() < 0.45 && remainingMs(webDeadline) > 30000) {
      try {
        const productLinks = await activePage.evaluate((targetDomain) => {
          const anchors = Array.from(document.querySelectorAll('a[href]'));
          return anchors
            .map(a => a.href)
            .filter(href => href.includes(targetDomain) && !href.includes('#'))
            .slice(0, 15);
        }, config.targetDomain);

        const unvisited = productLinks.filter(l => !visitedSet.has(cleanUrl(l)));
        if (unvisited.length > 0) {
          const nextLink = unvisited[0];
          visitedSet.add(cleanUrl(nextLink));
          console.log('[web-audit] Navigating to next product/article:', nextLink);
          await activePage.goto(nextLink, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await waitWithinBudget(4000, webDeadline);
        }
      } catch (e) {}
    }
  }

  reportStep('web_audit_done', `Hoàn tất ${targetWebSeconds}s lướt đọc bài & tương tác Website!`);
  return {
    targetWebOpened,
    addedToCart,
    visitedPagesCount: visitedSet.size,
    clickedLinkInfo,
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
    targetWebMinSeconds: Number(param('targetWebMinSeconds') || DEFAULTS.targetWebMinSeconds),
    targetWebMaxSeconds: Number(param('targetWebMaxSeconds') || DEFAULTS.targetWebMaxSeconds),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
  };

  console.log('[fb-flow] Starting Facebook Warmup & Traffic Injection flow with config:', JSON.stringify(config));

  // Phase 1: Facebook Feed Warmup (2 - 3 minutes)
  const warmupDeadline = Date.now() + (config.fbWarmupMaxSeconds + 30) * 1000;
  const warmupStats = await warmupFacebookFeed(config, warmupDeadline);

  // Phase 2: Search for Facebook Page
  const searchDeadline = Date.now() + 60000;
  await searchFacebookPage(config.fbSearchQuery, searchDeadline);

  // Phase 3 & 4: Fanpage Link Click & Website Session (Random 2 - 4 minutes)
  const globalDeadline = Date.now() + (config.targetWebMaxSeconds + 180) * 1000;
  const auditStats = await auditFanpageAndWebsite(config, globalDeadline);

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

async function expandSeeMoreButtons(activePage) {
  try {
    const clickedCount = await activePage.evaluate(() => {
      let count = 0;
      const elements = Array.from(document.querySelectorAll('div[role="button"], span[dir="auto"], div, span'));
      for (const el of elements) {
        const text = (el.textContent || '').trim();
        if (text === 'Xem thêm' || text === 'See more' || text.endsWith('Xem thêm') || text.endsWith('See more')) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.top > 0) {
            try {
              el.click();
              count++;
            } catch (e) {}
          }
        }
      }
      return count;
    });
    if (clickedCount > 0) {
      console.log(`[fb-target] Clicked ${clickedCount} "Xem thêm" button(s) to expand post text!`);
      await wait(1500);
    }
  } catch (err) {
    console.log('[fb-target] expandSeeMoreButtons error:', err.message || String(err));
  }
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

    // Expand "Xem thêm" (See more) to reveal truncated links inside post text
    await expandSeeMoreButtons(activePage);

    // Check for target website link (khaihoanderma.com)
    try {
      const webLinks = await activePage.evaluate((targetDomain) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        const matches = [];
        for (const a of anchors) {
          const href = a.href || '';
          const rawHref = a.getAttribute('href') || '';
          const text = (a.textContent || '').trim();
          
          const isDirect = href.includes(targetDomain) || text.includes(targetDomain);
          const isFbRedirect = href.includes('l.facebook.com/l.php') && decodeURIComponent(href).includes(targetDomain);

          if (isDirect || isFbRedirect) {
            matches.push({ href, text, rawHref });
          }
        }
        return matches;
      }, config.targetDomain);

      if (webLinks.length > 0) {
        const targetLinkInfo = webLinks[0];
        console.log(`[fb-target] Found target link on post ${pIndex}: "${targetLinkInfo.href}"! Clicking now...`);
        reportStep('fb_link_found', `Tìm thấy link Web: ${targetLinkInfo.text || targetLinkInfo.href}`);

        const pageContext = typeof activePage.context === 'function' ? activePage.context() : page.context();
        const initialPagesCount = pageContext.pages().length;

        let linkClicked = false;
        try {
          if (targetLinkInfo.rawHref) {
            const targetAnchor = activePage.locator(`a[href="${targetLinkInfo.rawHref.replace(/"/g, '\\"')}"]`).first();
            if (await isVisibleSafe(targetAnchor)) {
              await targetAnchor.scrollIntoViewIfNeeded().catch(() => {});
              await wait(800);
              await targetAnchor.click().catch(() => {});
              linkClicked = true;
            }
          }
        } catch (e) {}

        if (!linkClicked) {
          await activePage.goto(targetLinkInfo.href, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
        }

        await wait(3500);

        const newPages = pageContext.pages();
        if (newPages.length > initialPagesCount) {
          activePage = newPages[newPages.length - 1];
          console.log('[fb-target] Switched to new browser tab for target website!');
        }

        try {
          const currentUrl = await activePage.url().catch(() => '');
          if (currentUrl.includes('l.facebook.com') || currentUrl.includes('facebook.com')) {
            const proceedBtn = activePage.locator('button:has-text("Tiếp tục"), button:has-text("Continue"), a:has-text("Mở liên kết"), div[role="button"]:has-text("Tiếp tục"), a[href*="khaihoanderma.com"]').first();
            if (await isVisibleSafe(proceedBtn)) {
              await proceedBtn.click().catch(() => {});
              await wait(3000);
            }
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
