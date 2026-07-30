import fs from 'fs';
import path from 'path';
import { Feed } from 'feed';
import { scrapeAagag } from './crawler.js';

async function build() {
  console.log('Starting RSS build process...');
  
  try {
    const articles = await scrapeAagag();
    
    const feed = new Feed({
      title: 'AAGAG 미러 RSS 피드',
      description: 'AAGAG 미러 사이트의 검색어 "%E3%85%8E%E3%85%82" 결과 RSS 피드입니다.',
      id: 'https://aagag.com/mirror/?word=%E3%85%8E%E3%85%82',
      link: 'https://aagag.com/mirror/?word=%E3%85%8E%E3%85%82',
      language: 'ko',
      generator: 'AAGAG RSS Generator',
      updated: new Date(),
      feedLinks: {
        rss: 'https://SuperLeeK.github.io/rss/aagag/hb.xml'
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
        date: new Date() // 정확한 작성일을 알 수 없으므로 빌드된 시점으로 기본 설정
      });
    });

    const xmlContent = feed.rss2();
    
    // 파일 저장 경로 설정: aagag/hb.xml
    const outputDir = path.join(process.cwd(), 'aagag');
    const outputPath = path.join(outputDir, 'hb.xml');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, xmlContent, 'utf-8');
    console.log(`Successfully generated RSS feed at: ${outputPath}`);
  } catch (error) {
    console.error('Error building RSS feed:', error);
    process.exit(1);
  }
}

build();
