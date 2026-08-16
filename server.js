/* ================================================================
   MOKA HOUSE / ERSCOMAS — v7.9 (Subscriptions + Reviews + all)
================================================================ */
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_VERCEL = !!process.env.VERCEL;
const DB_PATH = IS_VERCEL ? '/tmp/db.json' : path.join(__dirname, 'data', 'db.json');
const FLOW = ['queued', 'brewing', 'ready', 'picked-up'];
const PERMS = ['can_menu', 'can_orders', 'can_events', 'can_posts', 'can_wallet'];
const ROLES = ['admin', 'moderator', 'staff', 'customer'];
const PAYMENT_METHODS = ['telebirr', 'mpesa', 'paypal', 'card', 'bank', 'crypto'];
const HOURS_TEXT = 'Mon–Fri 07:30–18:00 · Sat 08:00–19:00 · Sun 08:00–16:00';
const SHOPS_TEXT = 'Old Harbor (14 Quay St) · Riverside (3 Bridge Walk) · Museum Quarter (Kiosk 2)';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '537057497081-825kae6eoe6fantrdi7ve32dhn8q58tp.apps.googleusercontent.com';
const googleEnabled = /\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID);

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const sbEnabled = !!(SUPABASE_URL && SUPABASE_KEY);

const ADMIN_USER = 'erscomas';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '#199589111822Er';
const MOD_COUNT = 5;
const MOD_PASS = '#Moderator2026';
const DEFAULT_MOD_PERMS = { can_menu: true, can_orders: true, can_events: false, can_posts: false, can_wallet: false };

/* ---------- helpers ---------- */
const SESSION_TTL = 12 * 60 * 60 * 1000;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function parseCookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
const validUserName = u => /^[a-zA-Z0-9_.-]{3,20}$/.test(u);

/* ---------- 🔐 sessions ---------- */
const SESSION_SECRET = sha('moka-house-secret-' + ADMIN_PASS);
function signToken(p) {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(t) {
  if (!t) return null;
  const [body, sig] = String(t).split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!safeEq(sig, expect)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); if (!p.exp || Date.now() > p.exp) return null; return p; } catch { return null; }
}
function getSession(req) { const c = parseCookies(req); const p = verifyToken(c.moka_admin); return p ? { user: p.user } : null; }
function getAcctCookie(req) { const c = parseCookies(req); const p = verifyToken(c.moka_acct); return p && p.user ? p : null; }
function startSession(res, uname) {
  const prod = NODE_ENV === 'production';
  const token = signToken({ user: uname, exp: Date.now() + SESSION_TTL });
  res.setHeader('Set-Cookie', `moka_admin=${token}; Path=/; HttpOnly; SameSite=${prod ? 'None' : 'Lax'}; ${prod ? 'Secure; ' : ''}Max-Age=${SESSION_TTL / 1000}`);
  return token;
}

/* ---------- limiters ---------- */
function makeLimiter({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (n - v.start > windowMs) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip || 'anon'; const n = Date.now();
    let r = hits.get(key); if (!r || n - r.start > windowMs) r = { start: n, count: 0 };
    r.count++; hits.set(key, r);
    if (r.count > max) { const mins = Math.max(1, Math.ceil((r.start + windowMs - n) / 60000)); return res.status(429).json({ error: message.replace('{m}', mins) }); }
    next();
  };
}
const authLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many attempts — wait {m} min' });
const regLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many signups — wait {m} min' });
const chatLimiter = makeLimiter({ windowMs: 60 * 1000, max: 40, message: 'Slow down ☕' });
const payLimiter = makeLimiter({ windowMs: 60 * 1000, max: 15, message: 'Too many payments — wait {m} min' });

