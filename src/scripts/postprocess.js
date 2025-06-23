import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, '../../content/uk/the-core');

function processFile(filePath) {
    try {
        // Read the file content
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Find the main title (text followed by =======)
        const titleMatch = content.match(/^(.+)\n=======/m);
        if (!titleMatch) {
            console.log(`Warning: Could not find title pattern in ${filePath}`);
            return;
        }
        
        // Get the content after the title
        const afterTitle = content.slice(content.indexOf('=======') + 7).trim();

        // Get content and title
        const contentAndTitle = titleMatch[0] + afterTitle;
        
        // Find the footer markers
        const footerMarkers = [
            'Related articles',
            'About the Author',
            'Our Authors'
        ];
        
        let footerStart = Infinity;
        for (const marker of footerMarkers) {
            const index = contentAndTitle.indexOf(marker);
            if (index !== -1 && index < footerStart) {
                footerStart = index;
            }
        }
        
        // If no footer markers found, use the entire content
        const processedContent = footerStart === Infinity 
            ? contentAndTitle 
            : contentAndTitle.slice(0, footerStart).trim();
        
        // Write the processed content back to the file
        fs.writeFileSync(filePath, processedContent, 'utf8');
        console.log(`Processed ${filePath}`);
        
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
    }
}

// Process all .txt files in the directory
const files = fs.readdirSync(CONTENT_DIR)
    .filter(file => file.endsWith('.txt'))
    .map(file => path.join(CONTENT_DIR, file));

files.forEach(processFile);
