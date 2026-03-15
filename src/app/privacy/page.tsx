import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Amach Health",
  description: "Privacy Policy for Amach Health",
};

export default function PrivacyPolicy(): JSX.Element {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-400 mb-8">Last updated: March 15, 2026</p>

      <section className="space-y-6 text-gray-300 leading-relaxed">
        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Introduction
          </h2>
          <p>
            Amach Health (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;)
            respects your privacy. This Privacy Policy explains how we collect,
            use, and protect your information when you use the Amach Health iOS
            application and website (collectively, the &quot;Service&quot;).
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Information We Collect
          </h2>
          <h3 className="text-lg font-medium text-white mt-4 mb-1">
            Health Data
          </h3>
          <p>
            With your explicit permission, we access Apple HealthKit data
            including activity, sleep, heart rate, body composition, and lab
            results. This data is encrypted on your device before being stored
            and is never shared with third parties.
          </p>

          <h3 className="text-lg font-medium text-white mt-4 mb-1">
            Wallet Information
          </h3>
          <p>
            We use Privy for wallet-based authentication. Your wallet address is
            used to identify your account and create on-chain health
            attestations on ZKsync Era. We do not store your private keys.
          </p>

          <h3 className="text-lg font-medium text-white mt-4 mb-1">
            Usage Data
          </h3>
          <p>
            We collect basic analytics (via Vercel Analytics) to improve the
            Service. This includes page views and general usage patterns. No
            health data is included in analytics.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            How We Store Your Data
          </h2>
          <p>
            All health data is encrypted using AES-256 encryption derived from
            your wallet signature before being stored on Storj, a decentralized
            storage network. Only you can decrypt your data with your wallet. We
            cannot access your health data in its unencrypted form.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            On-Chain Attestations
          </h2>
          <p>
            When you generate health metric proofs, cryptographic hashes (not
            raw health data) are recorded on the ZKsync Era blockchain. These
            attestations verify data integrity without exposing personal health
            information.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            AI Processing
          </h2>
          <p>
            Health insights are generated using AI agents. Your data is
            processed in-session and is not used to train AI models. Queries are
            sent to the Venice AI API which does not retain user data.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Data Sharing
          </h2>
          <p>
            We do not sell, rent, or share your personal health data with third
            parties. Your encrypted data is stored on decentralized
            infrastructure that we do not control beyond access credentials.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">Your Rights</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Revoke HealthKit access at any time via iOS Settings</li>
            <li>Request deletion of your stored data</li>
            <li>Export your health data</li>
            <li>Disconnect your wallet to remove account association</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Data Retention
          </h2>
          <p>
            Your encrypted health data is retained as long as your account is
            active. You may request deletion at any time by contacting us.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Children&apos;s Privacy
          </h2>
          <p>
            The Service is not intended for users under the age of 18. We do not
            knowingly collect data from minors.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Changes to This Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be
            posted on this page with an updated revision date.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us
            at{" "}
            <a
              href="mailto:privacy@amach.health"
              className="text-emerald-400 hover:underline"
            >
              privacy@amach.health
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