/* ================= 🌍 i18n ================= */
const I18N = {
en:{board:'The Board',brew:'Brew Lab',shops:'Shops',club:'Stamp Card',events:'Events',staff:'Staff ⚿',tray:'Tray',mast_copy:'Small-batch coffee, roasted in the back room every Tuesday and poured all day at three counters across the city.',cta1:'Browse the board ↓',cta2:'Book a cupping',roast:'On the bar today →',open_closes:'Open · closes',closed_opens:'Closed · opens',closed_day:'Closed for the day',s1_title:'What\'s on <em>today</em>',s1_desc:'Everything is pulled, brewed or baked in-house. Add to your tray and pay your way.',add:'+ Add',soldout:'Sold out',cat_all:'All',cat_espresso:'Espresso',cat_filter:'Filter',cat_cold:'Cold',cat_bakes:'Bakes',s2_title:'Dial it in <em>at home</em>',s2_desc:'Our bar recipes, live. Pick a method and brew along with the timer.',dose:'Dose',ratio:'Ratio',water:'Water',temp:'Water temp',grind:'Grind',timer:'Brew timer',start:'Start brew ▸',s3_title:'Three rooms, <em>one roast</em>',s3_desc:'Live door status, straight from the clock.',s4_title:'Buy seven, <em>the eighth is on us</em>',s4_desc:'One stamp per drink — your card remembers you.',p1:'A free drink of any size when the card is full',p2:'First pour of every fresh roast, for members',p3:'10% off retail beans, every day',p4:'Priority seats at Friday cuppings',collect:'Collect today\'s stamp',s5_title:'Sessions & <em>tastings</em>',s5_desc:'Seats are limited — reserve yours.',seats:'seats left',reserve:'Reserve a seat',s6_title:'News & <em>stories</em>',s6_desc:'What we\'re roasting and pouring — posted by the crew.',hello_title:'Say hello — we\'ll pour you <b>something good.</b>',news_btn:'Join the roast list',f_visit:'Visit',f_hours:'Hours',f_elsewhere:'Elsewhere',empty_tray:'Your tray is empty.',pickup:'Pickup',subtotal:'Subtotal',checkout:'Checkout ◆',pay_method:'Choose payment method',confirm:'Confirm payment',processing:'Processing...',cancel:'Cancel',success:'Payment successful!',order_no:'Order',chat_greet:'Hi! ☕ Ask me anything about the menu, prices, hours, events or brewing.',chat_ph:'Ask me anything…',bot_menu:'On the board',bot_price:'costs',bot_hours:'We\'re open',bot_loc:'Find us at',bot_pay:'We accept',bot_stamp:'Stamp card: buy 7, the 8th is free.',bot_events:'Upcoming events',bot_brew:'Brew guide',bot_langs:'The site speaks',bot_credit:'Built by',bot_fallback:'I know the menu, prices, hours, events, payments & brewing — try those!',back_shop:'← Back to the shop',login:'Log in',register:'Register',logout:'Logout',track_order:'Track order',my_orders:'My Orders'},
am:{board:'ሜኑው',brew:'ማፍያ ላብ',shops:'ሱቆች',club:'ስታምፕ ካርድ',events:'ዝግቶች',staff:'ሠራተኛ ⚿',tray:'መሸጫ',mast_copy:'ትንሽ-ርቢ ቡና፣ ማክሰ ሁሉ በለኛው ክል የተበሰ እና በሦስት ካውንተሮች ቀኑን ሙሉ የሚፍ።',cta1:'ሜኑውን ር ↓',cta2:'ኩፒንግ ያዝ',roast:'ዛሬ በባር ላይ →',open_closes:'ክፍት · ይዘል',closed_opens:'ዝግ · ይከፈታል',closed_day:'ዛሬ ግ ነው',s1_title:'ዛሬ <em>ምን አለ</em>',s1_desc:'ሁሉም በቤት ውስጥ የተዘጋጀ። ወደ መሸጫህ ጨምረህ በምትፈልው ዘዴ ክፈል።',add:'+ ጨምር',soldout:'አልቋል',cat_all:'ሁሉም',cat_espresso:'ኤስሬሶ',cat_filter:'ፊልተር',cat_cold:'ቀዝቃዛ',cat_bakes:'ኬኮች',s2_title:'በቤት <em>አዘጋ</em>',s2_desc:'የባር ስነ-ህጎቻችን በቀጥ። ዴ ምረጥ እና ከታይመር ጋር አዘጋጅ',dose:'መጠን',ratio:'ሬሾ',water:'ውሃ',temp:'የውሃ ሙቀት',grind:'ፍጭት',timer:'ማፍያ ታይመር',start:'ማፍያ ጀምር ▸',s3_title:'ሦስት ክፍሎች፣ <em>አንድ ጥበስ</em>',s3_desc:'ቀጥታ የበር ሁኔታ፣ ከሰዓ።',s4_title:'ሰብ ግዛ፣ <em>ስምንተኛው በእኛ</em>',s4_desc:'በእያንዳንዱ መጠጥ አንድ ስታም — ካርድህ ያስታውስሃል።',p1:'ካርዱ ሲላ ንኛውም መጠን ነፃ መጠጥ',p2:'የእያንዳንዱ አዲስ ጥበስ የመጀመሪያ ቅዳ አባት',p3:'በቡና ፍሬዎች 10% ቅናሽ፣ ሁልጊዜ',p4:'በአርብ ኩፒንጎች የመቀመ ቅድያ',collect:'የዛሬን ስምፕ ብስብ',s5_title:'ክፍለ-ጊዜች እና <em>ስነ-ጣም</em>',s5_desc:'መቀመጫዎች ውስን ናቸው — ያዙ',seats:'መቀመጫዎች ቀርተል',reserve:'መቀመጫ ያዙ',s6_title:'ዜና እና <em>ታሪኮች</em>',s6_desc:'የምናጠሰው እና የምንቀዳው — በሠራተኞች የተለጠ።',hello_title:'ሰላም በል — <b>መልካም ነገር</b> እንቀዳልሃለን።',news_btn:'ወደ ርዝር ተበል',f_visit:'ጎብኝ',f_hours:'ሰዓት',f_elsewhere:'ሌላም',empty_tray:'መሸጫህ ባዶ ው።',pickup:'መውሰጃ',subtotal:'ንዑስ ድምር',checkout:'ክፍያ ◆',pay_method:'የመክፈያ ዘዴ ረ',confirm:'ክያውን አረጋግጥ',processing:'በሂደት ላይ...',cancel:'ይቅር',success:'ክፍያው ተሳክቷል!',order_no:'ትዕዛዝ',chat_greet:'ሰላም! ☕ ስለ ሜኑ ዋ ሰዓት፣ ዝጅት ወይም ማፍያ የፈለግክህን ጠይቅ።',chat_ph:'የፈለግክህን ጠይ…',bot_menu:'በሜኑ ላይ',bot_price:'ዋጋው',bot_hours:'ክፍት እንሆናለን',bot_loc:'የምንገኝበት',bot_pay:'የምንቀበላቸው',bot_stamp:'ስታምፕ ካርድ፦ 7 ዛ 8ኛው ነፃ።',bot_events:'የሚመጡ ዝግጅቶች',bot_brew:'የማፍያ መመሪያ',bot_langs:'ሳይ የሚናገራቸው',bot_credit:'የተሰራው በ',bot_fallback:'ሜኑን፣ ዋጋን፣ ሰዓትን፣ ዝግጅቶችን፣ ክፍያዎችን እና ማፍያን አውቃለሁ — ክረኝ!',back_shop:'← ወደ ሱቅ ተመለስ',login:'ግ',register:'ተመዝገብ',logout:'ውጣ',track_order:'ትዕዛዝ ከታተል',my_orders:'የእኔ ትዕዛዞች'},
ar:{board:'القائمة',brew:'مختبر التحضير',shops:'المتاجر',club:'بطاقة الختم',events:'الفعاليات',staff:'الموظفون ⚿',tray:'السلة',mast_copy:'قهوة تُحمّص في الخلف كل ثلاثاء وتُقدَّم طوال اليوم في ثلاثة فروع.',cta1:'تصفح القائمة ↓',cta2:'احجز تذوقاً',roast:'اليوم على البار →',open_closes:'مفتوح · يغلق',closed_opens:'مغلق · يفتح',closed_day:'مغلق اليوم',s1_title:'ماذا يوجد <em>اليوم</em>',s1_desc:'كل شيء يُحضَّر في الداخل. أضف إلى سلتك وادفع بطريقتك.',add:'+ أضف',soldout:'نفد',cat_all:'الكل',cat_espresso:'إسبريسو',cat_filter:'فلتر',cat_cold:'بارد',cat_bakes:'مخبوزات',s2_title:'حضّرها <em>في البيت</em>',s2_desc:'وصفات البار مباشرة. اختر طريقة واتبع المؤقت.',dose:'الجرعة',ratio:'النسبة',water:'الماء',temp:'حرارة الماء',grind:'الطحن',timer:'مؤقت التحضير',start:'ابدأ ▸',s3_title:'ثلاثة فروع، <em>تحميصة واحدة</em>',s3_desc:'حالة الباب مباشرة من الساعة.',s4_title:'اشترِ سبعاً، <em>الثامنة علينا</em>',s4_desc:'ختم لكل مشروب — بطاقتك تتذكرك.',p1:'مشروب مجاني عند امتلاء البطاقة',p2:'أول كوب من كل تحميصة للأعضاء',p3:'خصم 10% على البن دائماً',p4:'أولوية المقاعد يوم الجمعة',collect:'اجمع ختم اليوم',s5_title:'جلسات و<em>تذوق</em>',s5_desc:'المقاعد محدودة — احجز مقعدك.',seats:'مقاعد متبقية',reserve:'احجز مقعداً',s6_title:'أخبار و<em>قصص</em>',s6_desc:'ما نحمّصه ونقدمه — من الفريق.',hello_title:'قل مرحباً — <b>سنسقيك شيئاً جيداً.</b>',news_btn:'انضم للقائمة',f_visit:'زرنا',f_hours:'الساعات',f_elsewhere:'أخرى',empty_tray:'سلتك فارغة.',pickup:'الاستلام',subtotal:'المجموع',checkout:'الدفع ◆',pay_method:'اختر طريقة الدفع',confirm:'تأكيد الدفع',processing:'جاري المعالجة...',cancel:'إلغاء',success:'تم الدفع بنجاح!',order_no:'الطلب',chat_greet:'مرحباً! ☕ اسألني عن القائمة والأسعار والساعات والفعاليات.',chat_ph:'اسألني أي شيء…',bot_menu:'في القائمة',bot_price:'سعره',bot_hours:'نفتح',bot_loc:'تجدنا في',bot_pay:'نقبل',bot_stamp:'البطاقة: اشترِ 7 والثامنة مجانية.',bot_events:'الفعاليات القادمة',bot_brew:'دليل التحضير',bot_langs:'الموقع يتحدث',bot_credit:'صنع بواسطة',bot_fallback:'أعرف القائمة والأسعار والساعات والفعاليات والدفع — جرّب!',back_shop:'← العودة للمتجر',login:'دخول',register:'تسجيل',logout:'خروج',track_order:'تتبع الطلب',my_orders:'طلباتي'},
fr:{board:'La Carte',brew:'Labo Café',shops:'Boutiques',club:'Carte fidélité',events:'Événements',staff:'Staff ⚿',tray:'Panier',mast_copy:'Café en petites séries, torréfié chaque mardi et servi toute la journée dans trois comptoirs.',cta1:'Voir la carte ↓',cta2:'Réserver une dégustation',roast:'Aujourd\'hui au bar →',open_closes:'Ouvert · ferme',closed_opens:'Fermé · ouvre',closed_day:'Fermé aujourd\'hui',s1_title:'Au menu <em>aujourd\'hui</em>',s1_desc:'Tout est préparé sur place. Ajoutez au panier et payez comme vous voulez.',add:'+ Ajouter',soldout:'Épuisé',cat_all:'Tout',cat_espresso:'Espresso',cat_filter:'Filtre',cat_cold:'Froid',cat_bakes:'Pâtisseries',s2_title:'Préparez <em>à la maison</em>',s2_desc:'Nos recettes, en direct. Choisissez une méthode et suivez le minuteur.',dose:'Dose',ratio:'Ratio',water:'Eau',temp:'Temp. de l\'eau',grind:'Mouture',timer:'Minuteur',start:'Démarrer ▸',s3_title:'Trois salles, <em>une torréfaction</em>',s3_desc:'Statut en direct, selon l\'horloge.',s4_title:'Sept achats, <em>le 8e offert</em>',s4_desc:'Un tampon par boisson — votre carte se souvient.',p1:'Boisson gratuite à carte pleine',p2:'Premier verre de chaque torréfaction',p3:'-10% sur le café en grain',p4:'Places prioritaires le vendredi',collect:'Tampon du jour',s5_title:'Sessions & <em>dégustations</em>',s5_desc:'Places limitées — réservez.',seats:'places restantes',reserve:'Réserver',s6_title:'News & <em>histoires</em>',s6_desc:'Ce que nous torréfions — publié par l\'équipe.',hello_title:'Dites bonjour — <b>on vous sert du bon.</b>',news_btn:'Rejoindre la liste',f_visit:'Visiter',f_hours:'Horaires',f_elsewhere:'Ailleurs',empty_tray:'Panier vide.',pickup:'Retrait',subtotal:'Sous-total',checkout:'Payer ◆',pay_method:'Choisir le paiement',confirm:'Confirmer',processing:'Traitement...',cancel:'Annuler',success:'Paiement réussi!',order_no:'Commande',chat_greet:'Salut! ☕ Demandez-moi menu, prix, horaires, événements.',chat_ph:'Demandez-moi tout…',bot_menu:'À la carte',bot_price:'coûte',bot_hours:'Nous sommes ouverts',bot_loc:'Trouvez-nous à',bot_pay:'Nous acceptons',bot_stamp:'Carte: 7 achats, le 8e offert.',bot_events:'Événements à venir',bot_brew:'Guide de préparation',bot_langs:'Le site parle',bot_credit:'Créé par',bot_fallback:'Je connais la carte, les prix, horaires, événements, paiements — essayez!',back_shop:'← Retour boutique',login:'Connexion',register:'S\'inscrire',logout:'Déconnexion',track_order:'Suivre la commande',my_orders:'Mes commandes'},
es:{board:'La Carta',brew:'Lab de Café',shops:'Tiendas',club:'Tarjeta',events:'Eventos',staff:'Staff ⚿',tray:'Bandeja',mast_copy:'Café de lotes pequeños, tostado cada martes y servido todo el día en tres mostradores.',cta1:'Ver la carta ↓',cta2:'Reservar cata',roast:'Hoy en la barra →',open_closes:'Abierto · cierra',closed_opens:'Cerrado · abre',closed_day:'Cerrado hoy',s1_title:'Qué hay <em>hoy</em>',s1_desc:'Todo se prepara aquí. Añade a tu bandeja y paga como quieras.',add:'+ Añadir',soldout:'Agotado',cat_all:'Todo',cat_espresso:'Espresso',cat_filter:'Filtro',cat_cold:'Frío',cat_bakes:'Horneados',s2_title:'Prepáralo <em>en casa</em>',s2_desc:'Nuestras recetas en vivo. Elige método y sigue el temporizador.',dose:'Dosis',ratio:'Ratio',water:'Agua',temp:'Temp. del agua',grind:'Molienda',timer:'Temporizador',start:'Empezar ▸',s3_title:'Tres salas, <em>un tueste</em>',s3_desc:'Estado en vivo, según el reloj.',s4_title:'Compra siete, <em>el 8º va por nuestra cuenta</em>',s4_desc:'Un sello por bebida — tu tarjeta te recuerda.',p1:'Bebida gratis al llenar la tarjeta',p2:'Primer trago de cada tueste, para socios',p3:'10% de descuento en grano',p4:'Asientos prioritarios los viernes',collect:'Sello de hoy',s5_title:'Sesiones y <em>catas</em>',s5_desc:'Asientos limitados — reserva.',seats:'asientos libres',reserve:'Reservar',s6_title:'Noticias e <em>historias</em>',s6_desc:'Lo que tostamos — publicado por el equipo.',hello_title:'Di hola — <b>te servimos algo bueno.</b>',news_btn:'Unirse a la lista',f_visit:'Visitar',f_hours:'Horarios',f_elsewhere:'Otros',empty_tray:'Bandeja vacía.',pickup:'Recogida',subtotal:'Subtotal',checkout:'Pagar ◆',pay_method:'Elige método de pago',confirm:'Confirmar pago',processing:'Procesando...',cancel:'Cancelar',success:'¡Pago exitoso!',order_no:'Pedido',chat_greet:'¡Hola! ☕ Pregúntame por carta, precios, horarios, eventos.',chat_ph:'Pregúntame lo que sea…',bot_menu:'En la carta',bot_price:'cuesta',bot_hours:'Estamos abiertos',bot_loc:'Estamos en',bot_pay:'Aceptamos',bot_stamp:'Tarjeta: compra 7, la 8ª gratis.',bot_events:'Próximos eventos',bot_brew:'Guía de preparación',bot_langs:'El sitio habla',bot_credit:'Creado por',bot_fallback:'Conozco la carta, precios, horarios, eventos y pagos — ¡prueba!',back_shop:'← Volver a la tienda',login:'Entrar',register:'Registrarse',logout:'Salir',track_order:'Seguir pedido',my_orders:'Mis pedidos'},
om:{board:'Menu',brew:'Laabii Qophii',shops:'Suqiiwwan',club:'Kaardii',events:'Ayyaantota',staff:'Hojjetaa ⚿',tray:'Tiree',mast_copy:'Bunaan xixiqqaa, Kamiisa hunda duubatti waaddamee, guutuu guyyaa iddoo sadiitti dhiyaata.',cta1:'Menu ilaali ↓',cta2:'Dhandhama qabadhu',roast:'Har\'a baara irratti →',open_closes:'Banaa · cufama',closed_opens:'Cufaa · bana',closed_day:'Har\'a cufaa dha',s1_title:'Har\'a <em>maal jira</em>',s1_desc:'Hundi achitti qophaa\'a. Tiree keessatti dabalii kaffali.',add:'+ Dabali',soldout:'Dhumate',cat_all:'Hunda',cat_espresso:'Espresso',cat_filter:'Filter',cat_cold:'Qorra',cat_bakes:'Daaboo',s2_title:'Manatti <em>qopheessi</em>',s2_desc:'Seera baara keenyaa. Mala filadhuu waliin qopheessi.',dose:'Hanga',ratio:'Ratio',water:'Bishaan',temp:'Ho\'a bishaanii',grind:'Piisii',timer:'Sa\'aatii',start:'Jalqabi ▸',s3_title:'Kutaa sadii, <em>waaddii tokko</em>',s3_desc:'Haala balbala kallattiin.',s4_title:'Torba bitadhu, <em>8ffaan nu irratti</em>',s4_desc:'Dhugaata tokkoon stampii tokko.',p1:'Kaardiin yoo guute dhugaata bilisaa',p2:'Dhugaata jalqabaa miseensotaaf',p3:'Buna irratti 10% hir\'isa',p4:'Bakka duraa Jimaata',collect:'Stampii har\'aa',s5_title:'Kutaawwan fi <em>dhandhama</em>',s5_desc:'Bakkoon daangeffaman — qabadhu.',seats:'bakkoon hafan',reserve:'Bakka qabadhu',s6_title:'Oduu fi <em>seenaa</em>',s6_desc:'Kan waaddinu — gareen maxxanse.',hello_title:'Nagaa jedhi — <b>waan gaarii</b> siif dhangalaasna.',news_btn:'Tarree makamuu',f_visit:'Daawwadhu',f_hours:'Sa\'aatii',f_elsewhere:'Kan biro',empty_tray:'Tireen kee duwwaa dha.',pickup:'Fudhachuu',subtotal:'Walii gala',checkout:'Kaffali ◆',pay_method:'Mala kaffaltii filadhu',confirm:'Mirkaneessi',processing:'Adeemsa...',cancel:'Haqi',success:'Kaffaltiin milkaa\'e!',order_no:'Ajaja',chat_greet:'Akkam! ☕ Menu, gatii, sa\'aatii, ayyaantota gaafadhu.',chat_ph:'Waayuu gaafadhu…',bot_menu:'Menu irratti',bot_price:'gatiin',bot_hours:'Banaa dha',bot_loc:'Nu argatta',bot_pay:'Kan fudhannu',bot_stamp:'Kaardii: 7 bitadhu, 8ffaan bilisaa.',bot_events:'Ayyaantota dhufan',bot_brew:'Qajeelfama qophii',bot_langs:'Siteen dubbata',bot_credit:'Kan hojjetame',bot_fallback:'Menu, gatii, sa\'aatii, ayyaantota, kaffaltii nan beeka — yaali!',back_shop:'← Gara suuqii',login:'Seeni',register:'Galmaa\'i',logout:'Ba\'i',track_order:'Ajaja hordofi',my_orders:'Ajajoota koo'},
ti:{board:'ሜኑ',brew:'ላብ ',shops:'ኳናት',club:'ካርዲ',events:'መደባት',staff:'ሰራሕተኛ ⚿',tray:'መሸጢ',mast_copy:'ንእሽቶ ጅምላ ቡን ሰሉስ ጠዩ ብሰለስተ ቦታ መዓልቲ ምሉእ ይስራ።',cta1:'ሜኑ ርአ ↓',cta2:'ምስትምቓር ሓዝ',roast:'ሎሚ ኣብ ር →',open_closes:'ክፉት · ዕጾ',closed_opens:'ዕጹው · ክፈት',closed_day:'ሎሚ ዕጹው',s1_title:'ሎሚ <em>እንታይ ኣሎ</em>',s1_desc:'ኩሉ ኣብ ውሽጢ ይሎ ና መሸኻ ወስ።',add:'+ ስኽ',soldout:'ወዲኡ',cat_all:'ኩሉ',cat_espresso:'ኤስፕሬ',cat_filter:'ልተር',cat_cold:'ዝሑል',cat_bakes:'ዳቦ',s2_title:'ኣብ ገዛ <em>ዳሎ</em>',s2_desc:'ሕግት ባርና። መገዲ ሓሪኻ ምስ ታይመር ዳሎ።',dose:'መጠን',ratio:'ሬሾ',water:'ማይ',temp:'ሙቐት ማይ',grind:'ጥነት',timer:'ይመር',start:'ምር ▸',s3_title:'ሰለስተ ክፍ፡ <em>ንቲ ብሲ</em>',s3_desc:'ኩነታት ቐጥታ።',s4_title:'ሸውዓተ ግዛእ፡ <em>8ይ ብናትና</em>',s4_desc:'ንነፍሲ ወከፍ መስተ ሓንቲ ስምፕ።',p1:'ካርዲ ምስ መልአ ነጻ መስተ',p2:'ቀዳማይ ቡን ንኣላት',p3:'ኣብ ን 10% ርካሽ',p4:'ቀዳምነት መቐመጢ ዓርቢ',collect:'ስታምፕ ሎሚ',s5_title:'ክፍለ ግዜን <em>ምስትምቓርን</em>',s5_desc:'መቐመጢ ውሱን — ሓዝ።',seats:'መቐመጢ ተሪፉ',reserve:'መቐመጢ ሓዝ',s6_title:'ዜናን <em>ታሪን</em>',s6_desc:'እንጠብቖ — ብሰራሕተኛታት',hello_title:'ላም በል — <b>ጽቡቕ</b> ከስትየካ።',news_btn:'ናብ ዝርዝር ጽምበር',f_visit:'በጽሕ',f_hours:'ሰዓታት',f_elsewhere:'ካልእ',empty_tray:'መሸጢኻ ባዶ እዩ',pickup:'ምውሳድ',subtotal:'ንኡስ ድምር',checkout:'ክፈል ◆',pay_method:'መገዲ ክፍሊት ረ',confirm:'ኣረጋግጽ',processing:'ይስራሕ...',cancel:'ሰርዝ',success:'ክፍሊት ዓዊቱ!',order_no:'ትእዛዝ',chat_greet:'ሰላም! ☕ ብዛዕባ ኑ፣ ዋጋ፣ ሰዓት፣ መደባት ሕተት።',chat_ph:'ዝደለኻዮ ሕተት…',bot_menu:'ኣብ ሜኑ',bot_price:'ዋጋኡ',bot_hours:'ክፉታት ኢና',bot_loc:'ትረኽበና',bot_pay:'ንቕበሎም',bot_stamp:'ካርዲ፡ 7 ዛእ 8ይ ነ።',bot_events:'መጺኦም መደባት',bot_brew:'መምርሒ ዳሎ',bot_langs:'እቲ ሳይት ዝዛረበን',bot_credit:'ዝተሰርሐ ብ',bot_fallback:'ሜኑ ዋ፣ ዓት፣ መደባት፣ ክፍሊት እፈልጥ — ትን!',back_shop:'← ናብ ዱን',login:'እቶ',register:'ተመዝገብ',logout:'ውጻእ',track_order:'ትእዛዝ ስዓ',my_orders:'ትእዛዛተይ'},
so:{board:'Liiska',brew:'Shaybaarka',shops:'Dukaamada',club:'Kaarka',events:'Munaabadaha',staff:'Shaqaale ⚿',tray:'Saxaarad',mast_copy:'Kahwo yar-yar, Talaado walba la dubo, maalinta oo dhan saddex meelood lagu shubo.',cta1:'Eeg liiska ↓',cta2:'Ballan dhadhan',roast:'Maanta baarka →',open_closes:'Furan · xirma',closed_opens:'Xiran · furma',closed_day:'Maanta xiran',s1_title:'Maxaa <em>maanta</em> jira',s1_desc:'Wax walba halkan ayaa lagu diyaariyaa. Ku dar saxaaradda.',add:'+ Ku dar',soldout:'Waa dhammaaday',cat_all:'Dhammaan',cat_espresso:'Espresso',cat_filter:'Filter',cat_cold:'Qabow',cat_bakes:'Cajiin',s2_title:'Guriga <em>ku diyaari</em>',s2_desc:'Cuntooyinka baarka. Hab dooro oo la diyaari.',dose:'Qadar',ratio:'Isle\'eg',water:'Biyo',temp:'Kulaylka biyaha',grind:'Shiidi',timer:'Saacad',start:'Bilow ▸',s3_title:'Saddex qol, <em>hal dubis</em>',s3_desc:'Xaaladda albaabka toos.',s4_title:'Toddobo iibso, <em>8aad naguma</em>',s4_desc:'Cabitaan walba shaabad.',p1:'Cabitaan bilaash ah kaarka buuxa',p2:'Koobka hore ee dubis walba',p3:'10% dhimis bun',p4:'Kuraasta hore Jimcaha',collect:'Shaabadda maanta',s5_title:'Kalfadhiyo & <em>dhadhan</em>',s5_desc:'Kuraastu waa yar tahay — qabso.',seats:'kuraas haray',reserve:'Kursi qabso',s6_title:'Warar & <em>sheekooyin</em>',s6_desc:'Waxaan dubno — kooxdu qortay.',hello_title:'Salaan — <b>wax wanaagsan</b> ayaan kuu shubi.',news_btn:'Ku biir liiska',f_visit:'Booqo',f_hours:'Saacadaha',f_elsewhere:'Kale',empty_tray:'Saxaaraddaadu waa madhan.',pickup:'Qaadasho',subtotal:'Wadarta',checkout:'Bixi ◆',pay_method:'Dooro habka bixinta',confirm:'Xaqiiji',processing:'Hawsha...',cancel:'Jooji',success:'Bixintu waa guul!',order_no:'Amar',chat_greet:'Salaan! ☕ Weydii liiska, qiimaha, saacadaha.',chat_ph:'Wax walba weydii…',bot_menu:'Liiska',bot_price:'qiimihiisu',bot_hours:'Waa furnahay',bot_loc:'Naga hel',bot_pay:'Waan aqbalnaa',bot_stamp:'Kaarka: 7 iibso 8aad bilaash.',bot_events:'Munaabadaha soo socda',bot_brew:'Hagaha diyaarinta',bot_langs:'Siteku wuxuu ku hadlaa',bot_credit:'La sameeyay by',bot_fallback:'Waan aqaan liiska, qiimaha, saacadaha, munaabadaha — isku day!',back_shop:'← Dukaanka',login:'Soo gal',register:'Is diiwaan geli',logout:'Ka bax',track_order:'Raadi amarka',my_orders:'Dalbashadayda'}
};

