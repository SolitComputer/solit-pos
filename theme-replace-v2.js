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

  // Replace text colors that are #18181B to Slate-900 (#0f172a)
  content = content.replaceAll('color: "#18181B"', 'color: "#0f172a"');
  content = content.replaceAll("color: '#18181B'", "color: '#0f172a'");
  content = content.replaceAll('color: "#27272A"', 'color: "#1e293b"');
  content = content.replaceAll('color: "#3F3F46"', 'color: "#475569"');
  content = content.replaceAll('color: "#52525B"', 'color: "#475569"');

  // Replace linear gradients containing dark zinc/gray/black
  content = content.replaceAll('linear-gradient(90deg,#18181B,#3F3F46)', 'linear-gradient(90deg,#6366f1,#818cf8)');
  content = content.replaceAll('linear-gradient(90deg, #18181B, #3F3F46)', 'linear-gradient(90deg, #6366f1, #818cf8)');
  content = content.replaceAll('linear-gradient(135deg, #18181B, #27272A)', 'linear-gradient(135deg, #6366f1, #4f46e5)');
  content = content.replaceAll('linear-gradient(135deg,#18181B 0%,#3F3F46 100%)', 'linear-gradient(135deg,#6366f1 0%,#4f46e5 100%)');
  content = content.replaceAll('linear-gradient(135deg, #18181B 0%, #3F3F46 100%)', 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)');
  content = content.replaceAll('linear-gradient(180deg,#18181B,#3F3F46)', 'linear-gradient(180deg,#6366f1,#4f46e5)');

  // Replace background colors and specific values
  content = content.replaceAll('background: "#18181B"', 'background: "#6366f1"');
  content = content.replaceAll('background: "#3F3F46"', 'background: "#818cf8"');
  content = content.replaceAll('background: "#27272A"', 'background: "#4f46e5"');
  content = content.replaceAll('bg: "#18181B"', 'bg: "#6366f1"');
  content = content.replaceAll('bar: "linear-gradient(90deg,#18181B,#3F3F46)"', 'bar: "linear-gradient(90deg,#6366f1,#818cf8)"');
  content = content.replaceAll('bar: "linear-gradient(90deg, #18181B, #3F3F46)"', 'bar: "linear-gradient(90deg, #6366f1, #818cf8)"');
  content = content.replaceAll('stripColor: "linear-gradient(90deg, #18181B, #3F3F46)"', 'stripColor: "linear-gradient(90deg, #6366f1, #818cf8)"');

  // Specific array configurations
  content = content.replaceAll('{ bg: "linear-gradient(135deg, #18181B, #27272A)"', '{ bg: "linear-gradient(135deg, #6366f1, #4f46e5)"');

  // Let's do some general clean replacements for classNames and styles
  content = content.replaceAll('className="bg-[#18181B]', 'className="bg-[#6366f1]');
  content = content.replaceAll('className="text-[#18181B]', 'className="text-[#0f172a]');

  fs.writeFileSync(filepath, content, 'utf8');
});

console.log("Replaced inline dark styles with Indigo/Slate styling.");
