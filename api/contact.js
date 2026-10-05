import { Resend } from 'resend'
import Anthropic from '@anthropic-ai/sdk'

const resend = new Resend(process.env.RESEND_API_KEY)
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 通知を受け取る管理者メール（新しいGmailをVercelの環境変数 ADMIN_EMAIL に設定）
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'shota3408@gmail.com'
// 送信元（Resendで sheep-arise.com のドメイン認証が必要）
// info@ は届け先グループ(ADMIN_EMAIL)と同一のため、自己宛送信を避けて noreply@ から送信する
const FROM = 'SheepArise <noreply@sheep-arise.com>'

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function validateInput({ name, email, message }) {
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 100)
    return 'お名前を正しく入力してください'
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return 'メールアドレスを正しく入力してください'
  if (!message || typeof message !== 'string' || message.trim().length < 1 || message.length > 5000)
    return 'お問い合わせ内容を入力してください（5000文字以内）'
  return null
}

function generateInquiryId() {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `SA-${ymd}-${rand}`
}

async function generateReplyDraft({ name, company, message }) {
  try {
    const res = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `あなたは合同会社SheepAriseの担当者です。
SheepAriseは中小零細企業・個人事業主向けに、BPR（業務改革）・DXコンサルティングと、
オーダーメイドの業務管理プラットフォーム「Fits」を提供しています。

お問い合わせへの返信ドラフトを日本語で作成してください。
- 丁寧かつ親しみやすいトーンで
- お問い合わせ内容に具体的に触れる
- 次のアクション（詳細をメールでお伺いするなど）を提案する
- やりとりはすべてメールで行う旨を自然に伝える
- 署名は不要（後で追加するため）
- 300文字以内`,
      messages: [{
        role: 'user',
        content: `お名前: ${name}\n会社名: ${company || '未記入'}\nお問い合わせ内容: ${message}`,
      }],
    })
    return res.content[0].text
  } catch (err) {
    console.error('[contact] draft generation failed', err)
    return '（AI返信ドラフトの生成に失敗しました。お手数ですが手動でご返信ください。）'
  }
}