/* ---------- seeds ---------- */
const SEED_MENU = [
 { id: 'esp', cat: 'Espresso', name: 'Espresso', price: 2.80, desc: 'Double ristretto blend.', seed: 'espresso-shot', tags: ['signature'], available: true },
 { id: 'mac', cat: 'Espresso', name: 'Macchiato', price: 3.20, desc: 'The Addis classic — espresso crowned with sweet steamed milk.', seed: 'macchiato-addis', tags: ['signature'], available: true },
 { id: 'fw', cat: 'Espresso', name: 'Flat White', price: 3.90, desc: 'Two shots, micro-foam.', seed: 'flat-white-art', tags: ['signature'], available: true },
 { id: 'cap', cat: 'Espresso', name: 'Cappuccino', price: 3.80, desc: 'Classic dry cap.', seed: 'cappuccino-foam', tags: [], available: true },
 { id: 'ame', cat: 'Espresso', name: 'Americano', price: 2.90, desc: 'Espresso lengthened with hot water.', seed: 'americano', tags: [], available: true },
 { id: 'lat', cat: 'Espresso', name: 'Caffè Latte', price: 4.20, desc: 'Espresso with silky steamed milk.', seed: 'caffe-latte', tags: [], available: true },
 { id: 'moc', cat: 'Espresso', name: 'Mocha', price: 4.60, desc: 'Espresso + dark chocolate + milk.', seed: 'mocha-chocolate', tags: [], available: true },
 { id: 'car', cat: 'Espresso', name: 'Caramel Latte', price: 4.80, desc: 'Latte with house caramel.', seed: 'caramel-latte', tags: ['new'], available: true },
 { id: 'van', cat: 'Espresso', name: 'Vanilla Latte', price: 4.80, desc: 'Latte with Madagascan vanilla.', seed: 'vanilla-latte', tags: ['new'], available: true },
 { id: 'ris', cat: 'Espresso', name: 'Ristretto', price: 3.00, desc: 'Short, intense espresso.', seed: 'ristretto', tags: [], available: true },
 { id: 'lon', cat: 'Espresso', name: 'Long Black', price: 3.10, desc: 'Water first, then espresso.', seed: 'long-black', tags: [], available: true },
 { id: 'gib', cat: 'Espresso', name: 'Gibraltar', price: 4.00, desc: 'Equal parts espresso & milk in a rocks glass.', seed: 'gibraltar', tags: [], available: true },
 { id: 'haz', cat: 'Espresso', name: 'Hazelnut Latte', price: 4.90, desc: 'Latte with roasted hazelnut.', seed: 'hazelnut-latte', tags: ['new'], available: true },
 { id: 'dop', cat: 'Espresso', name: 'Doppio', price: 3.20, desc: 'Double espresso, straight.', seed: 'doppio', tags: [], available: true },
 { id: 'hon', cat: 'Espresso', name: 'Honey Latte', price: 4.80, desc: 'Espresso, silky milk and Begemder honey.', seed: 'honey-latte', tags: ['new'], available: true },
 { id: 'aff', cat: 'Espresso', name: 'Affogato', price: 5.20, desc: 'Vanilla gelato drowned in espresso.', seed: 'affogato', tags: ['new'], available: true },
 { id: 'v60', cat: 'Filter', name: 'V60 · Ethiopia Guji', price: 5.40, desc: 'Apricot, bergamot, black tea.', seed: 'v60-pourover', tags: ['signature'], available: true },
 { id: 'chx', cat: 'Filter', name: 'Chemex · Colombia', price: 5.80, desc: 'Santa Rita lot — caramel, red apple.', seed: 'chemex-brew', tags: [], available: true },
 { id: 'jeb', cat: 'Filter', name: 'Buna · Jebena', price: 4.50, desc: 'Traditional ceremony brew + popcorn.', seed: 'jebena-buna', tags: ['signature'], available: true },
 { id: 'aer', cat: 'Filter', name: 'AeroPress · Kenya', price: 5.20, desc: 'Nyeri AA — blackcurrant, bright.', seed: 'aeropress', tags: [], available: true },
 { id: 'sip', cat: 'Filter', name: 'Siphon · Yirgacheffe', price: 6.00, desc: 'Theatrical siphon brew, floral.', seed: 'siphon', tags: ['new'], available: true },
 { id: 'bat', cat: 'Filter', name: 'Batch Brew', price: 3.20, desc: 'Today\'s roast on the MoccaMaster.', seed: 'batch-brew', tags: [], available: true },
 { id: 'yir', cat: 'Filter', name: 'Yirgacheffe Single', price: 5.60, desc: 'Floral, lemon, jasmine.', seed: 'yirgacheffe', tags: [], available: true },
 { id: 'sid', cat: 'Filter', name: 'Sidama Single', price: 5.60, desc: 'Stone fruit, honeyed body.', seed: 'sidama', tags: [], available: true },
 { id: 'har', cat: 'Filter', name: 'Harrar Single', price: 5.60, desc: 'Wild, blueberry, winey.', seed: 'harrar', tags: [], available: true },
 { id: 'lim', cat: 'Filter', name: 'Limu Single', price: 5.40, desc: 'Balanced, spiced, sweet.', seed: 'limu', tags: [], available: true },
 { id: 'gei', cat: 'Filter', name: 'Geisha · Rare', price: 7.00, desc: 'Limited lot — jasmine, peach.', seed: 'geisha', tags: ['new'], available: true },
 { id: 'cbt', cat: 'Cold', name: 'Cold Brew Tonic', price: 5.60, desc: '16-hour cold brew over tonic.', seed: 'cold-brew-tonic', tags: ['signature'], available: true },
 { id: 'imac', cat: 'Cold', name: 'Iced Macchiato', price: 4.00, desc: 'Layered espresso over cold milk.', seed: 'iced-macchiato', tags: ['new'], available: true },
 { id: 'ice', cat: 'Cold', name: 'Iced Americano', price: 3.60, desc: 'Espresso over ice & water.', seed: 'iced-americano', tags: [], available: true },
 { id: 'nit', cat: 'Cold', name: 'Nitro Cold Brew', price: 5.90, desc: 'Nitrogen-charged, creamy head.', seed: 'nitro', tags: ['new'], available: true },
 { id: 'fra', cat: 'Cold', name: 'Coffee Frappé', price: 5.20, desc: 'Blended iced coffee, frothy.', seed: 'frappe', tags: [], available: true },
 { id: 'imo', cat: 'Cold', name: 'Iced Mocha', price: 5.00, desc: 'Chocolate + espresso + cold milk.', seed: 'iced-mocha', tags: [], available: true },
 { id: 'eto', cat: 'Cold', name: 'Espresso Tonic', price: 5.40, desc: 'Espresso + tonic + orange.', seed: 'espresso-tonic', tags: [], available: true },
 { id: 'lem', cat: 'Cold', name: 'Lemon Espresso', price: 5.20, desc: 'Bright espresso over lemonade.', seed: 'lemon-espresso', tags: ['new'], available: true },
 { id: 'coc', cat: 'Cold', name: 'Coconut Cold Brew', price: 5.40, desc: 'Cold brew + coconut cream.', seed: 'coconut-coldbrew', tags: ['new'], available: true },
 { id: 'kar', cat: 'Bakes', name: 'Cardamom Bun', price: 4.20, desc: 'Knotted, buttery, spiced.', seed: 'cardamom-bun', tags: ['signature'], available: true },
 { id: 'sam', cat: 'Bakes', name: 'Sambusa', price: 2.50, desc: 'Crisp lentil pastry, baked.', seed: 'sambusa', tags: [], available: true },
 { id: 'che', cat: 'Bakes', name: 'Chechebsa', price: 3.80, desc: 'Flaky mitmita flatbread + butter.', seed: 'chechebsa', tags: [], available: true },
 { id: 'tef', cat: 'Bakes', name: 'Teff Muffin', price: 3.50, desc: 'Gluten-free teff & banana.', seed: 'teff-muffin', tags: ['gf'], available: true },
 { id: 'bas', cat: 'Bakes', name: 'Basque Cheesecake', price: 5.40, desc: 'Burnt top, molten centre.', seed: 'basque-cheesecake', tags: ['gf'], available: true },
 { id: 'cro', cat: 'Bakes', name: 'Butter Croissant', price: 3.60, desc: '27 layers, French butter.', seed: 'croissant', tags: [], available: true },
 { id: 'ban', cat: 'Bakes', name: 'Banana Bread', price: 3.90, desc: 'Dark, sticky, walnut.', seed: 'banana-bread', tags: [], available: true },
 { id: 'coo', cat: 'Bakes', name: 'Chocolate Cookie', price: 2.80, desc: 'Sea-salt chocolate chip.', seed: 'cookie', tags: [], available: true },
 { id: 'bro', cat: 'Bakes', name: 'Fudge Brownie', price: 4.20, desc: 'Dense, fudgy, 70% cocoa.', seed: 'brownie', tags: [], available: true },
 { id: 'tir', cat: 'Bakes', name: 'Tiramisu', price: 5.60, desc: 'Espresso-soaked, mascarpone.', seed: 'tiramisu', tags: ['new'], available: true },
 { id: 'cin', cat: 'Bakes', name: 'Cinnamon Roll', price: 4.00, desc: 'Glazed, gooey centre.', seed: 'cinnamon-roll', tags: [], available: true },
 { id: 'don', cat: 'Bakes', name: 'Glazed Donut', price: 3.20, desc: 'Light, airy, sweet glaze.', seed: 'donut', tags: [], available: true },
 { id: 'bag', cat: 'Bakes', name: 'Sesame Bagel', price: 3.80, desc: 'Boiled, baked, chewy.', seed: 'bagel', tags: [], available: true },
 { id: 'qui', cat: 'Bakes', name: 'Spinach Quiche', price: 4.80, desc: 'Buttery crust, savoury.', seed: 'quiche', tags: [], available: true },
];
const SEED_EVENTS = [
  { id: 'ev1', day: '14', mon: 'Aug · Fri', title: 'Open Cupping', desc: 'Taste six lots.', time: '17:00 · Old Harbor', seats: 4 },
  { id: 'ev2', day: '22', mon: 'Aug · Sat', title: 'Latte Art 101', desc: 'Milk science.', time: '10:30 · Riverside', seats: 2 },
];
const SEED_POSTS = [{ id: 'p1', title: 'Welcome to Moka House', body: 'We roast every Tuesday and pour all day.', author: 'erscomas', tags: ['news'], created: new Date().toISOString() }];
const SEED_KNOWLEDGE = [
  { id: 'k1', keywords: ['wifi', 'internet', 'password'], answer: 'Yes! Free WiFi — network "MokaHouse", password on the chalkboard.' },
  { id: 'k2', keywords: ['vegan', 'oat', 'almond', 'dairy'], answer: 'We have oat, almond and whole milk — no surcharge.' },
  { id: 'k3', keywords: ['decaf'], answer: 'We always run a decaf on the batch brew.' },
];
const SEED_REVIEWS = [
  { id: 'r1', name: 'Sara T.', rating: 5, text: 'Best flat white in the city. The ambiance is unmatched!', approved: true, created: new Date().toISOString() },
  { id: 'r2', name: 'Daniel B.', rating: 5, text: 'The Buna Jebena tastes like my grandmother\'s. I\'m a regular now.', approved: true, created: new Date().toISOString() },
  { id: 'r3', name: 'Hanna G.', rating: 4, text: 'Great cold brew tonic. Fast service, friendly staff.', approved: true, created: new Date().toISOString() },
];

