// =========================================
// 🚀 4. إعدادات البوت والاتصال 
// =========================================
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: dataPath }),
    puppeteer: {
        headless: true,
        args:[
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', 
            '--no-first-run', 
            '--no-zygote', 
            '--disable-gpu',
            '--disable-application-cache', 
            '--disable-offline-load-stale-cache',
            '--disable-background-timer-throttling', 
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            // هذا الأمر يمنع الكروم من تخطي مساحة محددة
            '--js-flags="--max-old-space-size=250"',
            // هذا الأمر يمنع تحميل الصور والملفات القديمة التي تفجر الرامات
            '--blink-settings=imagesEnabled=false' 
        ]
    }
});
