# Portfolio website

這是一個不依賴前端框架或打包器的純 HTML、CSS、JavaScript 網站。部署建置使用零依賴 Node.js 腳本，將可公開檔案複製到 `dist/`，並在建置階段產生分析服務的 runtime config。

## 本機建置

需要 Node.js 22（Node.js 20 以上亦可）：

```bash
node scripts/build-site.mjs --output dist
```

未提供分析 ID 時仍會成功建置；產出的網站會停用 GA4 與 Clarity。本機預覽不需要設定任何 ID，也不應將正式 ID 寫入受版本控制的檔案。

每個 HTML 入口都只在 `<head>` 開頭載入一次 `analytics-config.js` 與 `analytics.js`，並使用
`defer` 維持非阻塞解析及固定執行順序。共用模組會依部署設定載入一次 Google `gtag.js` 並排入
`config`；不要再另外貼入 GA 控制台提供的完整 snippet，否則可能重複初始化或重複記錄 page view。

## GitHub Pages 分析設定

此專案不是 Vite，因此部署流程使用以下 GitHub Repository Secrets：

- `GA_MEASUREMENT_ID`：GA4 Measurement ID，格式例如 `G-XXXXXXXXXX`
- `CLARITY_PROJECT_ID`：Microsoft Clarity Project ID，只接受小寫英數字元

設定路徑：Repository **Settings → Secrets and variables → Actions → New repository secret**。

目前 Pages Source 已設定為 **GitHub Actions**，`github-pages` environment 只允許 `main` 分支部署。Pull request 只會以空白 ID 建置與檢查 JavaScript，不會讀取 Secrets，也不會部署；推送到 `main` 或在 `main` 手動執行 workflow 才會建立並部署正式 artifact。正式環境已設定 `GA_MEASUREMENT_ID` 與 `CLARITY_PROJECT_ID`；GA4 為主要分析來源，Clarity 依下方隱私閘門提供輔助熱圖與工作階段分析。

GA4 Measurement ID 與 Clarity Project ID 是瀏覽器端服務所需的公開 client identifier，部署後可由訪客查看。Repository Secrets 的作用是避免把它們硬編碼並提交到原始碼；它們不是可授權帳號或存取資料的密鑰。

## 追蹤範圍與隱私

共用的 `script/analytics.js` 會送出首次 `page_view`，以及
`resume_download`、`contact_email_click`、`github_click`、`linkedin_click`、
`project_open`、`portfolio_section_view`、`engaged_30_seconds` 與
`contact_cta_click`。本站是多頁式網站，沒有 SPA Router，所以每次完整頁面載入就是新的 page view。

事件只使用固定事件名稱、去除 query/hash 的頁面路徑，以及受控的作品名稱；不傳送 Email 地址、
表單內容或使用者輸入。正式啟用 Clarity 前，請在 Clarity 控制台將 Masking 設為 **Strict**，
並依適用地區完成隱私聲明與 Consent Mode／同意管理。不要使用 Clarity Identify 傳送姓名、Email
或其他個人識別資訊。為避免 Clarity 的 clicked URL 與頁面 URL telemetry 收到 Email 或 query，
關於／聯絡頁，以及目前網址或不受信任 referrer 含 query parameter 的頁面會停用 Clarity；僅
`https://clarity.microsoft.com` 的 HTTPS 安裝驗證來源可通過窄域 allowlist。GA4 仍以去除
query/hash 的路徑記錄事件。GA4 的 Enhanced Measurement 也應只保留實際需要的功能，不啟用廣告用途。

為避免 GA4 Enhanced Measurement 的 outbound click 自動事件讀取含收件者的 Gmail／`mailto:`
網址，啟用 JavaScript 時的聯絡選項只在 DOM 暴露站內 fragment；真正的寄信目的地只在使用者
點擊後由 `email_contact.js` 建立。`<noscript>` 仍保留原生 `mailto:` 後備，但該模式不會執行
Google tag。GA4 控制台仍建議關閉不需要的 Enhanced Measurement 項目，並啟用 Email／query
data redaction 作第二層保護。