/* ---------- db ---------- */
function load() {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch {
    return { orders: [], newsletter: [], menu: [], events: SEED_EVENTS, posts: SEED_POSTS, knowledge: SEED_KNOWLEDGE, reviews: SEED_REVIEWS, activity: [], sessions: [], users: [], transactions: [], wallet: { balance: 0, totalReceived: 0 } };
  }
}
const db = load();
function ensureCatalog() { SEED_MENU.forEach(it => { if (!db.menu.some(m => m.id === it.id)) db.menu.push(it); }); }
function ensureSeedUsers() {
  if (!db.users.some(u => u.user === ADMIN_USER)) db.users.push({ user: ADMIN_USER, hash: sha(ADMIN_PASS), role: 'admin', provider: 'password', permissions: null, created: new Date().toISOString() });
  for (let i = 1; i <= MOD_COUNT; i++) { const name = 'moderator' + i; if (!db.users.some(u => u.user === name)) db.users.push({ user: name, hash: sha(MOD_PASS), role: 'moderator', provider: 'password', permissions: { ...DEFAULT_MOD_PERMS }, created: new Date().toISOString() }); }
  db.posts = db.posts && db.posts.length ? db.posts : SEED_POSTS;
  db.knowledge = db.knowledge && db.knowledge.length ? db.knowledge : SEED_KNOWLEDGE;
  db.events = db.events && db.events.length ? db.events : SEED_EVENTS;
  db.reviews = db.reviews && db.reviews.length ? db.reviews : SEED_REVIEWS;
  db.transactions = db.transactions || []; db.wallet = db.wallet || { balance: 0, totalReceived: 0 };
  db.sessions = db.sessions || []; db.orders = db.orders || []; db.newsletter = db.newsletter || []; db.activity = db.activity || [];
  db.settings = db.settings || { payments: { telebirr: '+251976021007', mpesa: '+251973011231', paypal: 'amareermias@gmail.com', bank: '', crypto: '' } };
  db.settings.payments = db.settings.payments || {};
  db.analytics = db.analytics || { views: {}, daily: {}, referrers: {} };
  db.codes = db.codes || [];
  db.subscriptions = db.subscriptions || [];
  ensureCatalog();
}
ensureSeedUsers();
const log = msg => { db.activity.unshift({ t: new Date().toISOString(), msg }); db.activity = db.activity.slice(0, 60); };

/* ---------- 🗄️ Supabase ---------- */
let pushTimer = null;
function pushRemote() {
  if (!sbEnabled) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/moka_db`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{ id: 1, data: db, updated: new Date().toISOString() }])
      });
    } catch {}
  }, 1500);
}
function save() {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch {}
  pushRemote();
}
let hydrated = false;
const hydratePromise = (async () => {
  if (sbEnabled) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/moka_db?id=eq.1&select=data`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      if (r.ok) {
        const rows = await r.json();
        if (rows && rows[0] && rows[0].data && Array.isArray(rows[0].data.users)) Object.assign(db, rows[0].data);
      }
    } catch {}
  }
  ensureSeedUsers(); ensureCatalog();
  pushRemote();
  hydrated = true;
})();
save();

