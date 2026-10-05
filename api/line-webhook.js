import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'

export const config = { api: { bodyParser: false } }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function verifySignature(rawBody, signature, secret) {
  const hash = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64')
  return hash === signature
}

async function replyMessage(replyToken, text) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })
}

async function generateReply(userMessage) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: `あなたは合同会社SheepAriseのサポートアシスタントです。
SheepAriseは中小零細企業・個人事業主向けに、BPR（業務改革）・DXコンサルティングと、
オーダーメイドの業務管理プラットフォーム「Fits」を提供するLINE公式アカウントです。

【サービス内容】
- BPR・DXコンサルティング：業務フローの可視化・改善、デジタル化の伴走支援
- Fits：必要な機能をオーダーメイドで追加できる業務管理プラットフォーム。
  顧客管理・案件管理・勤怠・請求など、業種を問わず必要な機能だけを組み合わせて導入できます。
- 対象：中小零細企業・個人事業主・全業種（工事業など特定業種に限定しません）

【対応方針】
- 丁寧かつ簡潔に返答する
- 具体的な料金・期間・要件は会社により異なるため、確定的な金額は答えず「お見積りはご相談ください」と案内する
- サービス内容・進め方の一般的な質問には誠実に答える
- 詳しい相談・お見積りはウェブサイトのお問い合わせフォームへ案内する
- 返答は200文字以内に収める
- URLは括弧なしで改行して記載:
https://sheep-arise.com/contact`,
    messages: [{ role: 'user', content: userMessage }],
  })
  let text = response.content[0].text
  text = text.replace(/[（(](https?:\/\/[^\s）)]+)[）)]/g, '\n$1')
  return text
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const signature = req.headers['x-line-signature']

  if (!verifySignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const body = JSON.parse(rawBody)
  const events = body.events || []

  await Promise.all(
    events
      .filter(e => e.type === 'message' && e.message.type === 'text')
      .map(async (event) => {
        try {
          // 管理者向け：自分のユーザーIDを確認するコマンド（LINE_ADMIN_USER_IDの設定に使う）
          if (event.message.text.trim().toLowerCase() === 'myid') {
            await replyMessage(event.replyToken, `あなたのLINEユーザーIDは:\n${event.source.userId}`)
            return
          }
          const reply = await generateReply(event.message.text)
          await replyMessage(event.replyToken, reply)
        } catch (err) {
          console.error('LINE reply error:', err)
          await replyMessage(event.replyToken, 'ただいまシステムの調整中です。お手数ですが、ウェブサイトのお問い合わせフォームからご連絡ください。\nhttps://sheep-arise.com/contact')
        }
      })
  )

  res.status(200).json({ ok: true })
}