async function sendLineToAdmin(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const adminUserId = process.env.LINE_ADMIN_USER_ID
  if (!token || !adminUserId) return

  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: adminUserId,
        messages: [{ type: 'text', text }],
      }),
    })
  } catch (err) {
    console.error('[contact] LINE notify failed', err)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  try {
    const { name, company, email, plan, message } = req.body || {}

    const validationError = validateInput({ name, email, message })
    if (validationError) return res.status(400).json({ ok: false, error: validationError })

    const safeName    = escapeHtml(name.trim().slice(0, 100))
    const safeCompany = escapeHtml((company || '').trim().slice(0, 100))
    const safeEmail   = email.trim().slice(0, 254)
    const safePlan    = escapeHtml((plan || '').slice(0, 50))
    const safeMessage = escapeHtml(message.trim().slice(0, 5000))

    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    const inquiryId = generateInquiryId()

    // AI返信ドラフト生成 ＋ 顧客への自動返信を並列実行
    const [draft, customerRes] = await Promise.all([
      generateReplyDraft({ name: safeName, company: safeCompany, message: safeMessage }),

      // 自動返信メール（顧客へ）
      resend.emails.send({
        from: FROM,
        to: safeEmail,
        replyTo: ADMIN_EMAIL,
        subject: '【SheepArise】お問い合わせを受け付けました',
        html: `
<div style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;max-width:600px;margin:0 auto;background:#fbfaf8;color:#1a1a1a;padding:40px;border:1px solid #e6e4df;border-radius:4px">
  <h1 style="font-size:20px;letter-spacing:.08em;margin:0 0 4px;color:#1a1a1a">SheepArise</h1>
  <p style="color:#888;font-size:12px;margin:0 0 28px;letter-spacing:.05em">BPR・DXコンサルティング ／ 業務管理プラットフォーム Fits</p>
  <h2 style="font-size:18px;margin:0 0 16px;font-weight:500">${safeName} 様</h2>
  <p style="line-height:1.9;margin:0 0 8px;font-size:14px">お問い合わせいただきありがとうございます。</p>
  <p style="line-height:1.9;margin:0 0 16px;font-size:14px">内容を確認のうえ、2営業日以内にメールにてご連絡いたします。</p>
  <div style="background:#fff;border:1px solid #e6e4df;border-radius:4px;padding:16px;margin-bottom:16px;font-size:13px;color:#555">
    <p style="margin:0 0 4px"><b style="color:#1a1a1a">お問い合わせID：</b><span style="font-weight:bold">${inquiryId}</span></p>
    <p style="margin:0;font-size:12px;color:#888">※ ご返信の際にこのIDをお知らせいただくとスムーズです。</p>
  </div>
  <div style="background:#fff;border:1px solid #e6e4df;border-radius:4px;padding:20px;margin-bottom:24px;font-size:14px;color:#555">
    <p style="margin:0 0 8px"><b style="color:#1a1a1a">お問い合わせ内容：</b></p>
    <p style="margin:0;white-space:pre-wrap;line-height:1.8">${safeMessage}</p>
  </div>
  <p style="line-height:1.9;color:#555;font-size:14px">ご不明な点はこのメールへのご返信にてお気軽にご連絡ください。</p>
  <hr style="border:none;border-top:1px solid #e6e4df;margin:24px 0">
  <p style="color:#888;font-size:12px;margin:0">合同会社SheepArise｜${ADMIN_EMAIL}｜<a href="https://sheep-arise.com" style="color:#1a1a1a">sheep-arise.com</a></p>
</div>`,
      }),
    ])

    if (customerRes?.error) {
      console.error('[contact] customer email error', customerRes.error)
      return res.status(502).json({ ok: false, error: `メール送信失敗(customer): ${customerRes.error.message || customerRes.error.name || 'unknown error'}` })
    }

    // 管理者への通知メール（AI返信ドラフト付き）
    const adminRes = await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      replyTo: safeEmail,
      subject: `【新規問い合わせ】${inquiryId} ${safeName}様${safeCompany ? `（${safeCompany}）` : ''}`,
      html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fbfaf8;color:#1a1a1a;padding:40px;border:1px solid #e6e4df;border-radius:4px">
  <h1 style="font-size:20px;letter-spacing:.08em;margin:0 0 4px">SheepArise</h1>
  <p style="color:#888;font-size:12px;margin:0 0 28px">新規お問い合わせ通知</p>
  <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 20px">新しいお問い合わせが届きました</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
    <tr><td style="padding:10px 16px;background:#fff;border:1px solid #e6e4df;color:#888;width:120px">問い合わせID</td><td style="padding:10px 16px;background:#fff;border:1px solid #e6e4df;font-weight:bold">${inquiryId}</td></tr>
    <tr><td style="padding:10px 16px;border:1px solid #e6e4df;color:#888">お名前</td><td style="padding:10px 16px;border:1px solid #e6e4df">${safeName}</td></tr>
    <tr><td style="padding:10px 16px;background:#fff;border:1px solid #e6e4df;color:#888">会社名</td><td style="padding:10px 16px;background:#fff;border:1px solid #e6e4df">${safeCompany || '未記入'}</td></tr>
    <tr><td style="padding:10px 16px;border:1px solid #e6e4df;color:#888">メール</td><td style="padding:10px 16px;border:1px solid #e6e4df"><a href="mailto:${safeEmail}" style="color:#1a1a1a">${safeEmail}</a></td></tr>
    <tr><td style="padding:10px 16px;background:#fff;border:1px solid #e6e4df;color:#888">受信日時</td><td style="padding:10px 16px;background:#fff;border:1px solid #e6e4df">${now}</td></tr>
  </table>
  <div style="background:#fff;border:1px solid #e6e4df;border-radius:4px;padding:20px;margin-bottom:24px">
    <p style="color:#888;font-size:12px;margin:0 0 8px">【お問い合わせ内容】</p>
    <p style="margin:0;white-space:pre-wrap;font-size:14px;line-height:1.8">${safeMessage}</p>
  </div>
  <div style="background:#f4f6f2;border:1px solid #d6e0cf;border-radius:4px;padding:20px;margin-bottom:24px">
    <p style="color:#5a7a4a;font-size:12px;font-weight:bold;margin:0 0 8px">AI返信ドラフト（そのまま使えます）</p>
    <p style="margin:0;white-space:pre-wrap;font-size:14px;line-height:1.9">${escapeHtml(draft)}</p>
  </div>
  <p style="color:#a07b2a;font-size:13px;margin:0 0 16px">↑ このドラフトを参考に、2営業日以内にメールで返信してください。</p>
  <a href="mailto:${safeEmail}?subject=Re: お問い合わせありがとうございます [${inquiryId}]&body=${encodeURIComponent(draft)}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:bold;font-size:14px">メールで返信する →</a>
</div>`,
    })

    if (adminRes?.error) {
      console.error('[contact] admin email error', adminRes.error)
      return res.status(502).json({ ok: false, error: `メール送信失敗(admin): ${adminRes.error.message || adminRes.error.name || 'unknown error'}` })
    }

    // LINE通知（管理者へ直接送信）
    const lineText = `📩 新規問い合わせ [${inquiryId}]

お名前: ${safeName}${safeCompany ? `\n会社名: ${safeCompany}` : ''}
メール: ${safeEmail}

【内容】
${safeMessage}

【AIドラフト】
${draft}`

    await sendLineToAdmin(lineText)

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[contact]', err)
    return res.status(500).json({ ok: false, error: 'お問い合わせの送信に失敗しました。時間をおいて再度お試しください。' })
  }
}
