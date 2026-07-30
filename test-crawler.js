import { scrapeAagag } from './crawler.js';

async function test() {
  try {
    console.log('Testing AAGAG crawler...');
    const results = await scrapeAagag();
    console.log('Test Results:');
    console.log(JSON.stringify(results.slice(0, 5), null, 2));
    console.log(`Total items retrieved: ${results.length}`);
    if (results.length > 0) {
      console.log('SUCCESS: Crawler is working properly!');
    } else {
      console.error('FAILURE: No items found.');
    }
  } catch (error) {
    console.error('Test Failed with Error:', error);
  }
}

test();
