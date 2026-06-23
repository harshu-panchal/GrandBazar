import nodemailer from "nodemailer";
import logger from "./logger.js";

let cachedTransporter = null;

export function useRealEmailOTP() {
  return (
    process.env.USE_REAL_EMAIL_OTP === "true" ||
    process.env.USE_REAL_EMAIL_OTP === "1"
  );
}

function parseSmtpPort() {
  return parseInt(process.env.SMTP_PORT || "587", 10);
}

function parseSmtpSecure(port) {
  if (process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1") {
    return true;
  }

  if (process.env.SMTP_SECURE === "false" || process.env.SMTP_SECURE === "0") {
    return false;
  }

  return port === 465;
}

function getMailFrom() {
  const fromAddress = String(process.env.MAIL_FROM || "").trim();
  const fromName = String(process.env.MAIL_FROM_NAME || "").trim();

  if (!fromAddress) {
    const error = new Error("MAIL_FROM is required for email OTP delivery");
    error.statusCode = 500;
    throw error;
  }

  return fromName ? `${fromName} <${fromAddress}>` : fromAddress;
}

function getTransportConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = parseSmtpPort();
  const secure = parseSmtpSecure(port);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host) {
    const error = new Error("SMTP_HOST is required for email OTP delivery");
    error.statusCode = 500;
    throw error;
  }

  if (!Number.isFinite(port) || port <= 0) {
    const error = new Error("SMTP_PORT must be a valid number");
    error.statusCode = 500;
    throw error;
  }

  if ((user && !pass) || (!user && pass)) {
    const error = new Error("SMTP_USER and SMTP_PASS must be provided together");
    error.statusCode = 500;
    throw error;
  }

  return {
    host,
    port,
    secure,
    ...(user && pass
      ? {
        auth: {
          user,
          pass,
        },
      }
      : {}),
  };
}

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(getTransportConfig());
  }

  return cachedTransporter;
}

export async function sendSellerVerificationOtpEmail({
  email,
  otp,
  expiresInMinutes,
}) {
  if (!useRealEmailOTP()) {
    logger.info("Seller email OTP generated in mock mode", {
      email,
      otp,
      mode: "mock",
    });
    return {
      delivered: false,
      mode: "mock",
    };
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: getMailFrom(),
    to: email,
    subject: "Verify your seller signup email",
    text: `Your seller signup verification code is ${otp}. This code expires in ${expiresInMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a;">
        <p>Your seller signup verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otp}</p>
        <p>This code expires in ${expiresInMinutes} minutes.</p>
      </div>
    `,
  });

  return {
    delivered: true,
    mode: "real",
  };
}

export async function sendStaffWelcomeEmail({
  email,
  name,
  password,
  role,
}) {
  const transporter = getTransporter();
  const adminPanelLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/admin/auth`;

  const formattedRole = role ? (role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()) : "Staff";
  const lowercaseRole = role ? role.toLowerCase() : "staff";

  await transporter.sendMail({
    from: getMailFrom(),
    to: email,
    subject: `Congratulations! Your Zinto ${formattedRole} Account has been Created`,
    text: `Hello ${name},\n\nCongratulations! Your ${lowercaseRole} account has been created successfully.\n\nHere are your login credentials:\nEmail: ${email}\nPassword: ${password}\n\nLogin to the admin panel at: ${adminPanelLink}\n\nBest regards,\nZinto Team`,
    html: `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0; font-size: 24px; font-weight: 800;">Zinto Admin Center</h2>
        </div>
        <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.5; color: #475569;">
          Congratulations! Your ${lowercaseRole} account has been successfully created. You have been assigned the role of <strong style="text-transform: capitalize; color: #4f46e5;">${role}</strong>.
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.05em;">Your Login Credentials</h3>
          <p style="margin: 8px 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 8px 0; font-size: 14px;"><strong>Password:</strong> <span style="font-family: monospace; background-color: #cbd5e1; padding: 2px 6px; border-radius: 4px;">${password}</span></p>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${adminPanelLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 30px; border-radius: 8px; font-weight: 700; text-decoration: none; display: inline-block;">Login to Admin Panel</a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Please secure your password. If you did not request this, please contact your system administrator immediately.
        </p>
      </div>
    `,
  });

  return {
    delivered: true,
  };
}

export async function sendSellerStaffWelcomeEmail({
  email,
  name,
  password,
  role,
  shopName,
}) {
  const transporter = getTransporter();
  const sellerPanelLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/seller`;

  const formattedRole = role ? (role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()) : "Staff";
  const lowercaseRole = role ? role.toLowerCase() : "staff";

  await transporter.sendMail({
    from: getMailFrom(),
    to: email,
    subject: `Congratulations! Your Zinto Seller ${formattedRole} Account for ${shopName || "Store"} has been Created`,
    text: `Hello ${name},\n\nCongratulations! Your ${lowercaseRole} account for ${shopName || "our store"} has been created successfully.\n\nHere are your login credentials:\nEmail: ${email}\nPassword: ${password}\n\nLogin to the seller panel at: ${sellerPanelLink}\n\nBest regards,\n${shopName || "Zinto"} Team`,
    html: `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0; font-size: 24px; font-weight: 800;">${shopName || "Zinto Store"} Console</h2>
        </div>
        <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.5; color: #475569;">
          Congratulations! Your ${lowercaseRole} account has been successfully created for <strong>${shopName || "our store"}</strong>. You have been assigned the role of <strong style="text-transform: capitalize; color: #4f46e5;">${role}</strong>.
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.05em;">Your Login Credentials</h3>
          <p style="margin: 8px 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 8px 0; font-size: 14px;"><strong>Password:</strong> <span style="font-family: monospace; background-color: #cbd5e1; padding: 2px 6px; border-radius: 4px;">${password}</span></p>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${sellerPanelLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 30px; border-radius: 8px; font-weight: 700; text-decoration: none; display: inline-block;">Login to Seller Panel</a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Please secure your password. If you did not request this, please contact your store owner immediately.
        </p>
      </div>
    `,
  });

  return {
    delivered: true,
  };
}

export function __resetEmailTransportForTests() {
  cachedTransporter = null;
}
