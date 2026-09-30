/* 值班速查 service worker — precache everything for offline use */
const VERSION = '42266cc16d';
const CACHE = 'oncall-' + VERSION;
const ASSETS = ["./", "README.md", "app.js", "data/chapters.json", "data/flows/01.json", "data/flows/02.json", "data/flows/03.json", "data/flows/04.json", "data/flows/05.json", "data/flows/06.json", "data/flows/07.json", "data/flows/08.json", "data/flows/09.json", "data/flows/10.json", "data/flows/11.json", "data/flows/12.json", "data/flows/13.json", "data/flows/14.json", "data/flows/15.json", "data/flows/16.json", "data/flows/17.json", "data/flows/18.json", "data/flows/19.json", "data/flows/20.json", "data/flows/21.json", "data/flows/22.json", "data/flows/23.json", "data/flows/24.json", "data/flows/25.json", "data/flows/26.json", "data/flows/27.json", "data/flows/28.json", "data/flows/29.json", "data/flows/30.json", "data/flows/31.json", "data/flows/32.json", "data/flows/33.json", "data/flows/34.json", "data/flows/35.json", "data/flows/36.json", "data/flows/37.json", "data/flows/38.json", "data/flows/index.json", "figs/a1_alternans.jpg", "figs/a1_hyperacuteT.jpg", "figs/a1_inferior_stemi.jpg", "figs/a1_lbbb_sgarbossa.jpg", "figs/a1_pe.jpg", "figs/a1_pericarditis.jpg", "figs/a1_posterior.jpg", "figs/a1_prwp.jpg", "figs/a1_reciprocal.jpg", "figs/a1_std_ddx.jpg", "figs/a1_std_types.jpg", "figs/a1_ste_ddx.jpg", "figs/a1_ste_shapes.jpg", "figs/a1_wellens.jpg", "figs/a2_atelectasis.jpg", "figs/a2_dissection.jpg", "figs/a2_edema.jpg", "figs/a2_effusion.jpg", "figs/a2_emphysema.jpg", "figs/a2_pe.jpg", "figs/a2_pericardial.jpg", "figs/a2_pneumomediastinum.jpg", "figs/a2_pneumonia.jpg", "figs/a2_ptx_line.jpg", "figs/a2_ptx_supine.jpg", "figs/a3_bowel_wall.jpg", "figs/a3_decubitus.jpg", "figs/a3_freeair_supine.jpg", "figs/a3_freeair_upright.jpg", "figs/a3_gas_biliary_portal.jpg", "figs/a3_liver_signs.jpg", "figs/a3_obstruction.jpg", "figs/a3_stones.jpg", "figs/a3_volvulus.jpg", "figs/ecg_af_svr.jpg", "figs/ecg_afib.jpg", "figs/ecg_aflutter.jpg", "figs/ecg_at.jpg", "figs/ecg_avb1.jpg", "figs/ecg_avb2_1.jpg", "figs/ecg_avb2_2.jpg", "figs/ecg_avb3.jpg", "figs/ecg_avb_high.jpg", "figs/ecg_avnrt_avrt.jpg", "figs/ecg_hyperk.jpg", "figs/ecg_hypok.jpg", "figs/ecg_junctional.jpg", "figs/ecg_mat.jpg", "figs/ecg_pac_pvc.jpg", "figs/ecg_pvc_danger.jpg", "figs/ecg_sinus_brady.jpg", "figs/ecg_sinus_tachy.jpg", "figs/ecg_svt_aberrancy.jpg", "figs/ecg_tdp.jpg", "figs/ecg_vf.jpg", "figs/ecg_vt.jpg", "figs/fig14_1_rash_types.jpg", "figs/fig14_2_infectious.jpg", "figs/fig_abd_signs.jpg", "figs/fig_intubation.jpg", "figs/fig_meningeal_signs.jpg", "figs/fig_neck_xray.jpg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "manifest.webmanifest", "styles.css"];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // add in chunks so one failure doesn't abort everything
    const chunk = 20;
    for (let i = 0; i < ASSETS.length; i += chunk) {
      await Promise.all(ASSETS.slice(i, i + chunk).map(a => c.add(new Request(a, { cache: 'reload' })).catch(() => {})));
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('oncall-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const key = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') ? './' : req;
    const hit = await c.match(key, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') { const idx = await c.match('./'); if (idx) return idx; }
      return new Response('offline', { status: 503 });
    }
  })());
});
