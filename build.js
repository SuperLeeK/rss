import fs from 'fs';
import path from 'path';
import { Feed } from 'feed';
import { scrapeSite } from './crawler.js';

function sanitizeFilename(name) {
  return name.replace(/[\/\\:\*\?"<>\|]/g, '_');
}

function extractLastBuildDateFromXml(xmlContent) {
  const match = xmlContent.match(/<lastBuildDate>(.*?)<\/lastBuildDate>/);
  if (match && match[1]) {
    const d = new Date(match[1]);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function extractItemLinksFromXml(xmlContent) {
  const links = [];
  const itemRegex = /<item>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xmlContent)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function parseKeywordItem(item, defaultInterval) {
  if (typeof item === 'object' && item !== null) {
    const name = item.keyword || item.name || '';
    const intervalMinutes = typeof item.intervalMinutes === 'number' ? item.intervalMinutes : defaultInterval;
    return { name, intervalMinutes };
  }
  return { name: String(item), intervalMinutes: defaultInterval };
}

async function build() {
  const isDryRun = process.argv.includes('--dry-run');
  const isForce = process.argv.includes('--force');

  console.log('Starting RSS build process with custom configs...');
  if (isDryRun) console.log('>>> RUNNING IN DRY-RUN MODE (No files will be modified) <<<');
  if (isForce) console.log('>>> RUNNING IN FORCE MODE (Ignoring intervals and content diffs) <<<');
  
  const configPath = path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error('config.json not found! Please ensure it is created.');
    return;
  }
  
  let sites = [];
  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    sites = JSON.parse(fileContent);
  } catch (error) {
    console.error('Failed to parse config.json:', error);
    return;
  }
  
  for (const site of sites) {
    console.log(`\n============================================`);
    console.log(`Processing site: "${site.name}" (${site.id})`);
    
    const outputDir = path.join(process.cwd(), site.id);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const siteDefaultInterval = site.intervalMinutes || 120;
    const rawKeywords = site.keywords || [];
    
    console.log(`Raw Keywords for "${site.name}": ${JSON.stringify(rawKeywords)} (Site Default Interval: ${siteDefaultInterval} mins)`);
    
    for (const rawKw of rawKeywords) {
      const { name: keyword, intervalMinutes } = parseKeywordItem(rawKw, siteDefaultInterval);
      
      console.log(`\n--------------------------------------------`);
      console.log(`Keyword: "${keyword}" in site "${site.name}" (Interval: ${intervalMinutes} mins)`);
      
      const safeKeyword = sanitizeFilename(keyword);
      const encodedSafeKeyword = encodeURIComponent(safeKeyword);
      const encodedKeyword = encodeURIComponent(keyword);
      const outputPath = path.join(outputDir, `${safeKeyword}.xml`);
      
      // 스마트 주기 체크: 파일이 이미 존재하면 XML 내 lastBuildDate 비교 (GitHub Actions checkout 시 mtime 초기화 문제 해결)
      if (!isForce && fs.existsSync(outputPath)) {
        try {
          const xmlContent = fs.readFileSync(outputPath, 'utf-8');
          const lastBuildDate = extractLastBuildDateFromXml(xmlContent);
          if (lastBuildDate) {
            const diffMs = Date.now() - lastBuildDate.getTime();
            const diffMins = Math.floor(diffMs / 1000 / 60);
            
            if (diffMins < intervalMinutes) {
              console.log(`[Skip] "${keyword}" RSS was built ${diffMins} minutes ago (lastBuildDate: ${lastBuildDate.toISOString()}). Required interval: ${intervalMinutes} mins. Skipping crawl.`);
              continue;
            }
          }
        } catch (statErr) {
          console.warn(`Failed to read XML for interval check on "${keyword}". Scraping anyway.`, statErr);
        }
      }
      
      try {
        const articles = await scrapeSite(site, keyword);
        
        let hasChanges = true;
        let addedLinks = [];
        let removedLinks = [];
        
        if (fs.existsSync(outputPath)) {
          try {
            const existingXml = fs.readFileSync(outputPath, 'utf-8');
            const existingLinks = extractItemLinksFromXml(existingXml);
            const newLinks = articles.map(a => a.link);
            
            const existingSet = new Set(existingLinks);
            const newSet = new Set(newLinks);
            
            addedLinks = articles.filter(a => !existingSet.has(a.link));
            removedLinks = existingLinks.filter(l => !newSet.has(l));
            
            if (existingLinks.length === newLinks.length && 
                existingLinks.every((link, idx) => link === newLinks[idx])) {
              hasChanges = false;
            }
          } catch (readErr) {
            console.warn(`Failed to read/parse existing XML for "${keyword}". Will generate new file.`, readErr);
          }
        }
        
        if (isDryRun) {
          console.log(`\n=== [DRY-RUN] Diff Analysis for "${keyword}" ===`);
          console.log(`Content Changed: ${hasChanges}`);
          console.log(`Scraped Articles Count: ${articles.length}`);
          if (addedLinks.length > 0) {
            console.log(`[+] Added ${addedLinks.length} items:`);
            addedLinks.forEach(item => console.log(`   + [${item.title}] (${item.link})`));
          } else {
            console.log(`[+] Added 0 items.`);
          }
          if (removedLinks.length > 0) {
            console.log(`[-] Removed ${removedLinks.length} items:`);
            removedLinks.forEach(link => console.log(`   - ${link}`));
          } else {
            console.log(`[-] Removed 0 items.`);
          }
          console.log(`[DRY-RUN] Skipping actual file modifications.\n`);
          continue;
        }
        
        if (!hasChanges && !isForce) {
          console.log(`No new articles scraped for "${keyword}". Skipping XML file write to prevent git conflicts.`);
          
          // 파일 내용 변화는 없지만 최종 갱신 타임스탬프를 갱신하기 위해 touch 처리
          try {
            const now = new Date();
            fs.utimesSync(outputPath, now, now);
            console.log(`Updated XML file access/modification time to current timestamp.`);
          } catch (utimesErr) {
            console.warn(`Failed to update modification time for XML file.`, utimesErr);
          }
          continue;
        }
        
        // targetUrlTemplate 파싱해서 feed ID 생성
        const targetUrl = site.targetUrlTemplate.replace('${keyword}', encodedKeyword);
        
        const feed = new Feed({
          title: `${site.name} - ${keyword}`,
          description: `${site.name} 사이트의 검색어 "${keyword}" 결과 RSS 피드입니다.`,
          id: targetUrl,
          link: targetUrl,
          language: 'ko',
          generator: 'Community RSS Generator',
          updated: new Date(),
          feedLinks: {
            rss: `https://SuperLeeK.github.io/rss/${site.id}/${encodedSafeKeyword}.xml`
          },
          author: {
            name: 'RSS Auto-Bot'
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
        fs.writeFileSync(outputPath, xmlContent, 'utf-8');
        console.log(`Successfully generated RSS feed at: ${outputPath}`);
      } catch (error) {
        console.error(`Error building RSS feed for keyword "${keyword}" in site "${site.id}":`, error);
      }
    }
  }
  
  console.log('\nRSS build process completed.');
}

build();
