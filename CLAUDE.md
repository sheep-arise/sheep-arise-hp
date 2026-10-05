# 合同会社SheepArise コーポレートサイト

本番: https://sheep-arise.com （Vercelプロジェクト `sheep-arise-hp`）
タグライン: 「日本の社会に、ゆとりを。」

複数メンバーがClaude Codeで更新する前提のリポジトリ。以下のルールを必ず守ること。

## 作業の流れ（厳守）

1. `main` から作業ブランチを切る（例: `feat/fits-price`, `fix/contact-typo`）。**mainへの直接pushは禁止**（保護ルールでも拒否される）。
2. 作業前に `git pull origin main` で最新化する。
3. 変更したらコミットしてブランチをpush → Pull Requestを作成する。
4. PRを作るとVercelがプレビューURLを自動発行する。**プレビューURLでPC幅とスマホ幅の両方を目視確認**してからレビュー依頼する。
5. レビューで承認されたらmainにマージ → sheep-arise.com に自動で本番反映される。

- 1つのPRは1つの目的に絞る（大きな改修と細かい修正を混ぜない）。
- コミットメッセージ・PRの説明は日本語でよい。何を・なぜ変えたかを書く。

## 構成

- 静的HTML（ビルドなし）: `index.html` / `about.html` / `service.html` / `contact.html`
  - CSSは各ページの `<style>` に直書き。共通CSSファイルはない。
  - **ヘッダー（`<nav id="nav">`）・フッター（`<footer>`）・Googleフォント・GA4タグは全4ページに同じものが複製されている**。どれかを変えたら4ページすべてに同じ変更を入れること。
- `vercel.json`: `cleanUrls`（`/about` で `about.html` を返す）
- `api/contact.js`: お問い合わせフォーム → Resendでメール送信（顧客自動返信＋管理者通知）＋ClaudeでAI返信ドラフト＋LINE通知
- `api/line-webhook.js`: LINE Bot（署名検証つき、Claudeで自動応答）

## 注意事項

- **APIキー等の秘密情報は絶対にコミットしない**（このリポジトリは公開）。キーはVercelの環境変数で管理:
  `RESEND_API_KEY` `ANTHROPIC_API_KEY` `LINE_CHANNEL_ACCESS_TOKEN` `LINE_CHANNEL_SECRET` `LINE_ADMIN_USER_ID` `ADMIN_EMAIL`
  環境変数の追加・変更はVercelの管理者に依頼する。
- `api/` を変更した場合、プレビューURLでフォーム送信を試すと**実際にメールとLINE通知が飛ぶ**。テスト送信時は件名や本文に「テスト」と明記する。
- GA4の計測ID（`G-84CFVPT4GM`）は変更しない。
- 自社プロダクト「Fits」は**工事業特化ではない**。中小零細企業・個人事業主・全業種向けの「必要な機能をオーダーメイドで追加できる業務管理プラットフォーム」として表現する。

## ローカル確認

ビルド不要。HTMLを直接ブラウザで開くか、`npx serve .` などで確認する。
`api/` まで含めて動かしたい場合は `vercel dev`（Vercelプロジェクトへのアクセス権が必要）。