/* ---------- auth middleware ---------- */
const getUser = req => {
  const s = getSession(req);
  if (s) { const u = db.users.find(u => u.user === s.user); if (u) return u; }
  const a = getAcctCookie(req);
  if (a) return { user: a.user, role: a.role || 'customer', provider: a.provider || 'password', email: a.email || null, name: a.name || null, permissions: null };
  return null;
};
const isLoggedIn = req => !!getUser(req);
const requireLogin = (req, res, next) => isLoggedIn(req) ? next() : res.status(401).json({ error: 'Not authenticated' });
const requireAdmin = (req, res, next) => { const u = getUser(req); (u && u.role === 'admin') ? next() : res.status(403).json({ error: 'Admins only' }); };
function requirePerm(perm) {
  return (req, res, next) => {
    const u = getUser(req);
    if (!u) return res.status(401).json({ error: 'Not authenticated' });
    if (u.role === 'admin') return next();
    if (u.role === 'moderator' && u.permissions && u.permissions[perm]) return next();
    if (u.role === 'staff' && perm === 'can_orders') return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

/* ---------- 🛡️ Security AI ---------- */
const SEC = { ipHits: new Map(), events: [] };
const ATTACK_PATTERNS = [
  /(<script|javascript:|onerror\s*=|onload\s*=)/i,
  /(union\s+select|drop\s+table|insert\s+into|delete\s+from|'\s*or\s*'?\d*'?\s*=\s*'?\d)/i,
  /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,
  /(etc\/passwd|\/proc\/self|cmd\.exe|powershell|\/bin\/sh)/i,
  /(\$\{.*\}|<%.*%>|\{\{.*\}\})/,
];
function secLog(type, ip, detail) {
  SEC.events.unshift({ t: new Date().toISOString(), type, ip, detail });
  SEC.events = SEC.events.slice(0, 100);
  log(`🛡️ ${type} ${ip}: ${detail}`);
}
function isBlocked(ip) {
  const r = SEC.ipHits.get(ip);
  return !!(r && r.blocked && Date.now() < r.blockedUntil);
}
function hit(ip, reason) {
  const now = Date.now();
  let r = SEC.ipHits.get(ip);
  if (!r || now - r.start > 60 * 1000) r = { count: 0, start: now, blocked: false, blockedUntil: 0 };
  r.count++;
  if (reason) { r.blocked = true; r.blockedUntil = now + 30 * 60 * 1000; secLog('BLOCK', ip, reason); }
  else if (r.count > 200) { r.blocked = true; r.blockedUntil = now + 10 * 60 * 1000; secLog('RATE-BLOCK', ip, r.count + ' req/min'); }
  SEC.ipHits.set(ip, r);
}
function securityAI(req, res, next) {
  const ip = req.ip || 'anon';
  if (isBlocked(ip)) return res.status(403).json({ error: 'Blocked by security AI' });
  const url = req.originalUrl || '';
  const bodyStr = (req.body && typeof req.body === 'object') ? JSON.stringify(req.body) : String(req.body || '');
  const hay = url + ' ' + bodyStr;
  for (const p of ATTACK_PATTERNS) {
    if (p.test(hay)) { hit(ip, 'attack: ' + p.source.slice(0, 24)); return res.status(403).json({ error: 'Blocked by security AI' }); }
  }
  hit(ip, null);
  next();
}

/* ---------- 🤖 bot ---------- */
const BOT_EXTRA = {
en:{register:'To create an account: open Register and fill name, email, phone & password — or use "Sign up with Google".',login:'Log in with your username or email + password, or continue with Google.',wallet:'We accept Telebirr, M-Pesa, PayPal, cards, bank transfer and crypto.',stamps:'Stamp card: one stamp per drink — buy 7, the 8th is free.',new:'Latest news: ',langs:'The site speaks 8 languages — switch anytime from the top-right.',delivery:'We don\'t deliver yet — pick up at any of our three shops.'},
am:{register:'መለያ ለመፍር፦ Register ገጽ ላይ ስም፣ ኢሜይል፣ ልክ እና የይለፍ ቃል ላ — ወይም "በGoogle ተመዝገ"።',login:'በተጠሚ ስም ወይም ኢሜይል + የይለፍ ቃል ግባ — ወይም በGoogle።',wallet:'ቴሌ ብር፣ ኤም-ፔሳ PayPal፣ ካርድ፣ ባンክ እና ክሪቶ እንበላለን።',stamps:'ስታምፕ ካርድ፦ በእያንዳንዱ መጠጥ አንድ ስምፕ — 7 ገዝተህ 8ኛው ነፃ።',new:'አዲስ ዜና፦ ',langs:'ሳይቱ በ8 ቋንዎች ይናገራል — ከላይ ቀኝ መቀየር ትችላለህ።',delivery:'እስካሁን አናደርስም — በሦስቱም ሱቆቻችን ተከብ።'},
ar:{register:'لإنشاء حساب: افتح التسجيل واملأ الاسم والبريد والهاتف وكلمة المرور — أو عبر Google.',login:'ادخل باسم المستخدم أو البريد + كلمة المرور، أو عبر Google.',wallet:'نقبل تيلي بير، إم-بيسا، باي بال، البطاقات، البنك والعملات المشفرة.',stamps:'بطاقة الختم: ختم لكل مشروب — اشترِ 7 والثامنة مجانية.',new:'آخر الأخبار: ',langs:'الموقع يتحدث 8 لغات — بدّلها من الأعلى.',delivery:'لا توصيل بعد — استلم من فروعنا الثلاثة.'},
fr:{register:'Pour créer un compte : page Register — nom, e-mail, téléphone, mot de passe — ou via Google.',login:'Connectez-vous avec nom/e-mail + mot de passe, ou via Google.',wallet:'Nous acceptons Telebirr, M-Pesa, PayPal, cartes, banque et crypto.',stamps:'Carte : un tampon par boisson — 7 achats, le 8e offert.',new:'Dernières nouvelles : ',langs:'Le site parle 8 langues — changez en haut à droite.',delivery:'Pas de livraison — retrait dans nos trois boutiques.'},
es:{register:'Para crear una cuenta: en Register escribe nombre, correo, teléfono y contraseña — o usa Google.',login:'Entra con usuario o correo + contraseña, o con Google.',wallet:'Aceptamos Telebirr, M-Pesa, PayPal, tarjetas, banco y cripto.',stamps:'Tarjeta: un sello por bebida — compra 7, la 8ª gratis.',new:'Últimas noticias: ',langs:'El sitio habla 8 idiomas — cámbialo arriba.',delivery:'Aún no entregamos — recoge en nuestras tres tiendas.'},
om:{register:'Herrega uumuuf: Register irratti maqaa, imeelii, bilbila fi jecha darbii guuti — ykn Google fayyadami.',login:'Maqaa ykn imeelii + jecha darbiin seeni, ykn Google.',wallet:'Telebirr, M-Pesa, PayPal, kaardii, baankii fi crypto fudhanna.',stamps:'Kaardii: dhugaata tokkoon stampii — 7 bitadhu 8ffaan bilisaa.',new:'Oduu haaraa: ',langs:'Siteen afaan 8 dubbata — ol mirgaan jijjiiri.',delivery:'Hin geenyu — suuqiiwwan keenya saddetti fudhadhu.'},
ti:{register:'ሕሳ ንምጣር ኣብ Register ም፡ ኢመይል፡ ስልክን ፓስዎርድን መላእ — ወይ ብGoogle።',login:'ብስም ወይ ኢመይል + ፓስዎርድ እቶ፡ ወይ ብGoogle',wallet:'Telebirr, M-Pesa, PayPal, ካርድ, ባンክን ክሪቶን ቕበል',stamps:'ካርዲ፡ ንነፍሲ ወከፍ መስተ ሓንቲ ስታምፕ — 7 ግዛእ 8ይ ነ።',new:'ድሽ ዜና፦ ',langs:'እቲ ሳይት 8 ቋንቋታት ይዛረብ — ካብ ላዕሊ ቀያይር።',delivery:'ኣየብጽን — ኣ ሰለስተ ኳናትና ቐበል'},
so:{register:'Xisaab samee: Register — magac, iimayl, telefoon, fur — ama Google.',login:'Ku gal magac ama iimayl + fur, ama Google.',wallet:'Waxaan aqbalnaa Telebirr, M-Pesa, PayPal, kaarar, bangi iyo crypto.',stamps:'Kaarka: shaabad cabitaan kasta — 7 iibso 8aad bilaash.',new:'Wararkii u dambeeyay: ',langs:'Siteku wuxuu ku hadlaa 8 luqadood — kor midig ka beddel.',delivery:'Weli ma keenno — saddexdayada dukaan ka qaado.'}
};
function findItem(t) {
  let best = null, bs = 0;
  for (const m of db.menu) {
    const words = m.name.toLowerCase().split(/[^a-z0-9·]+/).filter(w => w.length > 3);
    let s = 0;
    if (t.includes(m.name.toLowerCase().slice(0, 6))) s += 3;
    for (const w of words) if (t.includes(w)) s += 2;
    if (s > bs) { bs = s; best = m; }
  }
  return bs >= 2 ? best : null;
}
function searchContent(t, lang) {
  const d = I18N[lang] || I18N.en;
  const words = t.split(/[^a-z0-9\u1200-\u137F\u0600-\u06FF]+/).filter(w => w.length > 3);
  if (!words.length) return null;
  for (const p of db.posts) {
    const hay = (p.title + ' ' + p.body).toLowerCase();
    if (words.some(w => hay.includes(w))) return `📰 ${p.title} — ${p.body}`;
  }
  for (const e of db.events) {
    const hay = (e.title + ' ' + e.desc).toLowerCase();
    if (words.some(w => hay.includes(w))) return `🎟️ ${e.title} (${e.day} ${e.mon} · ${e.time}) — ${e.desc} · ${e.seats} ${d.seats || 'seats left'}`;
  }
  for (const m of db.menu) {
    const hay = (m.name + ' ' + m.desc).toLowerCase();
    if (words.some(w => hay.includes(w))) return `${m.name} — ${d.bot_price || 'costs'} $${m.price.toFixed(2)}. ${m.desc}`;
  }
  return null;
}
function botReply(raw, lang) {
  const d = I18N[lang] || I18N.en;
  const x = BOT_EXTRA[lang] || BOT_EXTRA.en;
  const t = String(raw || '').toLowerCase();
  for (const k of db.knowledge) { if (k.keywords.some(kw => t.includes(kw.toLowerCase()))) return k.answer; }
  if (/(hello|hi|hey|selam|ሰላም|bonjour|hola|salam|akkaam|salaan)/.test(t)) return d.chat_greet;
  if (/(hour|open|close|when|time|ሰዓት|ክፍት|saacad|horario|horaire)/.test(t)) return `${d.bot_hours}: ${HOURS_TEXT}`;
  if (/(where|location|address|find|shop|store|አድራሻ|ቦታ|bakka|meesha|dirección|adresse)/.test(t)) return `${d.bot_loc}: ${SHOPS_TEXT}`;
  if (/(register|signup|sign up|create|account|መመዝገብ|ተመዝገብ|መለያ|galmaa|diiwaan|registrar)/.test(t)) return x.register;
  if (/(login|log in|signin|sign in|ግባ|እቶ|soo gal|entrer)/.test(t)) return x.login;
  if (/(pay|payment|telebirr|mpesa|paypal|card|bank|crypto|ክፍያ|ቴሌ|bixinta|pago|paiement|wallet)/.test(t)) return `${d.bot_pay}: Telebirr (${db.settings.payments.telebirr || '—'}) · M-Pesa (${db.settings.payments.mpesa || '—'}) · PayPal · Bank · Crypto.`;
  if (/(language|translate|ቋን|afaan|luqad|idioma|langue)/.test(t)) return x.langs;
  if (/(stamp|free|ነፃ|ብላሽ|bilaash|kaard|gratis)/.test(t)) return x.stamps;
  if (/(deliver|delivery|ship|አድርስ|geenyu)/.test(t)) return x.delivery;
  if (/(track|order status|ተከታተል|raadi)/.test(t)) return `${d.track_order}: /track.html`;
  if (/(gift|card|ስጦታ)/.test(t)) return '🎁 Gift cards: /gift.html — buy & redeem at checkout!';
  if (/(subscri|club|member|ክለብ|ስብስክ)/.test(t)) return '🔁 Coffee Club: /subscribe.html — fresh coffee every month!';
  if (/(review|star|rating|አስተያየት|ኮከ)/.test(t)) return '⭐ Leave a review on our homepage — we read every one!';
  if (/(friends|invite|referral|ጓደኛ)/.test(t)) return '🎁 Moka Friends: invite 3 friends → free drink! /friends.html';
  if (/(contact|phone|call|email|ስልክ|ተወከስ)/.test(t)) return `${d.bot_credit} ERMIAS AMARE — amareermias@gmail.com · +251 976 021 007 · +251 973 011 231`;
  if (/(event|cupping|workshop|tasting|ዝግጅት|munaabad|evento)/.test(t)) return db.events.length ? `${d.bot_events}: ` + db.events.map(e => `${e.title} (${e.day} ${e.mon})`).join(' · ') : d.bot_fallback;
  if (/(news|post|story|update|new|አዲስ|ዜና|war|noticia|nouveau)/.test(t)) {
    const hit = searchContent(t, lang);
    if (hit && hit.startsWith('📰')) return hit;
    return db.posts.length ? x.new + db.posts.slice(0, 3).map(p => `${p.title} — ${p.body}`).join(' ◆ ') : d.bot_fallback;
  }
  if (/(who|made|creator|ermias|ማን|የተሰራ|sameeyay|quién)/.test(t)) return `${d.bot_credit} ERMIAS AMARE — amareermias@gmail.com · +251 976 021 007 · +251 973 011 231`;
  if (/(brew|v60|chemex|aeropress|ratio|recipe|ማፍያ|qophii)/.test(t)) {
    if (t.includes('chemex')) return 'Chemex: 1:16 · 94°C · ~4:30 · medium-coarse.';
    if (t.includes('aeropress')) return 'AeroPress: 1:15 · 90°C · ~2:30 · medium-fine.';
    if (t.includes('press') && !t.includes('espresso')) return 'French Press: 1:14 · 96°C · 4:00+1 rest · coarse.';
    if (t.includes('espresso')) return 'Espresso: 1:2 · 93°C · ~0:30 · fine.';
    return `${d.bot_brew}: V60 1:16 · 94°C · ~3:15 · medium-fine.`;
  }
  if (/(menu|all|everything|list|ሜኑ|ሁሉ|liiska|lista|carte)/.test(t)) return `${d.bot_menu}: ` + db.menu.filter(m => m.available).map(m => m.name).join(', ');
  if (/(recommend|best|favorite|suggest|ምክር)/.test(t)) { const s = db.menu.filter(m => m.tags.includes('signature')); return s.length ? `★ ${s.map(m => m.name).join(' · ')}` : d.bot_fallback; }
  const item = findItem(t);
  if (item) return `${item.name} — ${d.bot_price} $${item.price.toFixed(2)}. ${item.desc}`;
  const live = searchContent(t, lang);
  if (live) return live;
  if (/(price|cost|how much|ዋጋ|qiimo|precio|prix)/.test(t)) return db.menu.slice(0, 5).map(m => `${m.name} $${m.price.toFixed(2)}`).join(' · ');
  return d.bot_fallback;
}

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); next(); });
app.use((req, res, next) => { if (hydrated) return next(); hydratePromise.then(() => next()).catch(() => next()); });
app.use(securityAI);
app.use('/admin.html', (req, res, next) => isLoggedIn(req) ? next() : res.redirect('/login.html'));

