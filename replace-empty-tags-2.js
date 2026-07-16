const fs = require('fs');
const path = require('path');

function processFile(file, replacements) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    const requiredIcons = new Set();

    replacements.forEach(({ search, replace, icon }) => {
        if (content.includes(search)) {
            content = content.split(search).join(replace);
            if (icon) requiredIcons.add(icon);
            modified = true;
        }
    });

    if (modified && requiredIcons.size > 0) {
        const importRegex = /import\s+{([^}]+)}\s+from\s+["']lucide-react["']/;
        const match = content.match(importRegex);
        if (match) {
            const existingIcons = match[1].split(',').map(i => i.trim());
            const newIcons = Array.from(requiredIcons).filter(i => !existingIcons.includes(i));
            if (newIcons.length > 0) {
                const updatedImport = `import { ${existingIcons.concat(newIcons).join(', ')} } from "lucide-react"`;
                content = content.replace(match[0], updatedImport);
            }
        } else {
            const importStatement = `import { ${Array.from(requiredIcons).join(', ')} } from "lucide-react";\n`;
            const lastImportIdx = content.lastIndexOf('import ');
            if (lastImportIdx !== -1) {
                const endOfLastImport = content.indexOf('\n', lastImportIdx);
                content = content.slice(0, endOfLastImport + 1) + importStatement + content.slice(endOfLastImport + 1);
            } else {
                content = importStatement + content;
            }
        }
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    }
}

const plan = [
    {
        file: 'src/app/dashboard/attendance/overtime/page.tsx',
        replacements: [
            { search: '<span></span><span>Ajukan Lemburan</span>', replace: '<span><Plus className="w-4 h-4 inline mr-1" /></span><span>Ajukan Lemburan</span>', icon: 'Plus' },
            { search: '<div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-sm flex-shrink-0 shadow-sm"></div>', replace: '<div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-sm flex-shrink-0 shadow-sm"><Clock className="w-4 h-4 text-gray-500" /></div>', icon: 'Clock' },
            { search: '<span className="text-sm"></span>', replace: '<span className="text-sm"><CalendarDays className="w-4 h-4 text-violet-600" /></span>', icon: 'CalendarDays' }
        ]
    },
    {
        file: 'src/app/dashboard/attendance/page.tsx',
        replacements: [
            { search: '<span>Admin bisa tambah/kurangi cuti meski saldo habis. Klik <strong></strong> untuk tambah, <strong></strong> untuk kurangi/hapus.</span>', replace: '<span>Admin bisa tambah/kurangi cuti meski saldo habis. Klik <strong>(+)</strong> untuk tambah, <strong>(-)</strong> untuk kurangi/hapus.</span>' }
        ]
    }
];

plan.forEach(item => processFile(item.file, item.replacements));
