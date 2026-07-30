import fs from 'fs';
import path from 'path';
import { Feed } from 'feed';
import { scrapeAagag } from './crawler.js';

/**
 * 파일 시스템 안전 문자열로 변환 (예: '/' 등을 '_'로 치환)
 */
function sanitizeFilename(name) {
  return name.replace(/[\/\\:\*\?"<>\|]/g, '_');
}

/**
 * 기존 RSS XML 파일에서 기사(<item>)들의 <link> 정보 추출
 */
function extractItemLinksFromXml(xmlContent) {
  const links = [];
  // <item> ... <link>(.*?)</link> ... </item> 추출
  const itemRegex = /<item>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xmlContent)) !== null) {
    links.push(match[1]);
  }
  return links;
}

async function build() {
  console.log('Starting RSS build process for all keywords...');
  
  // keywords.json 경로 설정 (aagag/keywords.json)
  const keywordsPath = path.join(process.cwd(), 'aagag', 'keywords.json');
  let keywords = ['ㅎㅂ']; // 기본값
  
  try {
    if (fs.existsSync(keywordsPath)) {
      const fileContent = fs.readFileSync(keywordsPath, 'utf-8');
      keywords = JSON.parse(fileContent);
      if (!Array.isArray(keywords) || keywords.length === 0) {
        keywords = ['ㅎㅂ'];
      }
    }
  } catch (error) {
    console.warn('Failed to read keywords.json, using default ["ㅎㅂ"]', error);
  }
  
  console.log(`Keywords to scrape: ${JSON.stringify(keywords)}`);
  
  const outputDir = path.join(process.cwd(), 'aagag');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 수집 및 빌드 루프 실행
  for (const keyword of keywords) {
    console.log(`\n--------------------------------------------`);
    console.log(`Processing keyword: "${keyword}"`);
    
    try {
      const articles = await scrapeAagag(keyword);
      
      const safeKeyword = sanitizeFilename(keyword);
      const encodedSafeKeyword = encodeURIComponent(safeKeyword);
      const encodedKeyword = encodeURIComponent(keyword);
      const outputPath = path.join(outputDir, `${safeKeyword}.xml`);
      
      // 중복 검사: 기존에 수집된 기사 리스트와 새로 크롤링한 리스트가 100% 동일한지 체크
      let hasChanges = true;
      if (fs.existsSync(outputPath)) {
        try {
          const existingXml = fs.readFileSync(outputPath, 'utf-8');
          const existingLinks = extractItemLinksFromXml(existingXml);
          const newLinks = articles.map(a => a.link);
          
          if (existingLinks.length === newLinks.length && 
              existingLinks.every((link, idx) => link === newLinks[idx])) {
            hasChanges = false;
          }
        } catch (readErr) {
          console.warn(`Failed to read/parse existing XML for "${keyword}". Will generate new file.`, readErr);
        }
      }
      
      if (!hasChanges) {
        console.log(`No new articles scraped for "${keyword}". Skipping XML file write to prevent git conflicts.`);
        continue; // 파일 쓰기를 생략하고 다음 키워드로 건너뜀
      }
      
      const feed = new Feed({
        title: `AAGAG 미러 RSS 피드 - ${keyword}`,
        description: `AAGAG 미러 사이트의 검색어 "${keyword}" 결과 RSS 피드입니다.`,
        id: `https://aagag.com/mirror/?word=${encodedKeyword}`,
        link: `https://aagag.com/mirror/?word=${encodedKeyword}`,
        language: 'ko',
        generator: 'AAGAG RSS Generator',
        updated: new Date(),
        feedLinks: {
          rss: `https://SuperLeeK.github.io/rss/aagag/${encodedSafeKeyword}.xml`
        },
        author: {
          name: 'AAGAG RSS Bot'
        }
      });

      articles.forEach(article => {
        feed.addItem({
          title: article.title,
          id: article.id,
          link: article.link,
          date: new Date()
        });
      });

      const xmlContent = feed.rss2();
      
      // 파일 저장 경로: aagag/[안전한키워드].xml
      fs.writeFileSync(outputPath, xmlContent, 'utf-8');
      console.log(`Successfully generated RSS feed at: ${outputPath}`);
    } catch (error) {
      console.error(`Error building RSS feed for keyword "${keyword}":`, error);
    }
  }
  
  console.log('\nRSS build process completed.');
}

build();
