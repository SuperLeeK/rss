import { chromium } from 'playwright';

/**
 * AAGAG 미러 사이트에서 검색 결과를 크롤링하여 기사 목록을 반환합니다.
 * @returns {Promise<Array<{title: string, link: string, id: string}>>}
 */
export async function scrapeAagag() {
  console.log('Starting Playwright crawler for AAGAG...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    const targetUrl = 'https://aagag.com/mirror/?word=%E3%85%8E%E3%85%82';
    console.log(`Navigating to: ${targetUrl}`);
    
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // 테이블 및 기사 목록 로딩 대기
    console.log('Waiting for table.aalist to load...');
    await page.waitForSelector('table.aalist', { timeout: 15000 });
    
    // 브라우저 컨텍스트 내에서 데이터 추출
    const articles = await page.evaluate(() => {
      const elements = document.querySelectorAll('table.aalist > tbody > tr > td > a.article');
      const results = [];
      
      elements.forEach(el => {
        const href = el.getAttribute('href');
        const titleSpan = el.querySelector('span.title');
        const title = titleSpan ? titleSpan.textContent.trim() : '';
        
        if (href && title) {
          // 상대 경로인 경우 현재 페이지 주소를 기준으로 절대 경로로 변환
          const absoluteUrl = href.startsWith('http') 
            ? href 
            : new URL(href, window.location.href).href;
            
          results.push({
            title,
            link: absoluteUrl,
            id: absoluteUrl // 고유 식별자로 링크 주소 사용
          });
        }
      });
      
      return results;
    });
    
    console.log(`Successfully scraped ${articles.length} articles.`);
    return articles;
  } catch (error) {
    console.error('Error during scraping AAGAG:', error);
    throw error;
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}
