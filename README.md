# 旅行書櫃 v1.7 — Firebase 同步測試版

保留 v1.6.2 的旅程、統計、分帳、幣別、CSV/JSON/HTML/PDF 匯出及 PWA 介面，新增 Google 登入和 Firestore 同步。

## 部署

1. 解壓縮後，**上傳資料夾內的所有檔案和 icons 資料夾**到 `tiffany04wl/travel-bookshelf` repository 的根目錄（不是上傳 ZIP，也不是多包一層資料夾）。
2. GitHub repository → Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save。
3. Firebase → Authentication → Settings → Authorized domains → Add domain：`tiffany04wl.github.io`（不要加 https 或 /travel-bookshelf）。
4. 開啟 https://tiffany04wl.github.io/travel-bookshelf/，登入 Google。第一次登入請仔細閱讀「上傳本機」或「載入雲端」確認視窗。
5. 在電腦及手機用相同 Google 帳號登入測試。手機可加入主畫面。

## 重要限制及注意

- **這是測試版，請先匯出完整 JSON 備份。** 同步採每趟旅程一份 Firestore 文件；每份文件包含支出，接近 850KB 會停止上傳。大型旅程日後應改為 expenses 子集合。
- 同一旅程兩台裝置**同時離線編輯**可能產生衝突，尚未實作逐筆合併；請避免同時編輯。
- Google 登入後，第一次同步會詢問是否上傳本機資料或載入雲端。選擇不進行時，同步暫停。
- **沒有完成雲端同步前請勿清除瀏覽器資料。** Firestore 支援離線快取，本機 localStorage 也保留資料；離線後請重新連線確認顯示「已同步到雲端」。
- 不要將個人 JSON 備份上傳至公開 GitHub repository。
- Firebase 網頁設定值是公開的客戶端設定，安全性由 Firestore Rules 保護。
- 本版保留原始示範旅程，首次登入時可選擇是否上傳。
- GitHub Pages 網址與 Firebase 授權網域需要先設定；未設定可能出現 unauthorized-domain。
