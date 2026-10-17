const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Directories for local storage & config
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'local_db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(Buffer.from(file.originalname, 'latin1').toString('utf8'));
    cb(null, unique + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 * 1024 } }); // Up to 10GB

// Load / Save Config
function loadConfig() {
  const defaultCfg = {
    driveName: '방송국 드라이브',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/oauth2callback`,
    rootFolderId: process.env.GOOGLE_ROOT_FOLDER_ID || 'root',
    accessPin: process.env.ACCESS_PIN || '',
    tokens: null,
    userEmail: ''
  };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return { ...defaultCfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) {
      return defaultCfg;
    }
  }
  return defaultCfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

// Initial Seed Data for Local / Demo Mode (matches design mockup + real editable files)
function getSeedItems() {
  const items = [
    { id: 'f0', name: '00_공용자료', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'root', size: 0, date: '2026.09.30 10:12', by: '서창민', starred: false, shared: true, trashed: false, description: '방송국 전체 부원 공용 로고, 폰트, 템플릿 보관함' },
    { id: 'f1', name: '01_촬영자료', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'root', size: 0, date: '2026.10.06 13:20', by: '강주형', starred: true, shared: false, trashed: false, description: '원본 카메라 및 드론 촬영본 아카이브' },
    { id: 'f2', name: '02_편집자료', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'root', size: 0, date: '2026.10.05 18:40', by: '이수진', starred: false, shared: false, trashed: false, description: '가편집본 및 최종 마스터링 영상' },
    { id: 'f3', name: '03_그래픽', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'root', size: 0, date: '2026.10.02 11:05', by: '박도윤', starred: false, shared: false, trashed: false, description: '자막 템플릿, 썸네일, 타이틀 PSD/AI' },
    { id: 'f4', name: '04_음원', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'root', size: 0, date: '2026.09.24 15:30', by: '김하늘', starred: false, shared: false, trashed: false, description: 'BGM, 효과음 및 현장 동시녹음 파일' },
    { id: 'f5', name: '05_문서', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'root', size: 0, date: '2026.09.18 09:47', by: '서창민', starred: false, shared: false, trashed: false, description: '방송 기획안, 큐시트, 대본, 회의록' },
    { id: 'f11', name: '2026_축제', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'f1', size: 0, date: '2026.10.06 13:20', by: '강주형', starred: true, shared: true, trashed: false, description: '2026 가을 대동제 촬영 프로젝트' },
    { id: 'f12', name: '2026_신년특집', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'f1', size: 0, date: '2026.09.12 14:10', by: '강주형', starred: false, shared: false, trashed: false, description: '신년특집 인터뷰 및 스케치' },
    { id: 'd11', name: '촬영_일정표_10월.csv', kind: 'doc', mimeType: 'text/csv', parent: 'f1', size: 0.24, date: '2026.10.01 09:30', by: '서창민', starred: false, shared: true, trashed: false, description: '10월 촬영 장비 배정 및 부원 스케줄표', content: '날짜,구분,담당자,장비,장소,비고\n2026-10-05,리허설 촬영,강주형/이수진,Sony FX3 + 24-70GM,대강당,오후 2시 집합\n2026-10-06,본무대 메인캠,강주형,Sony FX6,본관 앞 특설무대,삼각대 및 무선송수신기 필수\n2026-10-06,드론 항공촬영,박도윤,DJI Mavic 3 Pro,운동장 상공,비행승인 완료\n2026-10-07,하이라이트 편집,이수진,편집실 1번 맥스튜디오,방송국 편집실,자막 템플릿 v3 적용' },
    { id: 'f111', name: '원본_메인캠', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'f11', size: 0, date: '2026.10.06 12:58', by: '강주형', starred: false, shared: false, trashed: false, description: 'A캠(FX6) 원본 클립' },
    { id: 'f112', name: '원본_서브캠', kind: 'folder', mimeType: 'application/vnd.google-apps.folder', parent: 'f11', size: 0, date: '2026.10.06 12:41', by: '강주형', starred: false, shared: false, trashed: false, description: 'B캠(FX3) 짐벌 클립' },
    { id: 'v1', name: '축제_메인캠_001.mp4', kind: 'video', mimeType: 'video/mp4', parent: 'f11', size: 18842, date: '2026.10.06 13:20', by: '강주형', dur: '03:42', starred: true, shared: true, trashed: false, description: '오프닝 공연 풀샷 (4K 60fps S-Log3)' },
    { id: 'v2', name: '축제_메인캠_002.mp4', kind: 'video', mimeType: 'video/mp4', parent: 'f11', size: 22221, date: '2026.10.06 13:05', by: '강주형', dur: '05:10', starred: false, shared: false, trashed: false, description: '초대가수 무대 1부 메인캠' },
    { id: 'v3', name: '축제_드론_001.mov', kind: 'video', mimeType: 'video/quicktime', parent: 'f11', size: 9421, date: '2026.10.06 11:47', by: '박도윤', dur: '02:18', starred: false, shared: true, trashed: false, description: '캠퍼스 전경 및 무대 야경 드론샷' },
    { id: 'i1', name: '무대_스틸컷_012.jpg', kind: 'image', mimeType: 'image/jpeg', parent: 'f11', size: 8.4, date: '2026.10.06 10:32', by: '이수진', starred: false, shared: false, trashed: false, description: '썸네일 후보용 고화질 스틸컷' },
    { id: 'p1', name: '축제_큐시트_v3.md', kind: 'doc', mimeType: 'text/markdown', parent: 'f11', size: 1.2, date: '2026.10.05 21:14', by: '서창민', starred: true, shared: true, trashed: false, description: '2026 방송국 축제 중계 최종 큐시트 및 대본 (직접 편집 가능)', content: '# 🎬 2026 가을 축제 생중계 큐시트 (v3)\n\n- **일시**: 2026년 10월 6일 (화) 18:00 ~ 21:30\n- **연출(PD)**: 서창민 / **카메라**: 강주형, 박도윤 / **음향**: 김하늘 / **CG·자막**: 이수진\n\n---\n\n## 1. 오프닝 (18:00 ~ 18:15)\n1. **[VCR]** 축제 티저 영상 송출 (`01:30`)\n2. **[CAM 1]** MC 오프닝 멘트 (하단 자막: `2026 대동제 LIVE`)\n3. **[MIC 1/2]** 현장 앰비언스 -12dB 유지\n\n## 2. 동아리 본선 무대 (18:15 ~ 19:30)\n- **순서 1**: 밴드부 오프닝 (CAM 1 풀샷, CAM 2 보컬 클로즈업)\n- **순서 2**: 댄스부 공연 (짐벌 캠 투입, 셔터스피드 1/120 고정)\n\n## 3. 특집 인터뷰 & 클로징 (19:30 ~ )\n- 현장 인터뷰 질문지 확인 후 BGM 페이드인\n' },
    { id: 'a1', name: '현장음_A_01.wav', kind: 'audio', mimeType: 'audio/wav', parent: 'f11', size: 642, date: '2026.10.05 19:02', by: '김하늘', dur: '04:15', starred: false, shared: false, trashed: false, description: '믹서 콘솔 다이렉트 24bit/48kHz 녹음본' },
    { id: 's1', name: '타이틀_그래픽.psd', kind: 'psd', mimeType: 'image/vnd.adobe.photoshop', parent: 'f11', size: 486, date: '2026.10.04 16:55', by: '박도윤', starred: true, shared: false, trashed: false, description: '축제 로고 및 하단 바(Lower Third) 원본 레이어' },
    { id: 'z1', name: '촬영원본_백업.zip', kind: 'zip', mimeType: 'application/zip', parent: 'f11', size: 32870, date: '2026.10.03 23:10', by: '강주형', starred: false, shared: false, trashed: false, description: '1일차 촬영 프록시 파일 전체 압축본' },
    { id: 'e1', name: '축제_하이라이트_가편.mp4', kind: 'video', mimeType: 'video/mp4', parent: 'f2', size: 3420, date: '2026.10.05 18:40', by: '이수진', dur: '01:30', starred: false, shared: true, trashed: false, description: '1차 컷편집 완료본 (피드백 댓글 요망)' },
    { id: 'd51', name: '방송국_장비대여_대장.txt', kind: 'doc', mimeType: 'text/plain', parent: 'f5', size: 0.08, date: '2026.10.04 11:20', by: '서창민', starred: false, shared: true, trashed: false, description: '카메라, 렌즈, 마이크 반출/반납 기록장', content: '=== 방송국 장비 반출/반납 기록장 ===\n\n[대여중]\n1. Sony FX3 바디 #1 - 강주형 (10/05 ~ 10/07)\n2. Sennheiser MKH416 샷건마이크 - 김하늘 (10/05 ~ 10/07)\n3. DJI RS3 Pro 짐벌 - 박도윤 (10/06 당일)\n\n[점검필요]\n- 편집실 2번 오디오 인터페이스 팬 노이즈 확인 필요\n' },
    { id: 't1', name: '축제_메인캠_테스트.mp4', kind: 'video', mimeType: 'video/mp4', parent: 'f11', size: 412, date: '2026.10.06 09:02', by: '강주형', dur: '00:12', starred: false, shared: false, trashed: true, description: '화이트밸런스 테스트 컷 (휴지통)' }
  ];
  return items;
}

function loadLocalDb() {
  if (fs.existsSync(LOCAL_DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
    } catch (e) {
      return getSeedItems();
    }
  }
  const seed = getSeedItems();
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
  return seed;
}

function saveLocalDb(items) {
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(items, null, 2), 'utf8');
}

// Helper: Format current timestamp
function nowStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isoToDateStr(iso) {
  if (!iso) return nowStr();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return nowStr();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Helper: Determine kind from name and mimeType
function detectKind(name = '', mimeType = '') {
  if (mimeType === 'application/vnd.google-apps.folder') return 'folder';
  const e = (name.split('.').pop() || '').toLowerCase();
  if (['mp4', 'mov', 'mxf', 'avi', 'mkv', 'webm'].includes(e) || mimeType.startsWith('video/')) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'].includes(e) || mimeType.startsWith('image/')) return 'image';
  if (e === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (['wav', 'mp3', 'aac', 'm4a', 'flac', 'ogg'].includes(e) || mimeType.startsWith('audio/')) return 'audio';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'zip';
  if (['psd', 'ai', 'aep', 'prproj'].includes(e)) return 'psd';
  if (['xlsx', 'xls', 'csv', 'doc', 'docx', 'txt', 'md', 'json'].includes(e) || mimeType.startsWith('text/') || mimeType.includes('spreadsheet') || mimeType.includes('document')) return 'doc';
  return 'file';
}

function isEditableText(item) {
  const e = ((item.name || '').split('.').pop() || '').toLowerCase();
  if (['txt', 'md', 'csv', 'json', 'log', 'xml', 'html', 'css', 'js', 'srt', 'vtt'].includes(e)) return true;
  if ((item.mimeType || '').startsWith('text/')) return true;
  if (typeof item.content === 'string') return true;
  return false;
}

// Google OAuth2 Client Helper
function getOAuthClient(cfg) {
  if (!cfg.clientId || !cfg.clientSecret) return null;
  const oAuth2Client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  if (cfg.tokens) {
    oAuth2Client.setCredentials(cfg.tokens);
    oAuth2Client.on('tokens', (newTokens) => {
      const current = loadConfig();
      current.tokens = { ...current.tokens, ...newTokens };
      saveConfig(current);
    });
  }
  return oAuth2Client;
}

function getDriveClient() {
  const cfg = loadConfig();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.tokens) return null;
  const auth = getOAuthClient(cfg);
  return { drive: google.drive({ version: 'v3', auth }), cfg };
}

// Convert Google Drive File to App Item format
function mapDriveFile(f, rootFolderId) {
  const kind = detectKind(f.name, f.mimeType);
  const parentId = (f.parents && f.parents[0]) ? (f.parents[0] === rootFolderId ? 'root' : f.parents[0]) : 'root';
  const sizeMb = f.size ? Number(f.size) / (1024 * 1024) : 0;
  const props = f.appProperties || {};
  let dur = props.dur;
  if (!dur && f.videoMediaMetadata && f.videoMediaMetadata.durationMillis) {
    const totalSec = Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    dur = `${m}:${s}`;
  }
  return {
    id: f.id,
    name: f.name,
    kind,
    mimeType: f.mimeType,
    parent: parentId,
    size: Number(sizeMb.toFixed(2)),
    date: isoToDateStr(f.modifiedTime),
    by: props.uploadedBy || (f.owners && f.owners[0] && f.owners[0].displayName) || '관리자',
    dur,
    starred: Boolean(f.starred),
    shared: Boolean(f.shared || props.shared === 'true'),
    trashed: Boolean(f.trashed),
    description: f.description || '',
    webViewLink: f.webViewLink || '',
    webContentLink: f.webContentLink || '',
    thumbnailLink: f.thumbnailLink || '',
    editable: isEditableText({ name: f.name, mimeType: f.mimeType }),
    source: 'google'
  };
}

// ============================================================================
// API ROUTES: STATUS & GOOGLE OAUTH CONFIGURATION
// ============================================================================

app.get('/api/status', (req, res) => {
  const cfg = loadConfig();
  const isGoogleConnected = Boolean(cfg.clientId && cfg.clientSecret && cfg.tokens);
  res.json({
    mode: isGoogleConnected ? 'google' : 'local',
    driveName: cfg.driveName || '방송국 드라이브',
    userEmail: cfg.userEmail || '',
    rootFolderId: cfg.rootFolderId || 'root',
    hasCredentials: Boolean(cfg.clientId && cfg.clientSecret),
    hasClientSecret: Boolean(cfg.clientSecret),
    clientId: cfg.clientId || '',
    redirectUri: cfg.redirectUri,
    requirePin: Boolean(cfg.accessPin)
  });
});

app.post('/api/verify-pin', (req, res) => {
  const cfg = loadConfig();
  if (!cfg.accessPin || req.body.pin === cfg.accessPin) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: '비밀번호(PIN)가 일치하지 않습니다.' });
});

app.post('/api/config', (req, res) => {
  const cfg = loadConfig();
  const { driveName, clientId, clientSecret, redirectUri, rootFolderId, accessPin } = req.body;
  if (driveName !== undefined) cfg.driveName = driveName.trim() || '방송국 드라이브';
  if (clientId !== undefined && !clientId.includes('...')) cfg.clientId = clientId.trim();
  if (clientSecret !== undefined && clientSecret.trim() !== '') cfg.clientSecret = clientSecret.trim();
  if (redirectUri !== undefined && redirectUri.trim() !== '') cfg.redirectUri = redirectUri.trim();
  if (rootFolderId !== undefined) cfg.rootFolderId = rootFolderId.trim() || 'root';
  if (accessPin !== undefined) cfg.accessPin = accessPin.trim();
  saveConfig(cfg);
  res.json({ ok: true, message: '설정이 저장되었습니다.' });
});

app.get('/api/auth/url', (req, res) => {
  const cfg = loadConfig();
  const oAuth2Client = getOAuthClient(cfg);
  if (!oAuth2Client) {
    return res.status(400).json({ error: ' 먼저 Google Client ID와 Client Secret을 저장해주세요.' });
  }
  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  });
  res.json({ url });
});

app.get('/api/oauth2callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.send(`<script>alert("구글 인증 실패: ${error}"); window.location.href="/";</script>`);
  }
  try {
    const cfg = loadConfig();
    const oAuth2Client = getOAuthClient(cfg);
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    cfg.tokens = tokens;

    // Fetch user email
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
      const userInfo = await oauth2.userinfo.get();
      cfg.userEmail = userInfo.data.email || '';
    } catch (err) {
      console.warn('Could not fetch user email:', err.message);
    }

    saveConfig(cfg);
    res.send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>연동 완료</title></head>
      <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#F8FAFC;color:#0F172A">
        <div style="text-align:center;background:#fff;padding:32px;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.1)">
          <h2 style="color:#2563EB;margin-bottom:8px">✅ 구글 드라이브 연동이 완료되었습니다!</h2>
          <p style="color:#64748B;font-size:14px">잠시 후 공유 드라이브 화면으로 돌아갑니다...</p>
          <script>setTimeout(() => { if(window.opener){ window.opener.postMessage('google-connected', '*'); window.close(); } else { window.location.href = '/'; } }, 1200);</script>
        </div>
      </body></html>
    `);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send(`구글 드라이브 연동 중 오류가 발생했습니다: ${err.message}`);
  }
});

