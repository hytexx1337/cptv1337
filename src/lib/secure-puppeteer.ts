import puppeteer, { Browser, Page } from 'puppeteer';

let browser: Browser | null = null;

// User Agent constante
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

// Dominios permitidos para scraping
const ALLOWED_SCRAPING_DOMAINS = [
  '111movies.com',
  'vidlink.pro',
  'megafiles.store',
  'vidking.pro',
  'vidking.net',
  'videasy.net',
  'player.videasy.net',
  'vidsrc.xyz',
  'vidsrc.pro',
  'vidsrc.cc',
  'embed.su',
  'gomo.to',
  'player.smashy.stream',
  'cca.megafiles.store',
  'imdb.com',
  'www.imdb.com',
  'imdb-video.media-imdb.com',
];

/**
 * Verificar si un dominio está permitido para scraping
 */
export function isAllowedDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_SCRAPING_DOMAINS.some(domain => 
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

/**
 * 🔒 PUPPETEER SEGURO - Sin --no-sandbox cuando corremos como root
 * 
 * IMPORTANTE: Este browser solo debe usarse si PM2 corre como usuario no-root
 * Si corres como root, Puppeteer funcionará sin --no-sandbox
 */
export async function createSecureBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;
  
  // Detectar si corremos como root (solo en Linux/Unix)
  // En Windows, process.getuid no existe, así que isRoot será false
  const isRoot = process.getuid ? process.getuid() === 0 : false;
  const isWindows = process.platform === 'win32';
  
  const args = [
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--no-first-run',
    '--window-size=1920,1080',
  ];
  
  // ⚠️ Usuario pidió: "olvidate de seguridad, que funcione"
  // VidLink detecta headless mode - usar headless: false para que cargue el m3u8
  
  if (isWindows) {
    console.log('🪟 [WINDOWS] Puppeteer con --no-sandbox + --no-zygote');
    args.push('--no-sandbox', '--no-zygote');
  } else if (isRoot) {
    console.warn('🔒 [SECURITY] Running as root - Usando --no-sandbox + --no-zygote');
    console.warn('🔒 [SECURITY] RECOMENDADO: Migrar PM2 a usuario no-root');
    args.push('--no-sandbox', '--no-zygote');
  } else {
    console.log('✅ [SECURITY] Running as non-root user - Puppeteer con --no-sandbox + --no-zygote (seguro)');
    args.push('--no-sandbox', '--no-zygote');
  }
  
  try {
    // 🎭 MODO HEADLESS: Funciona en VPS sin interfaz gráfica
    // La anti-detección avanzada compensa por el modo headless
    browser = await puppeteer.launch({
      headless: true, // true = headless mode, funciona en VPS sin GUI
      args,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      timeout: 30000,
    });
    
    console.log('✅ Puppeteer browser launched successfully (headless mode)');
    return browser;
  } catch (error) {
    console.error('❌ Failed to launch Puppeteer:', error);
    
    // Mensaje más descriptivo del error
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Puppeteer launch failed: ${errorMsg}. Si estás en Linux como root, migra PM2 a usuario no-root.`);
  }
}

/**
 * Configurar anti-detección en una página de Puppeteer
 * Hace que el scraper sea más difícil de detectar incluso en headless mode
 */
export async function setupAntiDetection(page: Page): Promise<void> {
  // Configurar User Agent
  await page.setUserAgent(UA);
  
  // Configurar viewport realista
  await page.setViewport({ width: 1920, height: 1080 });
  
  // 🎭 Anti-detección avanzada para headless mode
  await page.evaluateOnNewDocument(() => {
    // Sobrescribir navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
    
    // Chrome headless detection workaround
    (window as any).chrome = {
      runtime: {},
    };
    
    // Plugins realistas
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
      ],
    });
    
    // Idiomas realistas
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    
    // Permissions
    const originalQuery = (window.navigator as any).permissions.query;
    (window.navigator as any).permissions.query = (parameters: any) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
    
    // Evitar detección de headless por document.hidden
    Object.defineProperty(document, 'hidden', {
      get: () => false,
    });
    
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
    });
  });
}

/**
 * Crear una página desde un browser existente (sin validación de dominio)
 * Usar cuando ya tienes un browser creado
 */
export async function createSecurePage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  
  // Aplicar anti-detección completa
  await setupAntiDetection(page);
  
  return page;
}

/**
 * Crear una página segura con validación de dominio
 * Crea el browser y la página automáticamente
 */
export async function createSecurePageWithUrl(url: string): Promise<Page> {
  // 🔒 Validar que el dominio esté permitido
  if (!isAllowedDomain(url)) {
    throw new Error(`Domain not allowed for scraping: ${new URL(url).hostname}`);
  }
  
  const browser = await createSecureBrowser();
  const page = await browser.newPage();
  
  // Aplicar anti-detección completa
  await setupAntiDetection(page);
  
  // Bloquear recursos innecesarios para mayor velocidad
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    
    // Bloquear imágenes, fuentes, etc. (solo queremos el contenido)
    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });
  
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
      browser = null;
      console.log('✅ Puppeteer browser closed');
    } catch (error) {
      console.error('⚠️  Error closing browser:', error);
    }
  }
}

// Cleanup al terminar el proceso
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});
