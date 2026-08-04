import { chromium } from 'playwright';

/**
 * 특정 사이트 설정에 따라 검색 결과를 크롤링하여 기사 목록을 반환합니다.
 * @param {Object} siteConfig 크롤링 설정 객체 (targetUrlTemplate, listSelector, itemSelector, titleSelector, linkSelector 등)
 * @param {string} keyword 크롤링할 검색 키워드
 * @returns {Promise<Array<{title: string, link: string, id: string}>>}
 */
export async function scrapeSite(siteConfig, keyword) {
  if (!siteConfig || !keyword) {
    throw new Error('siteConfig and keyword are required for scraping');
  }
  
  const { name, targetUrlTemplate, listSelector, itemSelector, titleSelector, linkSelector } = siteConfig;
  
  console.log(`Starting Playwright crawler for ${name || 'Site'} with keyword: "${keyword}"`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    // URL 템플릿에 키워드 주입
    const encodedKeyword = encodeURIComponent(keyword);
    const targetUrl = targetUrlTemplate.replace('${keyword}', encodedKeyword);
    console.log(`Navigating to: ${targetUrl}`);
    
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // 목록 영역 대기
    if (listSelector) {
      console.log(`Waiting for list selector: "${listSelector}" to load...`);
      await page.waitForSelector(listSelector, { timeout: 15000 });
    }
    
    // 브라우저 컨텍스트 내에서 기사 정보 추출
    const articles = await page.evaluate(({ itemSelector, titleSelector, linkSelector }) => {
      const elements = document.querySelectorAll(itemSelector);
      const results = [];
      
      elements.forEach(el => {
        // 타이틀 엘리먼트 추출 (선택자가 없으면 아이템 본인 사용)
        const titleEl = titleSelector ? el.querySelector(titleSelector) : el;
        let title = '';
        if (titleEl) {
          const clone = titleEl.cloneNode(true);
          // 하위 불필요한 메타 레이어 및 부가 정보 태그 제거 (.btmlayer 등)
          clone.querySelectorAll('.btmlayer, .byte, .hit, .good, .time, script, style').forEach(subEl => subEl.remove());
          title = clone.textContent.trim();
        }
        
        // 링크 엘리먼트 추출 (선택자가 없으면 아이템 본인의 href 사용)
        const linkEl = linkSelector ? el.querySelector(linkSelector) : el;
        const href = linkEl ? linkEl.getAttribute('href') : '';
        
        if (title && href) {
          const absoluteUrl = href.startsWith('http') 
            ? href 
            : new URL(href, window.location.href).href;
            
          results.push({
            title,
            link: absoluteUrl,
            id: absoluteUrl
          });
        }
      });
      
      return results;
    }, { itemSelector, titleSelector, linkSelector });
    
    console.log(`Successfully scraped ${articles.length} articles from ${name || 'Site'}.`);
    return articles;
  } catch (error) {
    console.error(`Error during scraping ${name || 'Site'}:`, error);
    throw error;
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}