app.get('/api/i18n/:lang', (req, res) => res.json(I18N[req.params.lang] || I18N.en));
app.get('/api/i18n', (req, res) => res.json(Object.keys(I18N)));

/* ===== injected floats + beacon ===== */
const CREDIT_HTML = `
<div style="display:flex;gap:1.2rem;flex-wrap:wrap;justify-content:center;align-items:center;padding:1.1rem 1rem 1.5rem;font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.1em;color:#93866f;border-top:1px solid rgba(241,230,212,.12);margin-top:2.5rem;text-align:center">
  <span data-i18n="bot_credit">Built by</span>&nbsp;<b style="color:#d98e32">ERMIAS AMARE</b>
  <a href="mailto:amareermias@gmail.com" style="color:inherit;text-decoration:none;border-bottom:1px dashed #93866f">amareermias@gmail.com</a>
  <a href="tel:+251976021007" style="color:inherit;text-decoration:none;border-bottom:1px dashed #93866f">+251 976 021 007</a>
  <a href="tel:+251973011231" style="color:inherit;text-decoration:none;border-bottom:1px dashed #93866f">+251 973 011 231</a>
</div>`;
const TRACK_FLOAT = `<a href="/track.html" style="position:fixed;bottom:24px;left:92px;z-index:160;background:#221a15;border:1.5px solid rgba(217,142,50,.6);color:#e8b56b;border-radius:100px;padding:.7em 1.2em;font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.1em;text-decoration:none;box-shadow:0 10px 30px -8px rgba(0,0,0,.6)"><span data-i18n="track_order">Track order</span> 📦</a>`;
const SHARE_FLOAT = `
<div style="position:fixed;bottom:96px;right:24px;z-index:160;display:flex;flex-direction:column;align-items:flex-end;gap:.4rem">
  <div id="mokaShareMenu" style="display:none;flex-direction:column;gap:.4rem;align-items:flex-end">
    <a id="msWa" target="_blank" rel="noopener" style="background:#25D366;color:#0b3d2e;border-radius:100px;padding:.55em 1.1em;font-family:'Space Mono',monospace;font-size:.66rem;text-decoration:none;font-weight:700">WhatsApp</a>
    <a id="msTg" target="_blank" rel="noopener" style="background:#229ED9;color:#fff;border-radius:100px;padding:.55em 1.1em;font-family:'Space Mono',monospace;font-size:.66rem;text-decoration:none;font-weight:700">Telegram</a>
    <a id="msFb" target="_blank" rel="noopener" style="background:#1877F2;color:#fff;border-radius:100px;padding:.55em 1.1em;font-family:'Space Mono',monospace;font-size:.66rem;text-decoration:none;font-weight:700">Facebook</a>
    <button id="msCp" style="background:#f1e6d4;color:#191008;border:none;border-radius:100px;padding:.55em 1.1em;font-family:'Space Mono',monospace;font-size:.66rem;font-weight:700;cursor:pointer">Copy link 🔗</button>
  </div>
  <button id="mokaShareBtn" aria-label="Share" style="width:52px;height:52px;border-radius:50%;background:#221a15;border:1.5px solid rgba(217,142,50,.6);color:#e8b56b;font-size:20px;cursor:pointer;box-shadow:0 10px 30px -8px rgba(0,0,0,.6)">↗</button>
</div>
<script>
(function(){
  var b=document.getElementById('mokaShareBtn'),m=document.getElementById('mokaShareMenu');
  if(!b||!m)return;
  b.addEventListener('click',function(){m.style.display=(m.style.display==='none')?'flex':'none';});
  var u=encodeURIComponent(location.href.split('?')[0]),t=encodeURIComponent('ERSCOMAS ☕ Roastery & Espresso Bar');
  var wa=document.getElementById('msWa');if(wa)wa.href='https://wa.me/?text='+t+'%20'+u;
  var tg=document.getElementById('msTg');if(tg)tg.href='https://t.me/share/url?url='+u+'&text='+t;
  var fb=document.getElementById('msFb');if(fb)fb.href='https://www.facebook.com/sharer/sharer.php?u='+u;
  var cp=document.getElementById('msCp');if(cp)cp.addEventListener('click',function(){try{navigator.clipboard.writeText(decodeURIComponent(u));cp.textContent='Copied ✓';}catch(e){}});
})();
</script>`;
const FRIENDS_FLOAT = `<a href="/friends.html" style="position:fixed;bottom:228px;left:24px;z-index:160;background:#8fa87e;color:#191008;border:none;border-radius:100px;padding:.7em 1.2em;font-family:'Space Mono',monospace;font-size:.68rem;font-weight:700;letter-spacing:.1em;text-decoration:none;box-shadow:0 10px 30px -8px rgba(0,0,0,.6)">🎁 Friends</a>`;
const ANALYTICS_BEACON = `<script>
(function(){
  try{
    var p=location.pathname||'/';
    var r='';try{r=document.referrer?new URL(document.referrer).hostname:'';}catch(e){}
    var body=JSON.stringify({page:p,referrer:r});
    if(navigator.sendBeacon){navigator.sendBeacon('/api/track-view',new Blob([body],{type:'application/json'}));}
    else{fetch('/api/track-view',{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){});}
  }catch(e){}
})();
</script>`;

const HTML_PAGES = { '/': 'index.html', '/index.html': 'index.html', '/login.html': 'login.html', '/register.html': 'register.html', '/admin.html': 'admin.html', '/track.html': 'track.html', '/quiz.html': 'quiz.html', '/story.html': 'story.html', '/friends.html': 'friends.html', '/terms.html': 'terms.html', '/wholesale.html': 'wholesale.html', '/gift.html': 'gift.html', '/subscribe.html': 'subscribe.html' };
app.get(Object.keys(HTML_PAGES), (req, res, next) => {
  const file = path.join(__dirname, 'public', HTML_PAGES[req.path]);
  fs.readFile(file, 'utf8', (err, html) => {
    if (err) return next();
    const injection = `<script src="/fx.js"></script><script>window.__I18N = ${JSON.stringify(I18N)};</script>${ANALYTICS_BEACON}${TRACK_FLOAT}${SHARE_FLOAT}${FRIENDS_FLOAT}${CREDIT_HTML}`;
    res.type('html').send(html.includes('</body>') ? html.replace('</body>', injection + '</body>') : html + injection);
  });
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/debug/auth', (req, res) => res.json({ googleEnabled, env: NODE_ENV, users: db.users.length, sessions: db.sessions.length, wallet: db.wallet, txCount: db.transactions.length, supabase: sbEnabled }));

/* ================= 📊 Analytics ================= */
app.post('/api/track-view', (req, res) => {
  const { page, referrer } = req.body || {};
  const pg = String(page || '/').slice(0, 60);
  const day = new Date().toISOString().slice(0, 10);
  db.analytics = db.analytics || { views: {}, daily: {}, referrers: {} };
  db.analytics.views[pg] = (db.analytics.views[pg] || 0) + 1;
  db.analytics.daily[day] = (db.analytics.daily[day] || 0) + 1;
  if (referrer) { const rf = String(referrer).slice(0, 80); db.analytics.referrers[rf] = (db.analytics.referrers[rf] || 0) + 1; }
  save();
  res.json({ ok: true });
});
app.get('/api/analytics', requireAdmin, (req, res) => {
  const a = db.analytics || { views: {}, daily: {}, referrers: {} };
  const sortObj = o => Object.entries(o || {}).sort((x, y) => y[1] - x[1]);
  res.json({
    views: sortObj(a.views).slice(0, 20),
    daily: sortObj(a.daily).slice(0, 14),
    referrers: sortObj(a.referrers).slice(0, 10),
    totalViews: Object.values(a.views || {}).reduce((s, v) => s + v, 0)
  });
});

/* ================= 🛡️ Security endpoints ================= */
app.get('/api/security', requireAdmin, (req, res) => {
  const now = Date.now();
  res.json({
    blocked: [...SEC.ipHits.entries()].filter(([ip, r]) => r.blocked && now < r.blockedUntil).map(([ip, r]) => ({ ip, until: r.blockedUntil })),
    events: SEC.events.slice(0, 50),
  });
});
app.post('/api/security/unblock', requireAdmin, (req, res) => {
  const { ip } = req.body || {};
  SEC.ipHits.delete(ip);
  log(`🛡️ Unblocked ${ip}`); save();
  res.json({ ok: true });
});

/* ================= ⭐ Reviews ================= */
app.get('/api/reviews', (req, res) => res.json((db.reviews || []).filter(r => r.approved)));
app.post('/api/reviews', regLimiter, (req, res) => {
  const { name, rating, text } = req.body || {};
  if (!name || !text) return res.status(400).json({ error: 'Name and review required' });
  db.reviews = db.reviews || [];
  db.reviews.unshift({ id: 'r' + Date.now(), name: String(name).slice(0, 60), rating: Math.max(1, Math.min(5, Math.round(Number(rating) || 5))), text: String(text).slice(0, 500), approved: false, created: new Date().toISOString() });
  log(`⭐ New review from ${name} (pending)`); save();
  res.status(201).json({ ok: true, pending: true });
});
app.get('/api/reviews/all', requireAdmin, (req, res) => res.json(db.reviews || []));
app.post('/api/reviews/:id/approve', requireAdmin, (req, res) => {
  const r = (db.reviews || []).find(r => r.id === req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
  r.approved = true; log(`✅ Approved review ${r.id}`); save(); res.json({ ok: true });
});
app.delete('/api/reviews/:id', requireAdmin, (req, res) => {
  const i = (db.reviews || []).findIndex(r => r.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'Not found' });
  db.reviews.splice(i, 1); save(); res.json({ ok: true });
});

/* ================= 🔁 Subscriptions ================= */
app.post('/api/subscribe', regLimiter, (req, res) => {
  const { name, email, plan } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  db.subscriptions = db.subscriptions || [];
  db.subscriptions.unshift({ id: 's' + Date.now(), name: String(name).slice(0, 60), email: String(email).slice(0, 120), plan: String(plan || 'Roast Club'), status: 'pending', created: new Date().toISOString() });
  log(`🔁 New subscription — ${name} (${plan})`); save();
  res.status(201).json({ ok: true });
});
app.get('/api/subscriptions', requireAdmin, (req, res) => res.json(db.subscriptions || []));
app.post('/api/subscriptions/:id/confirm', requireAdmin, (req, res) => {
  const s = (db.subscriptions || []).find(s => s.id === req.params.id); if (!s) return res.status(404).json({ error: 'Not found' });
  s.status = 'active'; log(`✅ Active subscription ${s.id}`); save(); res.json({ ok: true });
});

/* ================= 🎁 Gift cards ================= */
app.post('/api/giftcard/buy', payLimiter, (req, res) => {
  const { amount, method, buyer } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 1) return res.status(400).json({ error: 'Invalid amount' });
  if (!PAYMENT_METHODS.includes(method)) return res.status(400).json({ error: 'Invalid method' });
  const code = 'GIFT-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const txId = 'TX-' + Date.now().toString(36).toUpperCase();
  db.codes = db.codes || [];
  db.codes.push({ code, value: amt, used: false, created: new Date().toISOString() });
  db.transactions.unshift({ id: txId, orderNo: code, method, amount: amt, status: 'pending', details: { type: 'giftcard', buyer: buyer || '' }, created: new Date().toISOString() });
  log(`🎁 Gift card ${code} ($${amt}) pending`); save();
  res.status(201).json({ ok: true, code });
});
app.post('/api/giftcard/redeem', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const c = (db.codes || []).find(c => c.code === code);
  if (!c) return res.status(404).json({ error: 'Invalid code' });
  if (c.used) return res.status(409).json({ error: 'Already used' });
  res.json({ ok: true, value: c.value });
});

