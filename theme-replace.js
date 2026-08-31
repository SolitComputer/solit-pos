const fs = require('fs');
const path = require('path');

const filesToProcess = [
  "src/components/modals/GrossProfitDetailModal.tsx",
  "src/components/modals/InventoryDetailModal.tsx",
  "src/components/modals/LaptopDetailModal.tsx",
  "src/components/modals/RevenueDetailModal.tsx",
  "src/components/modals/SalesDetailModal.tsx",
  "src/components/modals/TransactionDetailModal.tsx",
  "src/components/service/ServiceDashboardWidget.tsx"
];

filesToProcess.forEach(file => {
  let filepath = path.join(__dirname, file);
  if (!fs.existsSync(filepath)) return;
  
  let content = fs.readFileSync(filepath, 'utf8');

  // Replace stark blacks with Dashboard Indigo/Teal Theme
  
  // 1. Dark backgrounds & gradients
  content = content.replace(/linear-gradient\(135deg, #18181B 0%, #27272A 100%\)/g, "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)");
  content = content.replace(/background: #18181B/g, "background: #6366f1");
  content = content.replace(/background: #27272A/g, "background: #4f46e5");
  content = content.replace(/background-color: #18181B/g, "background-color: #6366f1");
  
  // 2. Borders
  content = content.replace(/border: 1px solid #18181B/g, "border: 1px solid #6366f1");
  content = content.replace(/border: 1px solid #27272A/g, "border: 1px solid #4f46e5");
  content = content.replace(/border-color: #18181B/g, "border-color: #6366f1");
  
  // 3. Text & SVGs
  content = content.replace(/color: #18181B/g, "color: #1e293b"); // slate-800 for dark text
  content = content.replace(/color: #27272A/g, "color: #334155"); // slate-700
  content = content.replace(/stroke="#18181B"/g, 'stroke="#6366f1"');
  
  // 4. Progress Bars and secondary darks
  content = content.replace(/background: #52525B/g, "background: #a5b4fc"); // indigo-300
  content = content.replace(/linear-gradient\(90deg, #52525B, #71717A\)/g, "linear-gradient(90deg, #6366f1, #818cf8)");

  // Tab active color
  content = content.replace(/\.gpdm-tab-active \{[\s\S]*?background: #18181B;[\s\S]*?color: #FFFFFF;/g, ".gpdm-tab-active {\n          background: #6366f1;\n          color: #FFFFFF;");
  content = content.replace(/\.idm-tab-active \{[\s\S]*?background: #18181B;[\s\S]*?color: #FFFFFF;/g, ".idm-tab-active {\n          background: #6366f1;\n          color: #FFFFFF;");
  content = content.replace(/\.ldm-tab-active \{[\s\S]*?background: #18181B;[\s\S]*?color: #FFFFFF;/g, ".ldm-tab-active {\n          background: #6366f1;\n          color: #FFFFFF;");
  content = content.replace(/\.rdm-tab-active \{[\s\S]*?background: #18181B;[\s\S]*?color: #FFFFFF;/g, ".rdm-tab-active {\n          background: #6366f1;\n          color: #FFFFFF;");
  content = content.replace(/\.sdm-tab-active \{[\s\S]*?background: #18181B;[\s\S]*?color: #FFFFFF;/g, ".sdm-tab-active {\n          background: #6366f1;\n          color: #FFFFFF;");
  content = content.replace(/\.tdm-tab-active \{[\s\S]*?background: #18181B;[\s\S]*?color: #FFFFFF;/g, ".tdm-tab-active {\n          background: #6366f1;\n          color: #FFFFFF;");
  
  // Badge Profit/Revenue specifically
  content = content.replace(/\.badge-profit \{[\s\S]*?background: #18181B;[\s\S]*?color: #FFFFFF;[\s\S]*?border: 1px solid #18181B;/g, ".badge-profit {\n          background: #10b981;\n          color: #FFFFFF;\n          border: 1px solid #10b981;");
  content = content.replace(/\.badge-revenue \{[\s\S]*?background: #18181B;[\s\S]*?color: #FFFFFF;[\s\S]*?border: 1px solid #18181B;/g, ".badge-revenue {\n          background: #6366f1;\n          color: #FFFFFF;\n          border: 1px solid #6366f1;");
  
  fs.writeFileSync(filepath, content, 'utf8');
});

console.log("Replaced black/monochromatic theme with pastel indigo theme in modals.");
