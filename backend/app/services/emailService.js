import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER || process.env.EMAIL_FROM || "";
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || "";
    const secure = process.env.SMTP_SECURE === "true" || port === 465;

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends welcome email with credentials and portal link to a newly created/approved seller.
 * @param {Object} params
 * @param {String} params.email - Seller email
 * @param {String} params.name - Seller name
 * @param {String} [params.password] - Generated/set password (if newly created)
 * @param {String} [params.storeName] - Shop name
 * @returns {Promise<Object>}
 */
export async function sendVendorWelcomeEmail({ email, name, password, storeName }) {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@grandbazar.com";
  const appLink = process.env.SELLER_PORTAL_URL || process.env.FRONTEND_URL || "https://grandbazar.com/seller";

  const passwordBlock = password
    ? `<p><strong>Temporary Password:</strong> <code>${password}</code></p>
       <p><em>Please change your password after logging in for security.</em></p>`
    : `<p>Use your registered password to log in.</p>`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2563eb; margin-top: 0;">Welcome to GrandBazar Seller Network!</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>Your seller account ${storeName ? `for <strong>${storeName}</strong>` : ''} has been created and approved on GrandBazar.</p>
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #2563eb;">
        <p style="margin: 0 0 8px 0;"><strong>Portal Login Email:</strong> ${email}</p>
        ${passwordBlock}
      </div>
      <p style="margin-top: 25px;">
        <a href="${appLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Access Seller Dashboard
        </a>
      </p>
      <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
        Or copy and paste this link into your browser: <br/>
        <a href="${appLink}" style="color: #2563eb;">${appLink}</a>
      </p>
    </div>
  `;

  try {
    const mailOptions = {
      from: `GrandBazar Platform <${fromEmail}>`,
      to: email,
      subject: "Welcome to GrandBazar — Your Seller Credentials & Access Link",
      html: htmlContent,
    };

    if (!process.env.SMTP_USER && !process.env.EMAIL_FROM) {
      console.log("[emailService] Mocking Vendor Email Dispatch (No SMTP Configured):", {
        to: email,
        subject: mailOptions.subject,
        password: password || "(already set)",
        portalLink: appLink,
      });
      return { success: true, mocked: true };
    }

    const info = await getTransporter().sendMail(mailOptions);
    console.log("[emailService] Vendor onboarding email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[emailService] Failed to send vendor onboarding email:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Checks if real SMTP should be used for OTP dispatch.
 */
export function useRealEmailOTP() {
  return (
    String(process.env.USE_REAL_EMAIL_OTP || "false").toLowerCase() === "true" ||
    Boolean(process.env.SMTP_USER || process.env.EMAIL_FROM)
  );
}

/**
 * Sends OTP email for password reset.
 */
export async function sendPasswordResetOtpEmail({ email, otp, name, role = "user" }) {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@grandbazar.com";
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2563eb; margin-top: 0;">Password Reset Verification Code</h2>
      <p>Hello ${name ? `<strong>${name}</strong>` : 'there'},</p>
      <p>You requested to reset your password on GrandBazar. Use the following OTP code to complete your password reset:</p>
      <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; color: #1e293b; margin: 20px 0;">
        ${otp}
      </div>
      <p style="color: #64748b; font-size: 13px;">This code will expire in 5 minutes. If you did not request a password reset, please ignore this email.</p>
    </div>
  `;

  if (!useRealEmailOTP()) {
    console.log(`[emailService] Mocking Password Reset OTP for ${email}: ${otp}`);
    return { success: true, mocked: true };
  }

  try {
    const mailOptions = {
      from: `GrandBazar Platform <${fromEmail}>`,
      to: email,
      subject: `Your GrandBazar Password Reset OTP: ${otp}`,
      html: htmlContent,
    };
    const info = await getTransporter().sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[emailService] Failed to send OTP email:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sends welcome email to newly created admin staff member (accountant/assistant).
 */
export async function sendStaffWelcomeEmail({ email, name, password, role }) {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@grandbazar.com";
  const appLink = process.env.ADMIN_PORTAL_URL || process.env.FRONTEND_URL || "https://grandbazar.com/admin";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2563eb; margin-top: 0;">Welcome to GrandBazar Admin Team!</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>Your administrative staff account (${role}) has been created on GrandBazar.</p>
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #2563eb;">
        <p style="margin: 0 0 8px 0;"><strong>Admin Login Email:</strong> ${email}</p>
        <p style="margin: 0 0 8px 0;"><strong>Role:</strong> ${role}</p>
        <p style="margin: 0;"><strong>Temporary Password:</strong> <code>${password}</code></p>
      </div>
      <p style="margin-top: 25px;">
        <a href="${appLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Access Admin Dashboard
        </a>
      </p>
    </div>
  `;

  if (!useRealEmailOTP()) {
    console.log(`[emailService] Mocking Staff Email Dispatch for ${email}`);
    return { success: true, mocked: true };
  }

  try {
    const mailOptions = {
      from: `GrandBazar Admin Platform <${fromEmail}>`,
      to: email,
      subject: "Welcome to GrandBazar Admin Team — Credentials & Access",
      html: htmlContent,
    };
    const info = await getTransporter().sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[emailService] Failed to send staff welcome email:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sends seller signup / verification OTP email.
 */
export async function sendSellerVerificationOtpEmail({ email, otp, name }) {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@grandbazar.com";
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2563eb; margin-top: 0;">Seller Verification OTP</h2>
      <p>Hello ${name ? `<strong>${name}</strong>` : 'there'},</p>
      <p>Thank you for registering on GrandBazar Seller Portal. Your verification OTP code is:</p>
      <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; color: #1e293b; margin: 20px 0;">
        ${otp}
      </div>
      <p style="color: #64748b; font-size: 13px;">This code will expire in 5 minutes.</p>
    </div>
  `;

  if (!useRealEmailOTP()) {
    console.log(`[emailService] Mocking Seller Verification OTP for ${email}: ${otp}`);
    return { success: true, mocked: true };
  }

  try {
    const mailOptions = {
      from: `GrandBazar Seller Network <${fromEmail}>`,
      to: email,
      subject: `GrandBazar Seller Verification OTP: ${otp}`,
      html: htmlContent,
    };
    const info = await getTransporter().sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[emailService] Failed to send seller verification OTP email:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sends a pre-application invite to a prospective seller — before any
 * Seller account exists. Distinct from sendVendorWelcomeEmail, which is the
 * post-approval credentials email.
 */
export async function sendSellerInviteEmail({ email, inviteLink }) {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@grandbazar.com";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2563eb; margin-top: 0;">You're invited to sell on GrandBazar</h2>
      <p>Hello,</p>
      <p>The GrandBazar team would like to invite you to become a seller on our platform. Click below to start your application — it only takes a few minutes.</p>
      <p style="margin-top: 25px;">
        <a href="${inviteLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Start Your Application
        </a>
      </p>
      <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
        Or copy and paste this link into your browser: <br/>
        <a href="${inviteLink}" style="color: #2563eb;">${inviteLink}</a>
      </p>
      <p style="color: #94a3b8; font-size: 11px; margin-top: 20px;">This invite link expires in 14 days.</p>
    </div>
  `;

  try {
    const mailOptions = {
      from: `GrandBazar Platform <${fromEmail}>`,
      to: email,
      subject: "You're invited to sell on GrandBazar",
      html: htmlContent,
    };

    if (!process.env.SMTP_USER && !process.env.EMAIL_FROM) {
      console.log("[emailService] Mocking Seller Invite Email Dispatch (No SMTP Configured):", {
        to: email,
        inviteLink,
      });
      return { success: true, mocked: true };
    }

    const info = await getTransporter().sendMail(mailOptions);
    console.log("[emailService] Seller invite email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[emailService] Failed to send seller invite email:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sends welcome email to sub-seller staff / assistant member.
 */
export async function sendSellerStaffWelcomeEmail({ email, name, password, storeName, roleTitle }) {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@grandbazar.com";
  const appLink = process.env.SELLER_PORTAL_URL || process.env.FRONTEND_URL || "https://grandbazar.com/seller";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2563eb; margin-top: 0;">Welcome to ${storeName || 'GrandBazar Seller'} Team!</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>You have been added as a team member (${roleTitle || 'Assistant'}) for <strong>${storeName || 'Store'}</strong>.</p>
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #2563eb;">
        <p style="margin: 0 0 8px 0;"><strong>Login Email:</strong> ${email}</p>
        <p style="margin: 0;"><strong>Temporary Password:</strong> <code>${password}</code></p>
      </div>
      <p style="margin-top: 25px;">
        <a href="${appLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Access Seller Dashboard
        </a>
      </p>
    </div>
  `;

  if (!useRealEmailOTP()) {
    console.log(`[emailService] Mocking Seller Staff Welcome Email for ${email}`);
    return { success: true, mocked: true };
  }

  try {
    const mailOptions = {
      from: `GrandBazar Seller Platform <${fromEmail}>`,
      to: email,
      subject: `Welcome to ${storeName || 'Store'} on GrandBazar — Your Login Credentials`,
      html: htmlContent,
    };
    const info = await getTransporter().sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[emailService] Failed to send seller staff welcome email:", error.message);
    return { success: false, error: error.message };
  }
}
