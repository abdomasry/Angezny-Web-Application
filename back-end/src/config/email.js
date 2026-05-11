const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SENDER_NAME = process.env.BREVO_SENDER_NAME || "خدمات الحرفيين";
const SENDER_EMAIL = process.env.EMAIL_USER;

async function sendViaBrevo({ to, subject, html }) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is not set");
  }
  if (!SENDER_EMAIL) {
    throw new Error("EMAIL_USER (sender) is not set");
  }

  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${errBody}`);
  }
  return res.json();
}

const sendVerificationEmail = async (toEmail, code) => {
  return sendViaBrevo({
    to: toEmail,
    subject: "كود تفعيل الحساب",
    html: `
      <div style="font-family: Arial, sans-serif; text-align: center; padding: 40px; direction: rtl;">
        <h2>مرحباً بك في خدمات الحرفيين</h2>
        <p>كود تفعيل حسابك هو:</p>
        <div style="
          font-size: 36px;
          font-weight: bold;
          letter-spacing: 8px;
          color: #148F77;
          background: #f0fdf4;
          padding: 20px 40px;
          border-radius: 12px;
          display: inline-block;
          margin: 20px 0;
        ">
          ${code}
        </div>
        <p>استخدم الكود لتأكيد حسابك: <a href="${process.env.BASE_URL}/verify-email" style="color: #148F77; text-decoration: underline;">تأكيد الحساب</a></p>
        <p style="color: #666;">هذا الكود صالح لمدة 10 دقائق فقط</p>
      </div>
    `,
  });
};

const sendPasswordResetEmail = async (toEmail, resetToken) => {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

  return sendViaBrevo({
    to: toEmail,
    subject: "إعادة تعيين كلمة المرور",
    html: `
      <div style="font-family: Arial, sans-serif; text-align: center; padding: 40px; direction: rtl;">
        <h2 style="color: #121c2a;">طلب إعادة تعيين كلمة المرور</h2>
        <p style="color: #3e4947; line-height: 1.6;">
          استلمنا طلباً لإعادة تعيين كلمة المرور لحسابك.<br/>
          إذا كنت أنت من قام بهذا الطلب، اضغط على الرابط أدناه لإنشاء كلمة مرور جديدة.
        </p>
        <a href="${resetLink}" style="
          display: inline-block;
          background: #005c55;
          color: #ffffff;
          padding: 14px 32px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: bold;
          margin: 24px 0;
          font-size: 16px;
        ">
          إعادة تعيين كلمة المرور
        </a>
        <p style="color: #666; font-size: 13px;">
          هذا الرابط صالح لمدة ساعة واحدة فقط.<br/>
          إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان.
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 32px; word-break: break-all;">
          إن لم يعمل الزر أعلاه، انسخ الرابط التالي:<br/>
          <span style="color: #005c55;">${resetLink}</span>
        </p>
      </div>
    `,
  });
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
