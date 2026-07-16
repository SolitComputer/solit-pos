const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('./src');
const emptySpanRegex = /<([a-zA-Z]+)(?:\s+[^>]*?)?>[\s]*<\/\1>/g;

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        if (line.match(emptySpanRegex) && !line.includes('<br/>') && !line.includes('<br />')) {
            console.log(`${file}:${index + 1} -> ${line.trim()}`);
        }
    });
});
