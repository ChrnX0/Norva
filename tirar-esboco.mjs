import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 412, height: 1200 }, deviceScaleFactor: 2 });
await p.goto('file:///home/user/SZG-app/docs/design/esbocos/papel-pagina-inteira.html');
await p.screenshot({ path: '/home/user/SZG-app/.shots/esboco-pagina.png', fullPage: true });
await b.close();
console.log('ok');
