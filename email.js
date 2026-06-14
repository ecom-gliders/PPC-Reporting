const nodemailer = require('nodemailer');
const db = require('./db');

function getTransport() {
  const settings = db.getSettings();
  const { smtpHost, smtpPort, smtpUser, smtpPass } = settings;
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) return null;

  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: Number(smtpPort) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
}

function formatDateLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function buildWeeklyReportEmailHtml({ clientName, from, to, totalChanges, asinCount, reportUrl }) {
  return `
  <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 32px 16px; margin: 0;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
      <div style="background: linear-gradient(135deg, #f97316, #fb923c); padding: 28px 32px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: 0.3px;">📊 PPC Change History</h1>
        <p style="margin: 6px 0 0; color: #fff7ed; font-size: 13px;">Weekly Optimization Report</p>
      </div>
      <div style="padding: 32px;">
        <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Your weekly PPC report from EcomGliders is ready! 🚀</h2>
        <p style="margin: 0 0 20px; font-size: 14px; color: #64748b; line-height: 1.6;">
          Hi <strong>${clientName}</strong>, the optimization summary for <strong>${formatDateLong(from)} – ${formatDateLong(to)}</strong> has been generated and is now available in your dashboard.
        </p>
        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <div style="flex: 1; background: #fff7ed; border-radius: 12px; padding: 14px; text-align: center;">
            <div style="font-size: 24px; font-weight: 800; color: #ea580c;">${totalChanges}</div>
            <div style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px;">Total Changes</div>
          </div>
          <div style="flex: 1; background: #eff6ff; border-radius: 12px; padding: 14px; text-align: center;">
            <div style="font-size: 24px; font-weight: 800; color: #2563eb;">${asinCount}</div>
            <div style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px;">ASINs Touched</div>
          </div>
        </div>
        <div style="text-align: center;">
          <a href="${reportUrl}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px;">View Full Report</a>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 18px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">This is an automated email from EcomGliders PPC Change History Dashboard.</p>
      </div>
    </div>
  </div>`;
}

async function sendWeeklyReportEmail({ to, clientName, from, to: toDate, totalChanges, asinCount, reportUrl }) {
  const transport = getTransport();
  if (!transport || !to) return { sent: false };

  const settings = db.getSettings();
  const html = buildWeeklyReportEmailHtml({ clientName, from, to: toDate, totalChanges, asinCount, reportUrl });

  await transport.sendMail({
    from: settings.smtpFrom || settings.smtpUser,
    to,
    subject: `Your Weekly PPC Report from EcomGliders is Ready ✅`,
    html,
  });

  return { sent: true };
}

module.exports = { sendWeeklyReportEmail, getTransport };
