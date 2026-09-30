# 值班速查 2026 — iPhone 安裝說明

這是一個 **PWA（網頁 App）**：放到任何靜態網頁空間後，用 iPhone Safari 開啟並「加入主畫面」，就會像一般 App 一樣全螢幕、有圖示、**離線可用**（首次開啟後全部內容會存在手機裡）。不需要 Mac、Xcode 或 App Store。iOS 16 以上（含 iOS 26）皆支援。

## A. 放到 GitHub Pages（免費、永久網址）— 約 10 分鐘

1. 到 https://github.com 註冊／登入。右上角 **+ → New repository**：Repository name 填 `oncall`（或任何名字），選 **Public**，勾 **Add a README file**，按 **Create repository**。
2. 進入該 repository，按 **Add file → Upload files**。把本資料夾（`APP` 內的所有檔案與子資料夾：`index.html`、`app.js`、`styles.css`、`sw.js`、`manifest.webmanifest`、`data/`、`figs/`、`icons/`）**整個拖進去**（可以一次拖多個資料夾）。下方按 **Commit changes**。
   - 若瀏覽器一次拖不了子資料夾，可改用 GitHub Desktop，或把 `data`、`figs`、`icons` 三個資料夾分次拖。
3. 到 repository 的 **Settings → Pages**：Source 選 **Deploy from a branch**，Branch 選 **main**、資料夾 **/(root)**，按 **Save**。
4. 等 1–2 分鐘，同一頁會出現網址，例如 `https://<你的帳號>.github.io/oncall/`。用電腦開一次確認看得到首頁。
5. **iPhone**：用 **Safari**（不能用 Chrome）開這個網址 → 點下方「分享」按鈕（方框加箭頭）→ **加入主畫面** → 加入。主畫面就會出現「值班速查」圖示。第一次打開請在有網路時停留約 10 秒讓它把全部內容存下來，之後無網路也能用。

### 更新內容
之後我給你新版本時，只要在 GitHub 的 repository 重新 **Upload files** 覆蓋同名檔案並 Commit；手機上開一次 App，它會自動抓新版（畫面下方會提示「已更新到新版本」），再重開一次即生效。

### 隱私
- 這個網址是公開的（只要知道網址就能看）。內容是個人筆記，不含病人資料；病人體重／年齡／Cr 只存在你手機的瀏覽器裡，不會上傳。
- 若想不公開，可改用 Netlify Drop（https://app.netlify.com/drop，把整個資料夾拖上去即可，網址較難猜）或任何靜態空間；做法相同。

## B. 使用方式

- **情境**頁：上方搜尋框可打任何字（情境、診斷、藥名、檢驗值）。「臨床狀況」分類按鈕是護理師會講的話；「臨床可能診斷」直接跳到處置與醫囑。
- 回答 1–4 個問題（數值可直接按快速鍵）→ 結果頁：**現在就做**（順序）、**醫囑**（台灣病房 order 格式，可「複製全部」貼到 HIS）、監測、別漏掉、何時聯絡後線、指南原文連結。
- **右上角**輸入病人體重／年齡／性別／Cr → 所有依體重、腎功能的劑量自動換算（未輸入時以 60 kg、65 歲、Cr 1.0 估算並標示）。換病人請按「清除」。
- **章節**頁：全書 45 章原文（含圖）；**計算**頁：CrCl、矯正鈉／自由水、矯正鈣、AG／delta／Winter、滲透壓間隙、MAP、QTc、A–a、滴速換算、FENa、低血鉀補充量、胰島素起始、heparin 體重劑量。
- 上方的問題路徑（麵包屑）可點回去改答案。

## C. 檔案說明（給日後更新用）

- `data/chapters.json`：全書內容（由指南 markdown 產生）。
- `data/flows/NN.json`：每章的決策流程（問題、分支、醫囑）；格式見 `FLOW_SPEC.md`（在工作檔 zip 內）。
- `sw.js`：離線快取清單（每次改檔後需重新產生，工作檔 zip 內的 `tools/build.py` 會自動做）。
