import nodemailer from "nodemailer";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private config: EmailConfig | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    // Use environment variables for email configuration
    const emailConfig = {
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER || "",
        pass: process.env.EMAIL_PASS || "", // Use app password for Gmail
      },
    };

    if (emailConfig.auth.user && emailConfig.auth.pass) {
      this.config = emailConfig;
      this.transporter = nodemailer.createTransport(emailConfig);
    }
  }

  private getWalletCreationTemplate(
    email: string,
    verificationUrl: string,
  ): EmailTemplate {
    return {
      subject: "🎉 Welcome to Amach Health - You're In!",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Amach Health</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 20%, #f3e8ff 40%, #e0f2fe 60%, #d1fae5 80%, #a7f3d0 100%); }
            .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); }
            .header { background: linear-gradient(135deg, #064e3b 0%, #065f46 25%, #047857 50%, #059669 75%, #10b981 100%); color: white; padding: 60px 40px; text-align: center; position: relative; overflow: hidden; }
            .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="white" opacity="0.08"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.08"/><circle cx="50" cy="10" r="0.5" fill="white" opacity="0.04"/><circle cx="10" cy="60" r="0.8" fill="white" opacity="0.06"/><circle cx="90" cy="40" r="0.6" fill="white" opacity="0.05"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>'); opacity: 0.4; }
            .header::after { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); animation: shimmer 8s ease-in-out infinite; }
            @keyframes shimmer { 0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.3; } 50% { transform: rotate(180deg) scale(1.1); opacity: 0.1; } }
            .header-content { position: relative; z-index: 2; }
            .header h1 { margin: 0; font-size: 36px; font-weight: 900; letter-spacing: -0.025em; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
            .header .tagline { margin: 16px 0 0 0; font-size: 18px; font-weight: 300; opacity: 0.95; letter-spacing: 0.05em; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }
            .content { padding: 50px 40px; }
            .content h2 { color: #064e3b; font-size: 28px; font-weight: 800; margin: 0 0 24px 0; letter-spacing: -0.025em; }
            .content p { margin: 0 0 24px 0; font-size: 18px; font-weight: 400; color: #92400e; line-height: 1.7; }
            .highlight-box { background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 1px solid #bbf7d0; border-radius: 12px; padding: 32px; margin: 40px 0; position: relative; }
            .highlight-box::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #059669 0%, #10b981 100%); border-radius: 12px 12px 0 0; }
            .highlight-box h3 { color: #064e3b; margin: 0 0 16px 0; font-size: 20px; font-weight: 700; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; text-decoration: none; padding: 18px 36px; border-radius: 12px; font-weight: 700; font-size: 16px; margin: 24px 0; transition: all 0.3s ease; box-shadow: 0 4px 14px 0 rgba(5, 150, 105, 0.3); }
            .cta-button:hover { transform: translateY(-3px); box-shadow: 0 8px 25px 0 rgba(5, 150, 105, 0.4); }
            .steps { margin: 40px 0; }
            .step { display: flex; align-items: flex-start; margin: 24px 0; padding: 24px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; border-left: 4px solid #059669; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); }
            .step-number { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; margin-right: 20px; flex-shrink: 0; font-size: 14px; }
            .step-content h4 { margin: 0 0 8px 0; color: #064e3b; font-size: 18px; font-weight: 700; }
            .step-content p { margin: 0; font-size: 16px; color: #92400e; font-weight: 400; line-height: 1.6; }
            .footer { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 40px; text-align: center; border-top: 1px solid #e2e8f0; }
            .footer p { margin: 0; font-size: 14px; color: #92400e; font-weight: 400; }
            .footer a { color: #059669; text-decoration: none; font-weight: 500; transition: color 0.3s ease; }
            .footer a:hover { color: #047857; }
            .beta-badge { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 24px 32px; margin: 40px 0; text-align: center; position: relative; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15); border: 2px solid #fbbf24; }
            .beta-badge h3 { color: #92400e; margin: 0 0 8px 0; font-size: 18px; font-weight: 800; }
            .beta-badge p { color: #92400e; margin: 0; font-weight: 500; font-size: 15px; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="header-content">
                <h1>Amach Health</h1>
                <p class="tagline">Driven by Data, Guided by Nature</p>
              </div>
            </div>
            
            <div class="content">
              <h2>🎉 You're In! Welcome to the Beta</h2>
              
              <p>Your email has been whitelisted for early access to Amach Health. You're joining a small group of beta testers helping build the future of health data sovereignty.</p>
              
              <div class="highlight-box">
                <h3>🚀 What You Get</h3>
                <p>Access to our AI-powered health insights platform, permanent encrypted profile on ZKsync, and the opportunity to shape the product as we build it.</p>
              </div>
              
              <div class="beta-badge">
                <h3>🌱 Beta Testers = Founding Members</h3>
                <p>Beta testers will be recognized as founding members when we launch on mainnet. Your feedback today shapes what we build tomorrow.</p>
              </div>
              
              <div class="steps">
                <div class="step">
                  <div class="step-number">1</div>
                  <div class="step-content">
                    <h4>Connect Your Wallet</h4>
                    <p>Use ZKsync SSO to create your wallet and encrypted profile</p>
                  </div>
                </div>
                
                <div class="step">
                  <div class="step-number">2</div>
                  <div class="step-content">
                    <h4>Upload Your Health Data</h4>
                    <p>Import Apple Health data and upload PDFs (lab results, prescriptions)</p>
                  </div>
                </div>
                
                <div class="step">
                  <div class="step-number">3</div>
                  <div class="step-content">
                    <h4>Chat With AI</h4>
                    <p>Ask questions about your health data and get personalized insights</p>
                  </div>
                </div>
                
                <div class="step">
                  <div class="step-number">4</div>
                  <div class="step-content">
                    <h4>Give Feedback</h4>
                    <p>Tell us what works, what doesn't, and what you want to see next</p>
                  </div>
                </div>
              </div>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="${verificationUrl}" class="cta-button">Get Started →</a>
              </div>
              
              <p><strong>What to Expect (Honest Truth):</strong></p>
              <p>This is beta software. The AI insights work great. Your data currently lives in your browser (not permanent yet - we're building encrypted cloud storage now). Permanent storage with Storj is in active development.</p>
              
              <p>You're not just a user - you're a co-builder. Your feedback directly influences what gets prioritized.</p>
              
              <p><strong>Questions or feedback?</strong><br>
              Email me directly: <a href="mailto:amachhealth@gmail.com">amachhealth@gmail.com</a><br>
              I read every message and respond personally.</p>
              
              <p>Welcome to Amach,<br>
              <strong>The Amach Health Team</strong></p>
            </div>
            
            <div class="footer">
              <p>This email was sent because you were whitelisted for Amach Health beta access.</p>
              <p>© 2025 Amach Health.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Welcome to Amach Health - You're In!

🎉 You're In! Welcome to the Beta

Your email has been whitelisted for early access to Amach Health. You're joining a small group of beta testers helping build the future of health data sovereignty.

🚀 What You Get
Access to our AI-powered health insights platform, permanent encrypted profile on ZKsync, and the opportunity to shape the product as we build it.

🌱 Beta Testers = Founding Members
Beta testers will be recognized as founding members when we launch on mainnet. Your feedback today shapes what we build tomorrow.

Getting Started:

1. Connect Your Wallet
   Use ZKsync SSO to create your wallet and encrypted profile

2. Upload Your Health Data
   Import Apple Health data and upload PDFs (lab results, prescriptions)

3. Chat With AI
   Ask questions about your health data and get personalized insights

4. Give Feedback
   Tell us what works, what doesn't, and what you want to see next

Get Started: ${verificationUrl}

What to Expect (Honest Truth):
This is beta software. The AI insights work great. Your data currently lives in your browser (not permanent yet - we're building encrypted cloud storage now). Permanent storage with Storj is in active development.

You're not just a user - you're a co-builder. Your feedback directly influences what gets prioritized.

Questions or feedback?
Email me directly: amachhealth@gmail.com
I read every message and respond personally.

Welcome to Amach,
The Amach Health Team

---

This email was sent because you were whitelisted for Amach Health beta access.
© 2025 Amach Health.
      `,
    };
  }

  async sendWalletCreationEmail(
    email: string,
    verificationUrl?: string,
  ): Promise<boolean> {
    if (!this.transporter || !this.config) {
      console.error(
        "Email service not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.",
      );
      console.error(
        "For Gmail: Use an App Password, not your regular password. Enable 2FA first.",
      );
      return false;
    }

    try {
      const defaultUrl =
        process.env.NEXT_PUBLIC_VERIFICATION_URL || "http://localhost:3000";
      const url = verificationUrl || defaultUrl;

      const template = this.getWalletCreationTemplate(email, url);

      const mailOptions = {
        from: `"Amach Health" <${this.config.auth.user}>`,
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`Wallet creation email sent to ${email}:`, result.messageId);
      return true;
    } catch (error) {
      console.error("Failed to send wallet creation email:", error);

      // Provide specific guidance for common errors
      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "EAUTH") {
          console.error("Authentication failed. Please check:");
          console.error("1. EMAIL_USER and EMAIL_PASS are set correctly");
          console.error("2. For Gmail: Use App Password, not regular password");
          console.error(
            "3. Enable 2-Factor Authentication on your Google account",
          );
          console.error(
            "4. Generate App Password at: https://myaccount.google.com/apppasswords",
          );
        }
      }

      return false;
    }
  }

  async sendBulkWalletCreationEmails(
    emails: string[],
    verificationUrl?: string,
  ): Promise<{ success: string[]; failed: string[] }> {
    const results = { success: [] as string[], failed: [] as string[] };

    for (const email of emails) {
      const success = await this.sendWalletCreationEmail(
        email,
        verificationUrl,
      );
      if (success) {
        results.success.push(email);
      } else {
        results.failed.push(email);
      }

      // Add delay between emails to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return results;
  }

  isConfigured(): boolean {
    return this.transporter !== null && this.config !== null;
  }
}

export const emailService = new EmailService();
export default emailService;