app.post('/api/auth/disconnect', (req, res) => {
  const cfg = loadConfig();
  cfg.tokens = null;
  cfg.userEmail = '';
  saveConfig(cfg);
  res.json({ ok: true, message: '구글 드라이브 연동이 해제되어 로컬 스토리지 모드로 전환되었습니다.' });
});

// ============================================================================
// API ROUTES: FILES CRUD (GOOGLE DRIVE + LOCAL FALLBACK)
// ============================================================================

// 1. List all items (or folder contents)
app.get('/api/files', async (req, res) => {
  try {
    const client = getDriveClient();
    if (client) {
      const { drive, cfg } = client;
      const rootId = cfg.rootFolderId || 'root';
      // Fetch up to 500 files from the user's Google Drive
      const response = await drive.files.list({
        pageSize: 500,
        q: "mimeType != 'application/vnd.google-apps.shortcut'",
        fields: 'files(id, name, mimeType, size, modifiedTime, parents, starred, shared, trashed, description, webViewLink, webContentLink, thumbnailLink, appProperties, owners, videoMediaMetadata)',
        orderBy: 'folder,modifiedTime desc'
      });
      const files = (response.data.files || []).map(f => mapDriveFile(f, rootId));
      return res.json({ mode: 'google', rootFolderId: rootId, items: files });
    }

    // Local mode
    const items = loadLocalDb().map(it => ({
      ...it,
      editable: isEditableText(it),
      source: 'local'
    }));
    res.json({ mode: 'local', rootFolderId: 'root', items });
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Create New Folder or New Editable Document
app.post('/api/folders', async (req, res) => {
  try {
    const { name, parent = 'root', by = '서창민', description = '' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '폴더 이름을 입력해주세요.' });

    const client = getDriveClient();
    if (client) {
      const { drive, cfg } = client;
      const rootId = cfg.rootFolderId || 'root';
      const actualParent = parent === 'root' ? rootId : parent;
      const response = await drive.files.create({
        requestBody: {
          name: name.trim(),
          mimeType: 'application/vnd.google-apps.folder',
          parents: [actualParent],
          description,
          appProperties: { uploadedBy: by, shared: 'true' }
        },
        fields: 'id, name, mimeType, size, modifiedTime, parents, starred, shared, trashed, description, webViewLink, appProperties, owners'
      });
      return res.json({ item: mapDriveFile(response.data, rootId) });
    }

    const items = loadLocalDb();
    const newFolder = {
      id: 'f_' + Date.now(),
      name: name.trim(),
      kind: 'folder',
      mimeType: 'application/vnd.google-apps.folder',
      parent: parent || 'root',
      size: 0,
      date: nowStr(),
      by,
      starred: false,
      shared: true,
      trashed: false,
      description,
      editable: false
    };
    items.push(newFolder);
    saveLocalDb(items);
    res.json({ item: newFolder });
  } catch (err) {
    console.error('Error creating folder:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Create or Edit Text/Markdown/CSV Document directly
app.post('/api/documents', async (req, res) => {
  try {
    const { name, parent = 'root', content = '', by = '서창민', description = '' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '문서 이름을 입력해주세요.' });
    const finalName = name.includes('.') ? name.trim() : `${name.trim()}.md`;
    const ext = finalName.split('.').pop().toLowerCase();
    const mimeType = ext === 'csv' ? 'text/csv' : ext === 'json' ? 'application/json' : ext === 'md' ? 'text/markdown' : 'text/plain';

    const client = getDriveClient();
    if (client) {
      const { drive, cfg } = client;
      const rootId = cfg.rootFolderId || 'root';
      const actualParent = parent === 'root' ? rootId : parent;
      const response = await drive.files.create({
        requestBody: {
          name: finalName,
          mimeType,
          parents: [actualParent],
          description,
          appProperties: { uploadedBy: by, shared: 'true' }
        },
        media: {
          mimeType,
          body: content
        },
        fields: 'id, name, mimeType, size, modifiedTime, parents, starred, shared, trashed, description, webViewLink, webContentLink, appProperties, owners'
      });
      return res.json({ item: mapDriveFile(response.data, rootId) });
    }

    const items = loadLocalDb();
    const localFileName = `doc_${Date.now()}_${finalName.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, localFileName), content, 'utf8');
    const sizeMb = Math.max(0.01, Number((Buffer.byteLength(content, 'utf8') / (1024 * 1024)).toFixed(2)));
    const newDoc = {
      id: 'd_' + Date.now(),
      name: finalName,
      kind: 'doc',
      mimeType,
      parent: parent || 'root',
      size: sizeMb,
      date: nowStr(),
      by,
      starred: false,
      shared: true,
      trashed: false,
      description,
      content,
      localFile: localFileName,
      editable: true
    };
    items.push(newDoc);
    saveLocalDb(items);
    res.json({ item: newDoc });
  } catch (err) {
    console.error('Error creating document:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Upload Files (Single or Multiple)
app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    const parent = req.body.parent || 'root';
    const by = req.body.by || '서창민';
    const replaceId = req.body.replaceId || null; // For uploading a new version of an existing file
    const uploadedFiles = req.files || [];
    if (!uploadedFiles.length) return res.status(400).json({ error: '업로드할 파일이 없습니다.' });

    const client = getDriveClient();
    const createdItems = [];

    if (client) {
      const { drive, cfg } = client;
      const rootId = cfg.rootFolderId || 'root';
      const actualParent = parent === 'root' ? rootId : parent;

      for (const file of uploadedFiles) {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        if (replaceId) {
          const response = await drive.files.update({
            fileId: replaceId,
            requestBody: {
              name: originalName,
              appProperties: { uploadedBy: by }
            },
            media: {
              mimeType: file.mimetype,
              body: fs.createReadStream(file.path)
            },
            fields: 'id, name, mimeType, size, modifiedTime, parents, starred, shared, trashed, description, webViewLink, webContentLink, thumbnailLink, appProperties, owners, videoMediaMetadata'
          });
          createdItems.push(mapDriveFile(response.data, rootId));
        } else {
          const response = await drive.files.create({
            requestBody: {
              name: originalName,
              parents: [actualParent],
              appProperties: { uploadedBy: by, shared: 'true' }
            },
            media: {
              mimeType: file.mimetype,
              body: fs.createReadStream(file.path)
            },
            fields: 'id, name, mimeType, size, modifiedTime, parents, starred, shared, trashed, description, webViewLink, webContentLink, thumbnailLink, appProperties, owners, videoMediaMetadata'
          });
          createdItems.push(mapDriveFile(response.data, rootId));
        }
        // Clean up temp local file after uploading to Google Drive
        try { fs.unlinkSync(file.path); } catch (e) {}
      }
      return res.json({ items: createdItems });
    }

    // Local mode
    const items = loadLocalDb();
    for (const file of uploadedFiles) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const sizeMb = Math.max(0.01, Number((file.size / (1024 * 1024)).toFixed(2)));
      const kind = detectKind(originalName, file.mimetype);
      let textContent = undefined;
      if (isEditableText({ name: originalName, mimeType: file.mimetype }) && file.size < 2 * 1024 * 1024) {
        try { textContent = fs.readFileSync(file.path, 'utf8'); } catch (e) {}
      }

      if (replaceId) {
        const idx = items.findIndex(i => i.id === replaceId);
        if (idx !== -1) {
          items[idx] = {
            ...items[idx],
            name: originalName,
            kind,
            mimeType: file.mimetype,
            size: sizeMb,
            date: nowStr(),
            by,
            localFile: file.filename,
            ...(textContent !== undefined ? { content: textContent } : {})
          };
          createdItems.push(items[idx]);
          continue;
        }
      }

      const newItem = {
        id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: originalName,
        kind,
        mimeType: file.mimetype,
        parent: parent || 'root',
        size: sizeMb,
        date: nowStr(),
        by,
        dur: kind === 'video' ? '02:45' : kind === 'audio' ? '01:30' : undefined,
        starred: false,
        shared: true,
        trashed: false,
        description: '',
        localFile: file.filename,
        ...(textContent !== undefined ? { content: textContent } : {}),
        editable: isEditableText({ name: originalName, mimeType: file.mimetype })
      };
      items.push(newItem);
      createdItems.push(newItem);
    }
    saveLocalDb(items);
    res.json({ items: createdItems });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Get File Content (for in-app editor & preview)
app.get('/api/files/:id/content', async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDriveClient();
    if (client) {
      const { drive } = client;
      const meta = await drive.files.get({ fileId: id, fields: 'id, name, mimeType, description' });
      let text = '';
      if (meta.data.mimeType === 'application/vnd.google-apps.document') {
        const exp = await drive.files.export({ fileId: id, mimeType: 'text/plain' }, { responseType: 'text' });
        text = exp.data;
      } else if (meta.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
        const exp = await drive.files.export({ fileId: id, mimeType: 'text/csv' }, { responseType: 'text' });
        text = exp.data;
      } else {
        const dl = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'text' });
        text = typeof dl.data === 'string' ? dl.data : JSON.stringify(dl.data, null, 2);
      }
      return res.json({ id, name: meta.data.name, content: text, description: meta.data.description || '' });
    }

    const items = loadLocalDb();
    const item = items.find(i => i.id === id);
    if (!item) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    let content = item.content || '';
    if (!content && item.localFile) {
      const fp = path.join(UPLOAD_DIR, item.localFile);
      if (fs.existsSync(fp)) content = fs.readFileSync(fp, 'utf8');
    }
    res.json({ id: item.id, name: item.name, content, description: item.description || '' });
  } catch (err) {
    console.error('Get content error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Update File Metadata or Content (Rename, Move, Star, Share, Trash, Description, Text Content)
app.patch('/api/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent, starred, shared, trashed, description, content, by } = req.body;

    const client = getDriveClient();
    if (client) {
      const { drive, cfg } = client;
      const rootId = cfg.rootFolderId || 'root';
      const requestBody = {};
      if (name !== undefined) requestBody.name = name.trim();
      if (starred !== undefined) requestBody.starred = Boolean(starred);
      if (trashed !== undefined) requestBody.trashed = Boolean(trashed);
      if (description !== undefined) requestBody.description = description;
      if (shared !== undefined || by !== undefined) {
        requestBody.appProperties = {};
        if (shared !== undefined) requestBody.appProperties.shared = String(Boolean(shared));
        if (by !== undefined) requestBody.appProperties.uploadedBy = by;
      }

      let addParents = undefined;
      let removeParents = undefined;
      if (parent !== undefined) {
        const cur = await drive.files.get({ fileId: id, fields: 'parents' });
        removeParents = (cur.data.parents || []).join(',');
        addParents = parent === 'root' ? rootId : parent;
      }

      const updateParams = {
        fileId: id,
        requestBody,
        ...(addParents ? { addParents, removeParents } : {}),
        fields: 'id, name, mimeType, size, modifiedTime, parents, starred, shared, trashed, description, webViewLink, webContentLink, thumbnailLink, appProperties, owners, videoMediaMetadata'
      };

      if (content !== undefined) {
        updateParams.media = {
          mimeType: 'text/plain',
          body: content
        };
      }

      const response = await drive.files.update(updateParams);
      return res.json({ item: mapDriveFile(response.data, rootId) });
    }

    // Local mode
    const items = loadLocalDb();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });

    const updated = { ...items[idx] };
    if (name !== undefined) {
      updated.name = name.trim();
      if (updated.kind !== 'folder') updated.kind = detectKind(updated.name, updated.mimeType);
    }
    if (parent !== undefined) updated.parent = parent;
    if (starred !== undefined) updated.starred = Boolean(starred);
    if (shared !== undefined) updated.shared = Boolean(shared);
    if (trashed !== undefined) updated.trashed = Boolean(trashed);
    if (description !== undefined) updated.description = description;
    if (by !== undefined) updated.by = by;
    if (content !== undefined) {
      updated.content = content;
      updated.size = Math.max(0.01, Number((Buffer.byteLength(content, 'utf8') / (1024 * 1024)).toFixed(2)));
      if (updated.localFile) {
        const fp = path.join(UPLOAD_DIR, updated.localFile);
        fs.writeFileSync(fp, content, 'utf8');
      }
    }
    updated.date = nowStr();
    items[idx] = updated;
    saveLocalDb(items);
    res.json({ item: { ...updated, editable: isEditableText(updated) } });
  } catch (err) {
    console.error('Update file error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Permanent Delete
app.delete('/api/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDriveClient();
    if (client) {
      const { drive } = client;
      await drive.files.delete({ fileId: id });
      return res.json({ ok: true });
    }

    let items = loadLocalDb();
    const target = items.find(i => i.id === id);
    if (target && target.localFile) {
      const fp = path.join(UPLOAD_DIR, target.localFile);
      if (fs.existsSync(fp)) {
        try { fs.unlinkSync(fp); } catch (e) {}
      }
    }
    items = items.filter(i => i.id !== id && i.parent !== id);
    saveLocalDb(items);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. Download or Stream File
app.get('/api/files/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const inline = req.query.inline === '1';

    const client = getDriveClient();
    if (client) {
      const { drive } = client;
      const meta = await drive.files.get({ fileId: id, fields: 'id, name, mimeType, size' });
      const fileName = encodeURIComponent(meta.data.name);
      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${fileName}`);

      // Handle Google Workspace Docs export
      if (meta.data.mimeType.startsWith('application/vnd.google-apps.')) {
        let exportMime = 'application/pdf';
        if (meta.data.mimeType.includes('spreadsheet')) exportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (meta.data.mimeType.includes('document')) exportMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        res.setHeader('Content-Type', exportMime);
        const streamRes = await drive.files.export({ fileId: id, mimeType: exportMime }, { responseType: 'stream' });
        return streamRes.data.pipe(res);
      }

      res.setHeader('Content-Type', meta.data.mimeType || 'application/octet-stream');
      const streamRes = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
      return streamRes.data.pipe(res);
    }

    // Local mode download
    const items = loadLocalDb();
    const item = items.find(i => i.id === id);
    if (!item) return res.status(404).send('파일을 찾을 수 없습니다.');

    const encodedName = encodeURIComponent(item.name);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodedName}`);

    if (item.localFile) {
      const fp = path.join(UPLOAD_DIR, item.localFile);
      if (fs.existsSync(fp)) {
        res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
        return fs.createReadStream(fp).pipe(res);
      }
    }

    if (typeof item.content === 'string') {
      res.setHeader('Content-Type', `${item.mimeType || 'text/plain'}; charset=utf-8`);
      return res.send(item.content);
    }

    // For seed demo media files that don't have binary blobs on disk, generate a helpful sample file
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}.info.txt`);
    return res.send(
      `[방송국 공유 드라이브 파일 정보]\n` +
      `파일명: ${item.name}\n` +
      `분류: ${item.kind}\n` +
      `용량: ${item.size} MB\n` +
      `업로더: ${item.by}\n` +
      `수정일: ${item.date}\n` +
      `설명: ${item.description || '없음'}\n\n` +
      `※ 이 항목은 초기 샘플 데이터입니다. 직접 업로드하신 영상/이미지/문서 파일이나 구글 드라이브 연동 파일은 실제 원본 바이너리가 그대로 다운로드됩니다.`
    );
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('다운로드 중 오류가 발생했습니다: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` 🚀 방송국 공유 드라이브 서버가 시작되었습니다!`);
  console.log(` 👉 접속 주소: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
