const DEFAULTS = {
  fbSearchQuery: 'Dược mỹ phẩm-Khải Hoàn Derma',
  targetDomain: 'khaihoanderma.com',
  targetBaseUrl: 'https://khaihoanderma.com/',
  fbWarmupMinSeconds: 60,  // 1 minute
  fbWarmupMaxSeconds: 120, // 2 minutes
  targetWebMinSeconds: 30,
  targetWebMaxSeconds: 60,
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

async function getVisiblePost(activePage, seenPostKeys) {
  try {
    const articles = await activePage
      .locator('div[role="feed"] div[role="article"], div[role="main"] div[role="article"]')
      .all();
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const article of articles) {
      if (!(await article.isVisible().catch(() => false))) continue;
      const box = await article.boundingBox().catch(() => null);
      if (!box || box.width < 250 || box.height < 120) continue;

      const text = (await article.innerText().catch(() => '')).trim();
      const permalink = article
        .locator(
          'a[href*="/posts/"], a[href*="/permalink/"], a[href*="/videos/"], ' +
          'a[href*="/reel/"], a[href*="story_fbid="]',
        )
        .first();
      const permalinkHref = (await permalink.getAttribute('href').catch(() => '')) || '';
      const key = permalinkHref || text.replace(/\s+/g, ' ').slice(0, 220);
      if (!key || seenPostKeys.has(key)) continue;

      const centerY = box.y + box.height / 2;
      const distance = Math.abs(centerY - 360);
      if (distance < bestDistance) {
        best = { article, key };
        bestDistance = distance;
      }
    }

    return best;
  } catch (err) {
    console.log('[fb-target] getVisiblePost error:', err.message || String(err));
    return null;
  }
}

async function expandSeeMoreInPost(post) {
  try {
    const controls = await post
      .locator('div[role="button"], span[role="button"], a[role="button"]')
      .all();

    for (const control of controls) {
      if (!(await control.isVisible().catch(() => false))) continue;
      const text = (await control.innerText().catch(() => '')).trim();
      if (text === 'Xem thêm' || text === 'See more') {
        await control.scrollIntoViewIfNeeded().catch(() => {});
        await wait(400);
        await control.click().catch(() => {});
        await wait(1200);
        console.log('[fb-target] Expanded "Xem thêm" inside the selected post.');
        return true;
      }
    }
  } catch (err) {
    console.log('[fb-target] expandSeeMoreInPost error:', err.message || String(err));
  }
  return false;
}

function normalizeTargetUrl(value, targetDomain) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const domain = targetDomain.toLowerCase();
    const allowedProtocol = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    const allowedHostname = hostname === domain || hostname.endsWith(`.${domain}`);
    if (allowedProtocol && allowedHostname) return parsed.href;
  } catch {}
  return '';
}

function resolveFacebookOutboundUrl(href, targetDomain) {
  try {
    const parsed = new URL(href, 'https://www.facebook.com/');
    if (
      parsed.hostname === 'l.facebook.com' ||
      (parsed.hostname.endsWith('.facebook.com') && parsed.pathname === '/l.php')
    ) {
      return normalizeTargetUrl(parsed.searchParams.get('u') || '', targetDomain);
    }
    return normalizeTargetUrl(parsed.href, targetDomain);
  } catch {}
  return '';
}

async function findPostWebsiteLink(post, targetDomain) {
  try {
    const anchors = await post.locator('a[href]').all();
    for (const anchor of anchors) {
      if (!(await anchor.isVisible().catch(() => false))) continue;
      const href = await anchor.getAttribute('href').catch(() => '');
      const text = (await anchor.innerText().catch(() => '')).trim();
      const destinationUrl = resolveFacebookOutboundUrl(href || '', targetDomain);
      if (!destinationUrl && !text.toLowerCase().includes('derma')) continue;

      const resolvedUrl = destinationUrl || resolveFacebookOutboundUrl(text, targetDomain);
      if (!resolvedUrl) continue;

      await anchor.scrollIntoViewIfNeeded().catch(() => {});
      return {
        success: true,
        anchor,
        href: href || resolvedUrl,
        destinationUrl: resolvedUrl,
        text: text || resolvedUrl,
      };
    }
  } catch (err) {
    console.log('[fb-target] findPostWebsiteLink error:', err.message || String(err));
  }
  return { success: false };
}

