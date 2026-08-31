const fs = require('fs');
const path = require('path');

const filesToProcess = [
  "src/components/modals/GrossProfitDetailModal.tsx",
  "src/components/modals/InventoryDetailModal.tsx",
  "src/components/modals/LaptopDetailModal.tsx",
  "src/components/modals/RevenueDetailModal.tsx",
  "src/components/modals/SalesDetailModal.tsx",
  "src/components/modals/TransactionDetailModal.tsx",
  "src/components/service/ServiceDashboardWidget.tsx",
  "src/app/dashboard/page.tsx"
];

filesToProcess.forEach(file => {
  let filepath = path.join(__dirname, file);
  if (!fs.existsSync(filepath)) return;
  
  let content = fs.readFileSync(filepath, 'utf8');

  // Revert incorrect code replacements
  content = content.replaceAll("onTutup", "onClose");
  content = content.replaceAll("backdropSaring", "backdropFilter");
  
  fs.writeFileSync(filepath, content, 'utf8');
});

console.log("Fixed incorrect prop and style replacements.");
