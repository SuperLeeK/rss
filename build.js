import fs from 'fs';
import path from 'path';
import { Feed } from 'feed';
import { scrapeAagag } from './crawler.js';

async function build() {
  console.log('Starting RSS build process for all keywords...');
  
  // keywords.json 경로 설정
  const keywordsPath = path.join(process.cwd(), 'keywords.json');
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
      
      const encodedKeyword = encodeURIComponent(keyword);
      const feed = new Feed({
        title: `AAGAG RSS Feed (${keyword})`,
        description: `AAGAG 사이트의 검색어 "${keyword}" 결과 RSS 피드입니다.`,
        id: `https://aagag.com/mirror/?word=${encodedKeyword}`,
        link: `https://aagag.com/mirror/?word=${encodedKeyword}`,
        language: 'ko',
        generator: 'AAGAG RSS Generator',
        updated: new Date(),
        feedLinks: {
          rss: `https://SuperLeeK.github.io/rss/aagag/${encodedKeyword}.xml`
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
      
      // 파일 저장 경로: aagag/[키워드].xml
      const outputPath = path.join(outputDir, `${keyword}.xml`);
      fs.writeFileSync(outputPath, xmlContent, 'utf-8');
      console.log(`Successfully generated RSS feed at: ${outputPath}`);
    } catch (error) {
      console.error(`Error building RSS feed for keyword "${keyword}":`, error);
      // 특정 키워드 수집 실패 시 프로세스를 죽이지 않고 다음 키워드로 넘어감
    }
  }
  
  console.log('\nRSS build process completed.');
}

build();