/* ================= 🔑 Forgot password ================= */
app.post('/api/forgot/reset', authLimiter, (req, res) => {
  const { user, email, phone, newpass } = req.body || {};
  if (typeof newpass !== 'string' || newpass.length < 6) return res.status(400).json({ error: 'Password ≥ 6 chars' });
  const em = String(email || '').trim().toLowerCase();
  const ph = String(phone || '').replace(/\s/g, '');
  const uname = String(user || '').trim().toLowerCase();
  const u = db.users.find(x => x.user === uname || (x.email && x.email === em));
  if (!u) return res.status(404).json({ error: 'Account not found' });
  if (u.email && em && u.email !== em) return res.status(403).json({ error: 'Details do not match' });
  if (u.phone && ph && u.phone !== ph) return res.status(403).json({ error: 'Details do not match' });
  if (!u.email && !u.phone) return res.status(403).json({ error: 'No recovery info — contact the owner' });
  u.hash = sha(newpass);
  log(`🔑 Password reset — ${u.user}`); save();
  res.json({ ok: true });
});

/* ================= 📦 tracking ================= */
app.get('/api/track/:no', (req, res) => {
  const no = String(req.params.no || '').trim().toUpperCase();
  const o = db.orders.find(o => o.no === no);
  if (!o) return res.status(404).json({ error: 'Not found' });
  res.json({ no: o.no, status: o.status, pickup: o.pickup, created: o.created, subtotal: o.subtotal, items: o.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })) });
});

/* ================= 👤 My Orders ================= */
app.get('/api/my/orders', requireLogin, (req, res) => {
  const me = getUser(req);
  const mine = db.orders.filter(o => o.user === me.user || (me.email && o.email === me.email));
  res.json(mine.map(o => ({ no: o.no, status: o.status, pickup: o.pickup, created: o.created, subtotal: o.subtotal, items: o.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })) })));
});

/* ================= 💳 payment destinations ================= */
app.get('/api/payments-info', (req, res) => res.json(db.settings.payments || {}));
app.patch('/api/settings/payments', requireAdmin, (req, res) => {
  const p = req.body || {};
  db.settings = db.settings || { payments: {} };
  ['telebirr', 'mpesa', 'paypal', 'bank', 'crypto'].forEach(k => { if (typeof p[k] === 'string') db.settings.payments[k] = p[k].slice(0, 120); });
  log('Payment destinations updated'); save();
  res.json(db.settings.payments);
});

/* ================= AUTH ================= */
app.get('/api/auth/google-config', (req, res) => res.json({ enabled: googleEnabled, clientId: googleEnabled ? GOOGLE_CLIENT_ID : null }));
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing credential' });
  if (!googleEnabled) return res.status(503).json({ error: 'Google not configured' });
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) return res.status(401).json({ error: 'Google token invalid' });
    const c = await r.json();
    if (c.aud !== GOOGLE_CLIENT_ID) return res.status(401).json({ error: 'Client ID mismatch' });
    if (!c.email || c.email_verified !== 'true') return res.status(401).json({ error: 'Email not verified' });
    let acct = db.users.find(u => u.googleId === c.sub);
    if (!acct) {
      let base = String(c.email).split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0, 20);
      if (base.length < 3) base = (base + '___').slice(0, 3);
      let uname = base; if (db.users.some(u => u.user === uname)) uname = base.slice(0, 15) + '_' + String(c.sub).slice(-4);
      acct = { user: uname, hash: null, role: 'customer', provider: 'google', googleId: String(c.sub), email: c.email, name: c.name || uname, permissions: null, created: new Date().toISOString() };
      db.users.push(acct); log(`Google signup — ${uname}`);
    } else log(`Google login — ${acct.user}`);
    startSession(res, acct.user); save();
    res.json({ ok: true, user: acct.user, role: acct.role });
  } catch { log('Google verify failed'); save(); res.status(500).json({ error: 'Server could not reach Google' }); }
});

app.post('/api/admin/register', regLimiter, (req, res) => {
  const { user, pass, name, email, phone, gender } = req.body || {};
  if (typeof pass !== 'string' || pass.length < 6) return res.status(400).json({ error: 'Password ≥ 6 chars' });
  const nm = String(name || '').trim().slice(0, 60);
  if (nm.length < 2) return res.status(400).json({ error: 'Name required' });
  const em = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ error: 'Invalid email' });
  if (db.users.some(u => u.email === em)) return res.status(409).json({ error: 'Email already registered' });
  const ph = String(phone || '').replace(/\s/g, '');
  if (ph && !/^\+?[0-9]{7,15}$/.test(ph)) return res.status(400).json({ error: 'Invalid phone' });
  let uname = String(user || '').trim().toLowerCase();
  if (!uname) {
    let base = em.split('@')[0].replace(/[^a-z0-9_.-]/g, '_').slice(0, 20);
    if (base.length < 3) base = (base + '___').slice(0, 3);
    uname = base; let n = 0;
    while (db.users.some(u => u.user === uname)) { n++; uname = base.slice(0, 15) + '_' + n; }
  }
  if (!validUserName(uname)) return res.status(400).json({ error: 'Username: 3–20 letters/numbers/_ . -' });
  if (db.users.some(u => u.user === uname)) return res.status(409).json({ error: 'Username taken' });
  const hash = sha(pass);
  db.users.push({ user: uname, hash, role: 'customer', provider: 'password', name: nm, email: em, phone: ph || null, gender: String(gender || '').slice(0, 10) || null, permissions: null, created: new Date().toISOString() });
  log(`New customer — ${uname} (${nm} · ${em} · ${ph || 'no phone'})`);
  const prod = NODE_ENV === 'production';
  const acctCookie = signToken({ user: uname, email: em, hash, name: nm, role: 'customer', provider: 'password', exp: Date.now() + 30 * 24 * 3600 * 1000 });
  res.setHeader('Set-Cookie', [
    `moka_admin=${signToken({ user: uname, exp: Date.now() + SESSION_TTL })}; Path=/; HttpOnly; SameSite=${prod ? 'None' : 'Lax'}; ${prod ? 'Secure; ' : ''}Max-Age=${SESSION_TTL / 1000}`,
    `moka_acct=${acctCookie}; Path=/; HttpOnly; SameSite=${prod ? 'None' : 'Lax'}; ${prod ? 'Secure; ' : ''}Max-Age=${30 * 24 * 3600}`
  ]);
  save();
  res.status(201).json({ ok: true, user: uname, role: 'customer' });
});

