const DEFAULTS = {
  fbSearchQuery: 'DÆ°á»£c má»¹ pháº©m-Kháº£i HoÃ n Derma',
  targetDomain: 'khaihoanderma.com',
  targetBaseUrl: 'https://khaihoanderma.com/',
  fbWarmupMinSeconds: 60,  // 1 minute
  fbWarmupMaxSeconds: 120, // 2 minutes
  targetWebMinSeconds: 120, // 2 minutes
  targetWebMaxSeconds: 240, // 4 minutes
  exportPath: 'C:\\Users\\Admin\\Desktop\\key_derma\\facebook-traffic-derma-output.json',
};

const WEBSITE_SEARCH_KEYWORDS = [
  'má»¥n viÃªm',
  'phá»¥c há»“i da',
  'tretinoin',
  'serum',
  'kem chá»‘ng náº¯ng',
  'káº½m',
  'niacinamide',
  'sá»¯a rá»­a máº·t',
  'táº©y trang',
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
        if (!text.includes('Táº¡o tin') && !text.includes('Create story') && !text.includes('Táº¡o Story')) {
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
      reportStep('fb_warmup_story', 'Äang má»Ÿ xem Story trÃªn Facebook...');
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
      reportStep('fb_warmup_video', 'Äang táº¡m dá»«ng xem Video/Reel trÃªn Feed...');
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
  reportStep('fb_warmup_start', 'Má»Ÿ Facebook vÃ  lÆ°á»›t tin ngáº«u nhiÃªn...');

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    console.log('[fb-warmup] Navigation error, continuing:', err.message || String(err));
  }
  await wait(3000 + randomInt(0, 2000));

  const targetDurationMs = randomInt(config.fbWarmupMinSeconds, config.fbWarmupMaxSeconds) * 1000;
  const warmupDeadline = Date.now() + Math.min(targetDurationMs, remainingMs(deadline));
  const startedAt = Date.now();

  // 1. Thao tÃ¡c 1: Báº¯t buá»™c thá»­ xem Story á»Ÿ Ä‘áº§u trang
  await watchFacebookStory(page, warmupDeadline);

  let actionCount = 0;
  let videoWatched = false;

  while (remainingMs(warmupDeadline) > 0) {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const totalSec = Math.floor(targetDurationMs / 1000);
    reportStep('fb_warmup_reading', { elapsed: elapsedSec, total: totalSec });

    // 2. Thao tÃ¡c 2: Cuá»™n mÆ°á»£t qua cÃ¡c bÃ i Ä‘Äƒng trÃªn Feed dÃ¹ng window.scrollBy
    if (Math.random() < 0.60) await moveMouseNaturally();

    const scrollDistance = randomInt(450, 850);
    await page.evaluate((dist) => {
      window.scrollBy({ top: dist, behavior: 'smooth' });
    }, scrollDistance).catch(() => {});

    await safeMouseWheel(0, randomInt(200, 400));
    actionCount++;
    await waitWithinBudget(randomInt(3000, 5500), warmupDeadline);

    // 3. Thao tÃ¡c 3: Táº¡m dá»«ng xem Video / Reel khi gáº·p trÃªn feed
    if (!videoWatched && Math.random() < 0.40 && remainingMs(warmupDeadline) > 15000) {
      videoWatched = await watchFacebookVideo(page, warmupDeadline);
      if (videoWatched) actionCount++;
    }

    // 4. Thao tÃ¡c 4: Xem & cuá»™n qua pháº§n bÃ¬nh luáº­n náº¿u cÃ³
    if (Math.random() < 0.20 && remainingMs(warmupDeadline) > 12000) {
      try {
        const commentBtn = page.locator('div[role="button"]:has-text("BÃ¬nh luáº­n"), div[role="button"]:has-text("Comment"), span:has-text("bÃ¬nh luáº­n")').first();
        if (await isVisibleSafe(commentBtn)) {
          console.log('[fb-warmup] Expanding comments on post...');
          reportStep('fb_warmup_comment', 'Báº¥m má»Ÿ Ä‘á»c bÃ¬nh luáº­n trÃªn bÃ i Ä‘Äƒng...');
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

  reportStep('fb_warmup_done', 'ÄÃ£ hoÃ n thÃ nh lÆ°á»›t Facebook Feed 1-2 phÃºt!');
  return { elapsedMs: Date.now() - startedAt, actionCount };
}

// ----------------------------------------------------
// Step 2: Search for Facebook Page
// ----------------------------------------------------
async function searchFacebookPage(query, deadline) {
  console.log(`[fb-search] Searching for Fanpage: "${query}"...`);
  reportStep('fb_search_start', `TÃ¬m kiáº¿m Facebook Page: "${query}"...`);

  try {
    const searchInput = page.locator('input[aria-label*="Search Facebook"], input[aria-label*="TÃ¬m kiáº¿m trÃªn Facebook"], input[placeholder*="Search"], input[type="search"], label[aria-label*="Search"] input, input[aria-label*="TÃ¬m kiáº¿m"]').first();
    
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
  reportStep('fb_search_results', 'Äang quÃ©t káº¿t quáº£ tÃ¬m kiáº¿m Page...');

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
          (text.includes('Kháº£i HoÃ n Derma') || text.includes('DÆ°á»£c má»¹ pháº©m-Kháº£i HoÃ n')) &&
          href.includes('facebook.com')
        ) {
          results.push({
            href,
            text,
            parentText,
            matchedInfo: parentText.includes('Spa') || parentText.includes('Váº¡n Thuá»· TÃº') || parentText.includes('Phan Thiáº¿t') || parentText.includes('BÃ¬nh Thuáº­n')
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
    console.log('[fb-search] Fallback: Navigating directly to Kháº£i HoÃ n Derma Fanpage URL...');
    await page.goto('https://www.facebook.com/khaihoanderma', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
  }

  await wait(4000 + randomInt(0, 2000));
  reportStep('fb_page_opened', 'ÄÃ£ truy cáº­p vÃ o Fanpage Kháº£i HoÃ n Derma!');
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
          text === 'Xem thÃªm' ||
          text === 'See more' ||
          text.includes('Xem thÃªm') ||
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
      console.log(`[fb-target] Clicked ${clickedCount} "Xem thÃªm" button(s) to expand post text!`);
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
  reportStep('fb_target_start', 'Báº¯t Ä‘áº§u lÆ°á»›t 10 bÃ i Ä‘Äƒng Fanpage & tÃ¬m link Website...');

  let targetWebOpened = false;
  let activePage = page;
  let clickedLinkInfo = null;

  const maxPostsToInspect = 12;
  const targetPostIndex = randomInt(4, 9);

  console.log(`[fb-target] Will scroll to post ${targetPostIndex} before looking for target links...`);

  for (let postIdx = 1; postIdx <= maxPostsToInspect; postIdx++) {
    if (targetWebOpened || remainingMs(globalDeadline) <= 60000) break;

    console.log(`[fb-target] Inspecting Fanpage post ${postIdx}/${maxPostsToInspect}...`);
    reportStep('fb_post_reading', { postNum: postIdx, maxPosts: maxPostsToInspect });

    if (Math.random() < 0.65) await moveMouseNaturally();
    await safeMouseWheel(0, randomInt(380, 750));
    await wait(randomInt(3000, 5000)); // Pause to read the post
    
    let clickResult = { success: false };
    
    if (postIdx >= targetPostIndex) {
      // Only expand see more and click if we reached the target post
      await expandSeeMoreButtons(activePage);
      clickResult = await findAndClickPostWebsiteLink(activePage, config.targetDomain);
    }

    if (clickResult.success) {
      clickedLinkInfo = clickResult;
      console.log(`[fb-target] Clicked post website link: ${clickResult.href}`);
      reportStep('fb_link_found', `ÄÃ£ báº¥m má»Ÿ link trÃªn bÃ i Ä‘Äƒng Fanpage sang ${config.targetDomain}`);

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

      // Outbound redirect modal handler ("Báº¡n Ä‘ang rá»i khá»i Facebook")
      try {
        const currentUrl = await activePage.url().catch(() => '');
        if (currentUrl.includes('l.facebook.com') || currentUrl.includes('facebook.com')) {
          const proceedBtn = activePage.locator('button:has-text("Tiáº¿p tá»¥c"), button:has-text("Continue"), a:has-text("Má»Ÿ liÃªn káº¿t"), div[role="button"]:has-text("Tiáº¿p tá»¥c"), a[href*="khaihoanderma.com"]').first();
          if (await isVisibleSafe(proceedBtn)) {
            console.log('[fb-target] Outbound redirect modal detected! Clicking Continue/Tiáº¿p tá»¥c...');
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
  reportStep('web_audit_start', `Äang lÆ°á»›t Ä‘á»c bÃ i, xem sáº£n pháº©m & giá» hÃ ng (${targetWebSeconds}s)...`);

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

    // Action A: LÆ°á»›t Ä‘á»c bÃ i & xem áº£nh sáº£n pháº©m (40%)
    if (actionRoll < 0.40) {
      const deltaY = (Math.random() < 0.80 ? 1 : -1) * randomInt(280, 680);
      try {
        await activePage.mouse.wheel(0, deltaY);
      } catch (e) {}
      await waitWithinBudget(randomInt(3000, 7000), webDeadline);
    }
    // Action B: Má»Ÿ Tab MÃ´ táº£ / ThÃ nh pháº§n / ÄÃ¡nh giÃ¡ sáº£n pháº©m (20%)
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
    // Action C: TÃ¬m kiáº¿m sáº£n pháº©m trÃªn thanh tÃ¬m kiáº¿m cá»§a Website (15%)
    else if (!searchPerformed && actionRoll < 0.75 && remainingMs(webDeadline) > 25000) {
      try {
        const searchInput = activePage.locator('input[name="s"], input[type="search"], .search-field, input[placeholder*="TÃ¬m"], input[placeholder*="Search"]').first();
        if (await isVisibleSafe(searchInput)) {
          const keyword = WEBSITE_SEARCH_KEYWORDS[Math.floor(Math.random() * WEBSITE_SEARCH_KEYWORDS.length)];
          console.log(`[web-audit] Internal site search for keyword: "${keyword}"...`);
          reportStep('web_search', `TÃ¬m kiáº¿m ná»™i bá»™ website: "${keyword}"...`);

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
    // Action D: Bá» sáº£n pháº©m vÃ o giá» hÃ ng (15%)
    else if (!addedToCart && actionRoll < 0.90) {
      try {
        const cartBtn = activePage.locator('button.single_add_to_cart_button, a.add_to_cart_button, .ajax_add_to_cart, button:has-text("ThÃªm vÃ o giá»"), a:has-text("ThÃªm vÃ o giá»")').first();
        if (await isVisibleSafe(cartBtn)) {
          console.log('[web-audit] Simulating Add to Cart click!');
          reportStep('web_add_to_cart', 'Bá» sáº£n pháº©m vÃ o giá» hÃ ng thÃ nh cÃ´ng!');
          await cartBtn.click().catch(() => {});
          addedToCart = true;
          await waitWithinBudget(4000, webDeadline);
        }
      } catch (e) {}
    }
    // Action E: Xem cÃ¡c sáº£n pháº©m/bÃ i viáº¿t tÆ°Æ¡ng tá»± (10%)
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

  reportStep('web_audit_done', `HoÃ n táº¥t ${targetWebSeconds}s lÆ°á»›t Ä‘á»c bÃ i & tÆ°Æ¡ng tÃ¡c Website!`);
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
