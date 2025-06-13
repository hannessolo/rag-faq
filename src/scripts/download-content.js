import fs from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';
import PQueue from 'p-queue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a queue with rate limiting
const queue = new PQueue({
    interval: 1000, // 1 second
    intervalCap: 20, // 20 requests per second
    timeout: 30000, // 30 second timeout for each request
    throwOnTimeout: true
});

// Function to parse sitemap XML
async function parseSitemap(url) {
    const response = await axios.get(url);
    const parser = new XMLParser();
    const result = parser.parse(response.data);
    return result.urlset.url.map(entry => entry.loc);
}

// Function to extract text content from HTML
function extractTextContent(html) {
    const dom = new JSDOM(html);
    const body = dom.window.document.body;
    
    // Remove script and style elements
    const scripts = body.getElementsByTagName('script');
    const styles = body.getElementsByTagName('style');
    [...scripts, ...styles].forEach(el => el.remove());
    
    // Get text content
    return body.textContent
        .replace(/\s+/g, ' ')
        .trim();
}

// Function to create directory if it doesn't exist
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// Function to save content to file
async function saveContent(url, content) {
    // Convert URL to file path
    const urlObj = new URL(url);
    let filePath = urlObj.pathname;
    
    // Handle root path
    if (filePath === '/') {
        filePath = '/index';
    }
    
    // Remove trailing slash
    if (filePath.endsWith('/')) {
        filePath = filePath.slice(0, -1);
    }
    
    // Create full path
    const fullPath = path.join(__dirname, '..', '..', 'content', filePath + '.txt');
    
    // Ensure directory exists
    await ensureDirectoryExists(path.dirname(fullPath));
    
    // Save content
    await fs.writeFile(fullPath, content, 'utf-8');
    console.log(`Saved: ${filePath}`);
}

// Function to process a single URL
async function processUrl(url) {
    try {
        console.log(`Downloading: ${url}`);
        const response = await axios.get(url);
        const textContent = extractTextContent(response.data);
        await saveContent(url, textContent);
    } catch (error) {
        console.error(`Error processing ${url}:`, error.message);
    }
}

// Main function
async function main() {
    const sitemapUrls = [
        'https://www.bulk.com/media/feeds/sitemapUK.xml',
        'https://www.bulk.com/sitemap-uk.xml'
    ];
    
    // Create content directory
    const contentDir = path.join(__dirname, '..', '..', 'content');
    await ensureDirectoryExists(contentDir);
    
    // Process each sitemap
    for (const sitemapUrl of sitemapUrls) {
        console.log(`Processing sitemap: ${sitemapUrl}`);
        try {
            const urls = await parseSitemap(sitemapUrl);
            console.log(`Found ${urls.length} URLs`);
            
            // Add all URLs to the queue
            const tasks = urls.map(url => () => processUrl(url));
            await queue.addAll(tasks);
            
            // Wait for all tasks to complete
            await queue.onIdle();
            console.log(`Finished processing sitemap: ${sitemapUrl}`);
        } catch (error) {
            console.error(`Error processing sitemap ${sitemapUrl}:`, error.message);
        }
    }
}

// Run the script
main().catch(console.error); 