async function clickLinkInCurrentTab(anchor, destinationUrl, targetDomain) {
  const originalUrl = await page.url().catch(() => '');
  const beforePages = await page.browser.pages().catch(() => ({ pages: [] }));
  const beforeIds = new Set(beforePages.pages.map((item) => item.targetId));
  const originalPage = beforePages.pages.find((item) => item.url === originalUrl);

  await anchor.evaluate((element, safeUrl) => {
    element.setAttribute('href', safeUrl);
    element.setAttribute('target', '_self');
  }, destinationUrl);
  await anchor.click();
  await wait(1200);

  const afterPages = await page.browser.pages().catch(() => ({ pages: [] }));
  const createdPages = afterPages.pages.filter((item) => !beforeIds.has(item.targetId));
  if (createdPages.length > 0) {
    console.log(`[fb-target] Facebook created ${createdPages.length} extra tab(s); closing only those new tabs.`);
    for (const createdPage of createdPages) {
      await page.browser.closePage(createdPage.targetId).catch(() => {});
    }
    if (originalPage) {
      await page.browser.bringToFront(originalPage.targetId).catch(() => {});
    }
    await page.goto(destinationUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 35000,
    }).catch(() => {});
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 35000) {
    const currentUrl = await page.url().catch(() => '');
    if (normalizeTargetUrl(currentUrl, targetDomain)) return currentUrl;
    await wait(500);
  }

  return '';
}

