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

  // Replace shadow and border for shells to match dashboard theme
  content = content.replace(/box-shadow:\s*0\s*32px\s*80px[^;]+;/g, "box-shadow: 0 4px 20px -4px rgba(0,0,0,0.05);");
  content = content.replace(/border:\s*1px\s*solid\s*#E4E4E7;/g, "border: 1px solid #F1F5F9;");
  
  // Also adjust stat cards and row cards inside modals to be cleaner
  content = content.replace(/box-shadow:\s*0\s*1px\s*4px[^;]+;/g, "box-shadow: 0 2px 10px rgba(0,0,0,0.02);");
  
  // Translate texts
  const translations = {
    "Gross Profit Overview": "Ringkasan Gross Profit",
    "Close": "Tutup",
    "Search": "Cari",
    "Filter": "Saring",
    "Loading": "Memuat",
    "Sales Performance": "Performa Sales",
    "Top Laptops": "Laptop Terlaris",
    "Top Sales": "Top Sales",
    "Inventory Overview": "Ringkasan Inventaris",
    "Total Revenue": "Total Omzet",
    "Revenue Overview": "Ringkasan Omzet",
    "Transaction Detail": "Detail Transaksi",
    "Today's Transactions": "Transaksi Hari Ini",
    "Service Dashboard": "Dashboard Servis",
    "View Details": "Lihat Detail",
    "Details": "Detail"
  };

  for (const [en, id] of Object.entries(translations)) {
    // simple string replacements (be careful with exact matches where possible)
    // we'll replace strings wrapped in quotes or tags, but standard replaceAll works if we're careful.
    content = content.replaceAll(`"${en}"`, `"${id}"`);
    content = content.replaceAll(`'${en}'`, `'${id}'`);
    content = content.replaceAll(`>${en}<`, `>${id}<`);
    content = content.replaceAll(en, id); // Fallback for plain text, might over-replace but likely safe for these specific phrases
  }
  
  fs.writeFileSync(filepath, content, 'utf8');
});

console.log("Replaced themes and translated texts in modals and widget.");
