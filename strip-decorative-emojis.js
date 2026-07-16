const fs = require('fs');
const path = require('path');

const EXEMPT_DIRS = ['api', 'lib', 'scripts', 'service'];

function isExempt(filePath) {
    for (const dir of EXEMPT_DIRS) {
        if (filePath.includes(`src${path.sep}app${path.sep}api`) || 
            filePath.includes(`src${path.sep}lib`) || 
            filePath.includes(`src${path.sep}scripts`) || 
            filePath.includes(`src${path.sep}service`)) {
            return true;
        }
    }
    return false;
}

const EMOJI_REGEX = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F251}\u{2B50}\u{23F3}\u{23F0}\u{231A}\u{25B6}\u{FE0F}]/gu;

function stripEmojisFromFile(filePath) {
    if (isExempt(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Check if the file has any emojis
    if (!EMOJI_REGEX.test(content)) return;

    // Optional: add some safe replacements for semantic emojis if they are strings
    // But since this is just stripping, we just replace all emojis with empty string
    
    // We replace emojis, but we want to be careful not to break JSX like `<span>✅</span>` which would become `<span></span>`. That's fine, it just won't render anything.
    
    const newContent = content.replace(EMOJI_REGEX, '');
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf-8');
        console.log(`Stripped emojis from ${filePath}`);
    }
}

function walk(dir) {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.resolve(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            stripEmojisFromFile(fullPath);
        }
    });
}

walk(path.join(__dirname, 'src'));
console.log('Done stripping decorative emojis.');
