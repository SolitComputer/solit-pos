#!/bin/bash
cd /var/www/solit-pos
git pull origin main
npm install
npm run build
pm2 restart solit-pos
echo "Deploy selesai!"
