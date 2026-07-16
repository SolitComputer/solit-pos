const fs = require('fs');
const path = require('path');

function processFile(file, replacements) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Collect all required components for this file
    const requiredIcons = new Set();

    replacements.forEach(({ search, replace, icon }) => {
        if (content.includes(search)) {
            // we will replace all instances of this exact string
            content = content.split(search).join(replace);
            if (icon) requiredIcons.add(icon);
            modified = true;
        }
    });

    if (modified && requiredIcons.size > 0) {
        // Add imports
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
            // No lucide-react import found, add one at the top after other imports
            const importStatement = `import { ${Array.from(requiredIcons).join(', ')} } from "lucide-react";\n`;
            // Simple heuristic: insert after last import
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
        file: 'src/app/dashboard/preparation/page.tsx',
        replacements: [
            { search: '<span className="text-2xl"></span>', replace: '<Clock className="w-6 h-6 inline text-gray-500" />', icon: 'Clock' },
            { search: '<span className="text-3xl"></span>', replace: '<AlertCircle className="w-8 h-8 inline text-gray-500" />', icon: 'AlertCircle' },
            { search: '<div className="text-5xl mb-4 opacity-40"></div>', replace: '<div className="flex justify-center mb-4 opacity-40"><Inbox className="w-12 h-12" /></div>', icon: 'Inbox' }
        ]
    },
    {
        file: 'src/app/dashboard/preparation/pengantaran/page.tsx',
        replacements: [
            { search: '<span className="text-sm flex-shrink-0"></span>', replace: '<AlertCircle className="w-4 h-4 flex-shrink-0" />', icon: 'AlertCircle' },
            { search: '<span className="text-xs"></span>', replace: '<Clock className="w-3 h-3" />', icon: 'Clock' },
            { search: '<span className="text-2xl"></span>', replace: '<Clock className="w-6 h-6" />', icon: 'Clock' },
            { search: '<div className="text-4xl mb-3 opacity-40"></div>', replace: '<div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>', icon: 'Inbox' }
        ]
    },
    {
        file: 'src/app/dashboard/preparation/sedang-diantar/page.tsx',
        replacements: [
            { search: '<div className="text-5xl sm:text-6xl mb-4 opacity-30"></div>', replace: '<div className="flex justify-center mb-4 opacity-30"><Inbox className="w-12 h-12" /></div>', icon: 'Inbox' },
            { search: '<span></span> {o.delivery_user_name', replace: '<User className="w-4 h-4 inline" /> {o.delivery_user_name', icon: 'User' },
            { search: '<span className="text-base sm:text-lg flex-shrink-0"></span>', replace: '<Clock className="w-5 h-5 flex-shrink-0" />', icon: 'Clock' }
        ]
    },
    {
        file: 'src/app/dashboard/preparation/[id]/page.tsx',
        replacements: [
            { search: '{driverId === d.id && <span className="text-violet-600 flex-shrink-0"></span>}', replace: '{driverId === d.id && <CheckCircle2 className="text-violet-600 w-5 h-5 flex-shrink-0" />}', icon: 'CheckCircle2' },
            { search: '<span></span>', replace: '<FileText className="w-4 h-4 inline" />', icon: 'FileText' },
            { search: '<span className="text-2xl"></span>', replace: '<Clock className="w-6 h-6 inline" />', icon: 'Clock' },
            { search: '<div className="text-3xl mb-2"></div>', replace: '<div className="flex justify-center mb-2"><Inbox className="w-8 h-8 opacity-50" /></div>', icon: 'Inbox' },
            { search: '<span className="text-xl"></span>', replace: '<AlertCircle className="w-5 h-5 inline" />', icon: 'AlertCircle' }
        ]
    },
    {
        file: 'src/app/dashboard/reports/page.tsx',
        replacements: [
            { search: 'icon={<span className="text-sm"></span>}', replace: 'icon={<FileText className="w-4 h-4" />}', icon: 'FileText' }
        ]
    },
    {
        file: 'src/app/dashboard/units/page.tsx',
        replacements: [
            { search: '<div className="text-3xl mb-2 opacity-50"></div>', replace: '<div className="flex justify-center mb-2 opacity-50"><Inbox className="w-8 h-8" /></div>', icon: 'Inbox' }
        ]
    },
    {
        file: 'src/app/dashboard/users/page.tsx',
        replacements: [
            { search: '<div className="text-4xl mb-3"></div>', replace: '<div className="flex justify-center mb-3"><User className="w-10 h-10 text-gray-300" /></div>', icon: 'User' },
            { search: '<span className="text-[8px] font-black opacity-60"></span>', replace: '<AlertCircle className="w-3 h-3 inline opacity-60" />', icon: 'AlertCircle' }
        ]
    },
    {
        file: 'src/components/akutansi/AkuntansiTabs.tsx',
        replacements: [
            { search: '<div className="text-4xl mb-3 opacity-40"></div>', replace: '<div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>', icon: 'Inbox' }
        ]
    },
    {
        file: 'src/components/akutansi/BukuBesar.tsx',
        replacements: [
            { search: '<span className="text-gray-400"></span>', replace: '<FileText className="w-4 h-4 text-gray-400" />', icon: 'FileText' },
            { search: '<div className="text-4xl mb-3 opacity-40"></div>', replace: '<div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>', icon: 'Inbox' },
            { search: '<button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100"></button>', replace: '<button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 flex items-center justify-center"><X className="w-5 h-5" /></button>', icon: 'X' }
        ]
    },
    {
        file: 'src/components/akutansi/JurnalUmum.tsx',
        replacements: [
            { search: '<div className="text-4xl mb-3 opacity-40"></div>', replace: '<div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>', icon: 'Inbox' },
            { search: '<button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100"></button>', replace: '<button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 flex items-center justify-center"><X className="w-5 h-5" /></button>', icon: 'X' }
        ]
    },
    {
        file: 'src/components/akutansi/Neraca.tsx',
        replacements: [
            { search: '<div className="text-4xl mb-3 opacity-40"></div>', replace: '<div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>', icon: 'Inbox' }
        ]
    },
    {
        file: 'src/components/inventory/BulkAddUnitModal.tsx',
        replacements: [
            { search: '<div className="text-3xl mb-2"></div>', replace: '<div className="flex justify-center mb-2"><Inbox className="w-8 h-8 opacity-50" /></div>', icon: 'Inbox' }
        ]
    },
    {
        file: 'src/components/inventory/LaptopPickerModal.tsx',
        replacements: [
            { search: '<div className="text-3xl mb-2 opacity-50"></div>', replace: '<div className="flex justify-center mb-2 opacity-50"><Inbox className="w-8 h-8" /></div>', icon: 'Inbox' }
        ]
    },
    {
        file: 'src/components/layout/OnlineUsersPanel.tsx',
        replacements: [
            { search: '<div className="text-2xl mb-1"></div>', replace: '<div className="flex justify-center mb-1"><User className="w-6 h-6 text-gray-400" /></div>', icon: 'User' },
            { search: '<div className="text-2xl mb-1.5"></div>', replace: '<div className="flex justify-center mb-1.5"><User className="w-6 h-6 text-gray-400" /></div>', icon: 'User' }
        ]
    },
    {
        file: 'src/components/missions/MissionsWorkspace.tsx',
        replacements: [
            { search: '<span style={{ fontSize: 15 }}></span>', replace: '<AlertCircle className="w-4 h-4 inline" />', icon: 'AlertCircle' },
            { search: '<p className="text-3xl mb-2"></p>', replace: '<div className="flex justify-center mb-2"><Inbox className="w-8 h-8 opacity-50" /></div>', icon: 'Inbox' },
            { search: '<span className="text-xl"></span>', replace: '<Clock className="w-5 h-5 inline" />', icon: 'Clock' },
            { search: '<div className="text-4xl mb-3"></div>', replace: '<div className="flex justify-center mb-3"><Inbox className="w-10 h-10 opacity-30" /></div>', icon: 'Inbox' }
        ]
    },
    {
        file: 'src/components/ui/GroupChatPanel.tsx',
        replacements: [
            { search: '<div className="text-3xl opacity-20"></div>', replace: '<div className="flex justify-center opacity-20"><Inbox className="w-8 h-8" /></div>', icon: 'Inbox' },
            { search: '<span style={{ fontSize: 14 }}></span>', replace: '<Clock className="w-4 h-4 inline" />', icon: 'Clock' },
            { search: '<span style={{ opacity: 0.6 }}></span>', replace: '<FileText className="w-4 h-4 inline opacity-60" />', icon: 'FileText' }
        ]
    }
];

plan.forEach(item => processFile(item.file, item.replacements));