// ----------------------------------------------------
// Step 3 & 4: Fanpage Posts Scroll & Target Website Interactions
// ----------------------------------------------------
async function auditFanpageAndWebsite(config, globalDeadline) {
  console.log('[fb-target] Starting Fanpage 12-post referral QA phase...');
  reportStep('fb_target_start', 'Bắt đầu kiểm tra 12 bài đăng gần nhất trên Fanpage...');

  let targetWebOpened = false;
  let activePage = page;
  let clickedLinkInfo = null;

  // Step 3: Inspect up to 12 recent posts, then open one Derma link in the current tab.
  const maxPostsToInspect = 12;
  const targetPostIndex = randomInt(1, maxPostsToInspect);
  const seenPostKeys = new Set();
  let inspectedPostCount = 0;
  let scanAttempts = 0;

  console.log(`[fb-target] Selected post position ${targetPostIndex}/${maxPostsToInspect} as the first link candidate.`);

  while (inspectedPostCount < maxPostsToInspect && scanAttempts < maxPostsToInspect * 3) {
    if (targetWebOpened || remainingMs(globalDeadline) <= 60000) break;
    scanAttempts++;

    const visiblePost = await getVisiblePost(activePage, seenPostKeys);
    if (!visiblePost) {
      await safeMouseWheel(0, randomInt(380, 750));
      await wait(randomInt(1800, 3200));
      continue;
    }

    seenPostKeys.add(visiblePost.key);
    inspectedPostCount++;
    console.log(`[fb-target] Inspecting Fanpage post ${inspectedPostCount}/${maxPostsToInspect}...`);
    reportStep('fb_post_reading', {
      postNum: inspectedPostCount,
      maxPosts: maxPostsToInspect,
    });

    if (inspectedPostCount === targetPostIndex) {
      await expandSeeMoreInPost(visiblePost.article);
      const linkResult = await findPostWebsiteLink(visiblePost.article, config.targetDomain);
      if (linkResult.success) {
        clickedLinkInfo = {
          href: linkResult.href,
          destinationUrl: linkResult.destinationUrl,
          text: linkResult.text,
        };
        console.log(`[fb-target] Clicking selected post link in the current tab: ${linkResult.destinationUrl}`);
        reportStep('fb_link_found', `Đã tìm thấy link ${config.targetDomain} trong bài đăng được chọn`);
        const openedUrl = await clickLinkInCurrentTab(
          linkResult.anchor,
          linkResult.destinationUrl,
          config.targetDomain,
        ).catch(() => '');
        targetWebOpened = Boolean(openedUrl);
        break;
      }

      console.log('[fb-target] The randomly selected post does not contain a Derma link.');
      break;
    }

    if (Math.random() < 0.65) await moveMouseNaturally();
    await safeMouseWheel(0, randomInt(380, 750));
    await wait(randomInt(2500, 4500));
  }

  if (!targetWebOpened) {
    console.log('[fb-target] No Derma link found in the randomly selected recent post; website QA was not started.');
    reportStep('fb_link_not_found', `Bài được chọn trong tối đa 12 bài gần nhất không có link ${config.targetDomain}`);
    return {
      targetWebOpened: false,
      addedToCart: false,
      visitedPagesCount: 0,
      clickedLinkInfo: null,
    };
  }

  // Step 4: bounded functional QA on the Derma destination only.
  const qaMinSeconds = Math.max(20, Math.min(config.targetWebMinSeconds, 45));
  const qaMaxSeconds = Math.max(qaMinSeconds, Math.min(config.targetWebMaxSeconds, 60));
  const targetWebSeconds = randomInt(qaMinSeconds, qaMaxSeconds);
  const webDeadline = Math.min(Date.now() + targetWebSeconds * 1000, globalDeadline);
  const webStartedAt = Date.now();
  const currentWebUrl = await activePage.url().catch(() => '');
  const verifiedWebUrl = normalizeTargetUrl(currentWebUrl, config.targetDomain);

  if (!verifiedWebUrl) {
    throw new Error(`Website QA refused a non-target URL: ${currentWebUrl}`);
  }

  await activePage.waitForLoadState('domcontentloaded').catch(() => {});
  const pageTitle = (await activePage.title().catch(() => '')).trim();
  const bodyText = (await activePage.locator('body').innerText().catch(() => '')).trim();
  if (!pageTitle || bodyText.length < 80) {
    throw new Error(`Website QA failed content verification: title=${Boolean(pageTitle)}, bodyLength=${bodyText.length}`);
  }

  console.log(`[web-audit] Verified target page and starting ${targetWebSeconds}s bounded QA: ${verifiedWebUrl}`);
  reportStep('web_audit_start', `Đã xác minh trang Derma, bắt đầu kiểm tra cuộn và nội dung (${targetWebSeconds}s)`);

  let detailTabChecked = false;
  while (remainingMs(webDeadline) > 0) {
    const currentUrl = await activePage.url().catch(() => '');
    if (!normalizeTargetUrl(currentUrl, config.targetDomain)) {
      throw new Error(`Website QA left the allowed domain: ${currentUrl}`);
    }

    const elapsedSec = Math.floor((Date.now() - webStartedAt) / 1000);
    reportStep('web_audit_reading', {
      elapsed: elapsedSec,
      total: targetWebSeconds,
      url: currentUrl,
    });

    const deltaY = (Math.random() < 0.75 ? 1 : -1) * randomInt(260, 620);
    await activePage.mouse.wheel(0, deltaY).catch(() => {});

    if (!detailTabChecked && elapsedSec >= Math.floor(targetWebSeconds / 2)) {
      const detailTab = activePage
        .locator(
          '#tab-title-description a, li.description_tab a, ' +
          '#tab-title-reviews a, li.reviews_tab a',
        )
        .first();
      if (await isVisibleSafe(detailTab)) {
        await detailTab.click().catch(() => {});
      }
      detailTabChecked = true;
    }

    await waitWithinBudget(randomInt(2500, 4500), webDeadline);
  }

  reportStep('web_audit_done', `Hoàn tất ${targetWebSeconds}s kiểm tra nội dung trong domain Derma`);
  return {
    targetWebOpened,
    addedToCart: false,
    visitedPagesCount: 1,
    clickedLinkInfo,
    verifiedUrl: verifiedWebUrl,
    pageTitle,
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

  console.log('[fb-flow] Starting Facebook referral QA flow with config:', JSON.stringify(config));

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