app.post('/api/admin/login', authLimiter, (req, res) => {
  const { user, pass } = req.body || {}; const uname = String(user || '').trim().toLowerCase();
  let acct = db.users.find(u => u.user === uname || (u.email && u.email === uname));
  if (!acct && typeof pass === 'string') {
    const a = getAcctCookie(req);
    if (a && (a.user === uname || (a.email && a.email === uname)) && safeEq(sha(pass), a.hash)) {
      acct = { user: a.user, hash: a.hash, role: a.role || 'customer', email: a.email, name: a.name };
      if (!db.users.some(u => u.user === a.user)) { db.users.push({ user: a.user, hash: a.hash, role: a.role || 'customer', provider: a.provider || 'password', email: a.email || null, name: a.name || null, permissions: null, created: new Date().toISOString() }); save(); }
    }
  }
  const ok = acct && acct.hash && typeof pass === 'string' && safeEq(sha(pass), acct.hash);
  if (ok) { log(`Logged in — ${acct.user}`); startSession(res, acct.user); return res.json({ ok: true, user: acct.user, role: acct.role }); }
  log('Failed login — ' + (uname || '?')); save();
  res.status(401).json({ error: 'Wrong username or password' });
});
app.post('/api/admin/logout', (req, res) => { res.setHeader('Set-Cookie', 'moka_admin=; Path=/; HttpOnly; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/admin/check', (req, res) => isLoggedIn(req) ? res.json({ ok: true }) : res.status(401).json({ error: 'Not authenticated' }));
app.get('/api/admin/whoami', requireLogin, (req, res) => { const u = getUser(req); res.json({ user: u.user, role: u.role, permissions: u.permissions || null, email: u.email || null }); });

/* ================= USERS ================= */
app.get('/api/users', requireLogin, (req, res) => {
  const me = getUser(req);
  if (me.role !== 'admin') return res.json(db.users.map(u => ({ user: u.user, role: u.role })));
  res.json(db.users.map(u => ({ user: u.user, role: u.role, provider: u.provider || 'password', email: u.email || null, phone: u.phone || null, name: u.name || null, permissions: u.permissions || null, created: u.created, sessions: 0 })));
});
app.delete('/api/users/:name', requireAdmin, (req, res) => {
  const me = getUser(req).user, target = String(req.params.name).toLowerCase();
  if (me === target) return res.status(400).json({ error: "Can't delete yourself" });
  const i = db.users.findIndex(u => u.user === target); if (i < 0) return res.status(404).json({ error: 'Not found' });
  db.users.splice(i, 1);
  log(`Admin ${me} deleted ${target}`); save(); res.json({ ok: true });
});
app.patch('/api/users/:name/role', requireAdmin, (req, res) => {
  const me = getUser(req).user, target = String(req.params.name).toLowerCase(); const { role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Bad role' });
  const u = db.users.find(u => u.user === target); if (!u) return res.status(404).json({ error: 'Not found' });
  if (me === target && u.role !== role) return res.status(400).json({ error: "Can't change own role" });
  const admins = db.users.filter(x => x.role === 'admin').length;
  if (u.role === 'admin' && role !== 'admin' && admins <= 1) return res.status(400).json({ error: "Can't remove the last admin" });
  u.role = role;
  if (role === 'moderator' && !u.permissions) u.permissions = { ...DEFAULT_MOD_PERMS };
  if (role !== 'moderator') u.permissions = null;
  log(`Admin ${me} set ${target} → ${role}`); save(); res.json({ ok: true, user: u.user, role: u.role });
});
app.patch('/api/users/:name/permissions', requireAdmin, (req, res) => {
  const target = String(req.params.name).toLowerCase(); const { permissions } = req.body || {};
  const u = db.users.find(u => u.user === target); if (!u) return res.status(404).json({ error: 'Not found' });
  if (u.role !== 'moderator') return res.status(400).json({ error: 'Only moderators have permissions' });
  u.permissions = u.permissions || {};
  PERMS.forEach(p => { if (typeof permissions?.[p] === 'boolean') u.permissions[p] = permissions[p]; });
  log(`Admin set permissions for ${target}`); save(); res.json({ ok: true, user: u.user, permissions: u.permissions });
});
app.post('/api/users/:name/logout', requireAdmin, (req, res) => {
  const target = String(req.params.name).toLowerCase();
  if (!db.users.some(u => u.user === target)) return res.status(404).json({ error: 'Not found' });
  log(`Admin kicked ${target} (sessions expire naturally)`); save(); res.json({ ok: true, killed: 0 });
});

/* ================= 💰 WALLET ================= */
app.post('/api/wallet/pay', payLimiter, (req, res) => {
  const { items, pickup, method, details } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Empty tray' });
  if (!PAYMENT_METHODS.includes(method)) return res.status(400).json({ error: 'Invalid payment method' });
  const me = getUser(req);
  const lines = [];
  for (const { id, qty } of items) {
    const m = db.menu.find(x => x.id === id);
    if (!m) return res.status(400).json({ error: 'Unknown item' });
    if (m.available === false) return res.status(409).json({ error: `${m.name} sold out` });
    lines.push({ id: m.id, name: m.name, price: m.price, qty: Math.max(1, Math.min(20, Math.trunc(qty) || 0)) });
  }
  const gross = lines.reduce((s, l) => s + l.price * l.qty, 0);
  let discount = 0; const gcode = String(req.body?.code || '').trim().toUpperCase();
  if (gcode) { const c = (db.codes || []).find(c => c.code === gcode && !c.used); if (c) { discount = Math.min(c.value, gross); c.used = true; } }
  const subtotal = Math.max(0, gross - discount);
  setTimeout(() => {
    const txId = 'TX-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    let orderNo; do { orderNo = 'MH-' + (1000 + Math.floor(Math.random() * 9000)); } while (db.orders.some(o => o.no === orderNo));
    const manual = method !== 'card';
    const tx = { id: txId, orderNo, method, amount: subtotal, status: manual ? 'pending' : 'completed', details: details || {}, created: new Date().toISOString() };
    const order = { no: orderNo, items: lines, subtotal, pickup: pickup || 'ASAP', status: 'queued', created: new Date().toISOString(), txId,
      user: me ? me.user : null, email: me ? (me.email || null) : null };
    db.transactions.unshift(tx); db.orders.unshift(order);
    if (!manual) { db.wallet.balance += subtotal; db.wallet.totalReceived += subtotal; }
    log(`Payment $${subtotal.toFixed(2)} via ${method} (${tx.status}) — ${txId}`); save();
    res.status(201).json({ ok: true, order, tx, payTo: (db.settings.payments || {})[method] || null, discount });
  }, 800);
});
app.post('/api/wallet/confirm/:txId', requireAdmin, (req, res) => {
  const tx = db.transactions.find(t => t.id === req.params.txId);
  if (!tx) return res.status(404).json({ error: 'Not found' });
  if (tx.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  tx.status = 'completed'; tx.confirmed = new Date().toISOString(); tx.by = getUser(req).user;
  db.wallet.balance += tx.amount; db.wallet.totalReceived += tx.amount;
  log(`✅ Confirmed ${tx.id} ($${tx.amount.toFixed(2)})`); save();
  res.json({ ok: true });
});
app.post('/api/wallet/reject/:txId', requireAdmin, (req, res) => {
  const tx = db.transactions.find(t => t.id === req.params.txId);
  if (!tx) return res.status(404).json({ error: 'Not found' });
  if (tx.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  tx.status = 'rejected'; tx.by = getUser(req).user;
  const o = db.orders.find(o => o.txId === tx.id); if (o) o.status = 'cancelled';
  log(`❌ Rejected ${tx.id}`); save();
  res.json({ ok: true });
});
app.get('/api/wallet/balance', requirePerm('can_wallet'), (req, res) => res.json(db.wallet));
app.get('/api/wallet/transactions', requirePerm('can_wallet'), (req, res) => res.json(db.transactions.slice(0, Math.min(200, Math.max(1, parseInt(req.query.limit) || 50)))));
app.post('/api/wallet/transfer', requireAdmin, (req, res) => {
  const { destination, amount, reference } = req.body || {};
  const validDests = ['wallet', 'bank', 'crypto', 'paypal', 'telebirr', 'mpesa'];
  if (!validDests.includes(destination)) return res.status(400).json({ error: 'Invalid destination' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (amt > db.wallet.balance) return res.status(400).json({ error: 'Insufficient balance' });
  const txId = 'OUT-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  db.wallet.balance -= amt;
  db.transactions.unshift({ id: txId, type: 'outgoing', destination, amount: amt, reference: String(reference || '').slice(0, 100), status: 'completed', created: new Date().toISOString(), by: getUser(req).user });
  log(`Admin transferred $${amt.toFixed(2)} to ${destination}`); save();
  res.json({ ok: true, txId, newBalance: db.wallet.balance });
});

/* ================= POSTS / KNOWLEDGE / CHAT ================= */
app.get('/api/posts', (req, res) => res.json(db.posts));
app.post('/api/posts', requirePerm('can_posts'), (req, res) => {
  const { title, body, tags } = req.body || {}; const me = getUser(req).user;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
  const post = { id: 'p' + Date.now(), title: String(title).slice(0, 120), body: String(body).slice(0, 2000), author: me, tags: Array.isArray(tags) ? tags.slice(0, 5) : [], created: new Date().toISOString() };
  db.posts.unshift(post); log(`${me} posted "${post.title}"`); save(); res.status(201).json(post);
});
app.patch('/api/posts/:id', requirePerm('can_posts'), (req, res) => {
  const p = db.posts.find(p => p.id === req.params.id); if (!p) return res.status(404).json({ error: 'Not found' });
  const { title, body } = req.body || {};
  if (title) p.title = String(title).slice(0, 120); if (body) p.body = String(body).slice(0, 2000);
  save(); res.json(p);
});
app.delete('/api/posts/:id', requirePerm('can_posts'), (req, res) => {
  const i = db.posts.findIndex(p => p.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'Not found' });
  db.posts.splice(i, 1); save(); res.json({ ok: true });
});
app.get('/api/knowledge', (req, res) => res.json(db.knowledge));
app.post('/api/knowledge', requireAdmin, (req, res) => {
  const { keywords, answer } = req.body || {};
  if (!Array.isArray(keywords) || !keywords.length || !answer) return res.status(400).json({ error: 'keywords[] and answer required' });
  const k = { id: 'k' + Date.now(), keywords: keywords.map(String).slice(0, 10), answer: String(answer).slice(0, 500) };
  db.knowledge.push(k); log('Admin added AI knowledge'); save(); res.status(201).json(k);
});
app.delete('/api/knowledge/:id', requireAdmin, (req, res) => {
  const i = db.knowledge.findIndex(k => k.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'Not found' });
  db.knowledge.splice(i, 1); save(); res.json({ ok: true });
});
app.post('/api/chat', chatLimiter, (req, res) => res.json({ reply: botReply(req.body?.message, req.body?.lang || 'en') }));

/* ================= MENU / EVENTS / ORDERS ================= */
app.get('/api/menu', (req, res) => res.json(db.menu));
app.post('/api/menu', requirePerm('can_menu'), (req, res) => {
  const { cat, name, price, desc, seed, tags } = req.body || {};
  if (!name || !cat) return res.status(400).json({ error: 'name and cat required' });
  const item = { id: 'm' + Date.now(), cat: String(cat), name: String(name), price: Number(price) || 0, desc: String(desc || ''), seed: seed || 'coffee-cup', tags: Array.isArray(tags) ? tags : [], available: true };
  db.menu.push(item); log(`Added ${item.name}`); save(); res.status(201).json(item);
});
app.patch('/api/menu/:id', requirePerm('can_menu'), (req, res) => {
  const item = db.menu.find(m => m.id === req.params.id); if (!item) return res.status(404).json({ error: 'Not found' });
  const { available, price, name, desc } = req.body || {};
  if (typeof available === 'boolean') item.available = available;
  if (Number.isFinite(price) && price >= 0.5 && price <= 50) item.price = Math.round(price * 100) / 100;
  if (name) item.name = String(name); if (desc) item.desc = String(desc);
  log(`Edited ${item.name}`); save(); res.json(item);
});
app.delete('/api/menu/:id', requirePerm('can_menu'), (req, res) => {
  const i = db.menu.findIndex(m => m.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'Not found' });
  const [gone] = db.menu.splice(i, 1); log(`Deleted ${gone.name}`); save(); res.json({ ok: true });
});
app.get('/api/events', (req, res) => res.json(db.events));
app.patch('/api/events/:id', requirePerm('can_events'), (req, res) => {
  const ev = db.events.find(e => e.id === req.params.id); if (!ev) return res.status(404).json({ error: 'Not found' });
  const { delta } = req.body || {}; if (typeof delta === 'number') ev.seats = Math.max(0, Math.min(40, ev.seats + Math.trunc(delta)));
  save(); res.json(ev);
});
app.post('/api/events/:id/rsvp', (req, res) => { const ev = db.events.find(e => e.id === req.params.id); if (!ev) return res.status(404).json({ error: 'No such event' }); if (ev.seats <= 0) return res.status(409).json({ error: 'Fully booked' }); ev.seats--; save(); res.json(ev); });
app.delete('/api/events/:id/rsvp', (req, res) => { const ev = db.events.find(e => e.id === req.params.id); if (!ev) return res.status(404).json({ error: 'No such event' }); ev.seats = Math.min(40, ev.seats + 1); save(); res.json(ev); });
app.get('/api/orders', requirePerm('can_orders'), (req, res) => res.json(db.orders));
app.patch('/api/orders/:no', requirePerm('can_orders'), (req, res) => {
  const o = db.orders.find(o => o.no === req.params.no); if (!o) return res.status(404).json({ error: 'Not found' });
  const { status } = req.body || {}; if (!FLOW.includes(status)) return res.status(400).json({ error: 'Bad status' });
  o.status = status; log(`${o.no} → ${status}`); save(); res.json(o);
});
app.delete('/api/orders/:no', requirePerm('can_orders'), (req, res) => {
  const i = db.orders.findIndex(o => o.no === req.params.no); if (i < 0) return res.status(404).json({ error: 'Not found' });
  const [gone] = db.orders.splice(i, 1); log(`${gone.no} voided`); save(); res.json({ ok: true });
});

app.post('/api/newsletter', (req, res) => { const email = String(req.body?.email || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' }); if (!db.newsletter.some(s => s.email === email)) { db.newsletter.unshift({ email, t: new Date().toISOString() }); save(); } res.status(201).json({ ok: true }); });
app.get('/api/newsletter', requireAdmin, (req, res) => res.json(db.newsletter));
app.get('/api/stats', requireLogin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10); const todays = db.orders.filter(o => o.created.slice(0, 10) === today);
  const revenue = todays.reduce((s, o) => s + o.subtotal, 0); const tally = {}; todays.forEach(o => o.items.forEach(i => tally[i.name] = (tally[i.name] || 0) + i.qty));
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const pending = db.transactions.filter(t => t.status === 'pending');
  res.json({ orders: todays.length, revenue, avg: todays.length ? revenue / todays.length : 0, top: top ? { name: top[0], qty: top[1] } : null, queued: db.orders.filter(o => o.status === 'queued').length, pendingCount: pending.length, pendingAmount: pending.reduce((s, t) => s + t.amount, 0) });
});
app.get('/api/activity', requireLogin, (req, res) => res.json(db.activity));
app.get('/health', (req, res) => res.json({ ok: true, env: NODE_ENV, users: db.users.length, supabase: sbEnabled, menu: db.menu.length }));

/* ===== 🚫 404 catch-all ===== */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

if (!IS_VERCEL) {
  app.listen(PORT, () => console.log(`\n   ☕ ERSCOMAS · ${NODE_ENV}\n   → http://localhost:${PORT}\n   🔁 Subscriptions · ⭐ Reviews ·  Gifts · ️ Security · ✍️ ERMIAS AMARE\n`));
}
export default app;