export const whitepaperContent = {
  1: `
    <div class="whitepaper-content">
      <div class="section">
        <h3>ABSTRACT</h3>
        <p class="text-lg text-amber-800/80 mb-6">
          Amach Health is pioneering a revolutionary approach to healthcare by creating a decentralized infrastructure that integrates traditional healing wisdom with modern medical data analytics. Our platform leverages blockchain technology, privacy-preserving computation, and artificial intelligence to enable secure health data sharing while empowering users to maintain full control over their information.
        </p>
      </div>

      <div class="section">
        <h3>TABLE OF CONTENTS</h3>
        <ol class="space-y-2 ml-6">
          <li class="text-lg text-amber-800/80">1. Introduction</li>
          <li class="text-lg text-amber-800/80">2. Vision & Mission</li>
          <li class="text-lg text-amber-800/80">3. Technical Architecture</li>
          <li class="text-lg text-amber-800/80">4. Data Privacy & Security</li>
          <li class="text-lg text-amber-800/80">5. Platform Components</li>
          <li class="text-lg text-amber-800/80">6. Tokenomics</li>
          <li class="text-lg text-amber-800/80">7. Roadmap</li>
          <li class="text-lg text-amber-800/80">8. Conclusion</li>
        </ol>
      </div>
    </div>
  `,
  2: `
    <div class="whitepaper-content">
      <div class="section">
        <h3>INTRODUCTION</h3>
        <p class="text-lg text-amber-800/80 mb-6">
          The modern healthcare system faces significant challenges in data interoperability, privacy protection, and the integration of traditional healing practices with contemporary medicine. Amach Health addresses these challenges by creating a decentralized platform that enables the secure sharing of health data across different providers and systems.
        </p>
        
        <p class="text-lg text-amber-800/80 mb-6">
          Our platform preserves user privacy through advanced cryptographic techniques while bridging the gap between traditional healing wisdom and modern medical practices. By empowering users to monetize their health data while maintaining control, we're creating a more holistic approach to healthcare through comprehensive data analysis.
        </p>
      </div>

      <div class="section">
        <h3>VISION & MISSION</h3>
        <p class="text-lg text-amber-800/80 mb-6">
          Our vision is to transform wellness by integrating the best of modern medicine, ancestral wisdom, and advanced analytics. We're creating a future where technology enhances rather than replaces human wisdom, recognizing that optimal health comes from harmonizing conventional medical care with traditional healing practices, all validated through rigorous data analysis.
        </p>
        
        <p class="text-lg text-amber-800/80 mb-6">
          Our mission centers on building a decentralized health data infrastructure that respects individual privacy through encrypted IPFS storage and zkSync verification. This system enables secure data sharing while maintaining user control, bridging traditional healing practices with modern healthcare through comprehensive data integration. Through token-based incentives, we create value for all participants in the healthcare ecosystem.
        </p>
      </div>
    </div>
  `,
  3: `
    <div class="whitepaper-content">
      <div class="section">
        <h3>TECHNICAL ARCHITECTURE</h3>
        <p class="text-lg text-amber-800/80 mb-6">Amach Health's technical infrastructure is built on three primary layers, each designed to ensure security, privacy, and seamless integration of health data from various sources.</p>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Data Collection Layer</h4>
          <p class="text-lg text-amber-800/80 mb-4">Our data collection infrastructure will integrate with multiple wearable devices and health tracking platforms, standardizing diverse health metrics into a unified, secure format. This layer handles real-time data synchronization while maintaining strict privacy controls.</p>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Privacy & Security Layer</h4>
          <p class="text-lg text-amber-800/80 mb-4">Our multi-layered security approach combines ZKSync Era's scalable blockchain infrastructure with IPFS's decentralized storage capabilities. This integration enables secure, verifiable transactions while maintaining data privacy through homomorphic encryption and zero-knowledge proofs, ensuring that sensitive health information remains protected at all times.</p>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Analysis & Insight Layer</h4>
          <p class="text-lg text-amber-800/80 mb-4">Our AI-powered analytics engine processes health data locally, identifying patterns across traditional and modern health metrics. This approach enables personalized health recommendations while maintaining privacy, as all analysis occurs on the user's device through Venice AI's browser-based model.</p>
        </div>
      </div>

      <div class="section">
        <h3>WEARABLE INTEGRATION</h3>
        <p class="text-lg text-amber-800/80 mb-4">Our platform will support multiple wearable devices and health tracking platforms:</p>
        
        <ul class="space-y-2 ml-6 mb-6">
          <li class="text-lg text-amber-800/80">• Apple Health (Initial Beta)</li>
          <li class="text-lg text-amber-800/80">• Google Fit</li>
          <li class="text-lg text-amber-800/80">• Fitbit</li>
          <li class="text-lg text-amber-800/80">• Garmin</li>
          <li class="text-lg text-amber-800/80">• Oura</li>
          <li class="text-lg text-amber-800/80">• Whoop</li>
        </ul>

        <p class="text-lg text-amber-800/80">Data from these devices will be encrypted client-side and stored on IPFS, with metadata and access controls managed through smart contracts on ZKSync Era.</p>
      </div>
    </div>
  `,
  4: `
    <div class="whitepaper-content">
      <div class="section">
        <h3>DATA PRIVACY & SECURITY</h3>
        
        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Privacy-First Architecture</h4>
          <p class="text-lg text-amber-800/80 mb-6">
            Our privacy-first architecture ensures end-to-end encryption of all health data within the Amach ecosystem. Data will be stored on IPFS with additional encryption layers, accessible only through user-authorized smart contracts. Zero-knowledge proofs provide verification capabilities without exposing sensitive information.
          </p>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Smart Contract Security</h4>
          <p class="text-lg text-amber-800/80 mb-6">
            Our smart contracts implement comprehensive security measures including role-based access control and time-locked data access. The system features automated permission management and maintains encrypted data chunks with versioning, ensuring both security and data integrity.
          </p>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Data Storage Contract</h4>
          <p class="text-lg text-amber-800/80 mb-6">
            The HealthDataStorage smart contract forms the backbone of our platform, providing encrypted health data storage with granular access control. Users maintain complete sovereignty over their data through robust monetization options and the right to be forgotten.
          </p>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Dashboard Interface</h4>
          <p class="text-lg text-amber-800/80 mb-6">
            Our intuitive dashboard provides comprehensive health data visualization alongside streamlined device connection management. Users can easily control data sharing preferences and explore monetization opportunities through a clean, user-friendly interface.
          </p>
        </div>
      </div>
    </div>
  `,
  5: `
    <div class="whitepaper-content">
      <div class="section">
        <h3>TOKENOMICS</h3>
        
        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Token Distribution</h4>
          <p class="text-lg text-amber-800/80 mb-4">The initial token distribution follows a "Contributor-First Launch" model:</p>
          <ul class="space-y-2 ml-6 mb-4">
            <li class="text-lg text-amber-800/80">• 70% - Data Contributors</li>
            <li class="text-lg text-amber-800/80">• 20% - Protocol Reserve</li>
            <li class="text-lg text-amber-800/80">• 10% - Initial DEX Liquidity</li>
          </ul>
          
          <div class="bg-white/40 p-4 rounded-lg">
            <p class="text-lg text-amber-800/80 leading-relaxed">
              This distribution model represents a novel approach where value accrues directly to platform users rather than venture capital. By rewarding early data contributors, we create a more engaged and committed user base, significantly reducing the risk of large sell-offs at launch.
            </p>
          </div>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Token Utility</h4>
          <p class="text-lg text-amber-800/80 mb-4">
            HEALTH tokens serve multiple purposes within our ecosystem, enabling data access authorization, premium feature access, and staking rewards. This multi-faceted utility ensures consistent token demand while incentivizing long-term platform engagement.
          </p>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Pre-Launch Token System</h4>
          <p class="text-lg text-amber-800/80 mb-6">
            Our pre-launch token distribution system implements a fair and transparent process. Users receive non-tradable HEALTH tokens for verified data contributions, with tokens becoming fully transferable at launch. This approach, combined with anti-Sybil measures and strict verification requirements, ensures a fair and sustainable token economy.
          </p>
        </div>
      </div>
    </div>
  `,
  6: `
    <div class="whitepaper-content">
      <div class="section">
        <h3>ROADMAP</h3>
        
        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Phase 1: MVP</h4>
          <p class="text-lg text-amber-800/80 mb-4">Our initial phase focuses on establishing core platform functionality:</p>
          <ul class="space-y-2 ml-6">
            <li class="text-lg text-amber-800/80">• Basic wearable integration</li>
            <li class="text-lg text-amber-800/80">• Encrypted data storage</li>
            <li class="text-lg text-amber-800/80">• Simple analytics dashboard</li>
            <li class="text-lg text-amber-800/80">• Non-tradable token distribution system</li>
          </ul>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Phase 2: Enhanced Features</h4>
          <p class="text-lg text-amber-800/80 mb-4">Building on our foundation, we'll expand platform capabilities:</p>
          <ul class="space-y-2 ml-6">
            <li class="text-lg text-amber-800/80">• Additional device integration</li>
            <li class="text-lg text-amber-800/80">• Advanced analytics</li>
            <li class="text-lg text-amber-800/80">• Initial token distribution</li>
            <li class="text-lg text-amber-800/80">• Basic governance features</li>
          </ul>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Phase 3: Full Decentralization</h4>
          <p class="text-lg text-amber-800/80 mb-4">Achieving complete platform autonomy through:</p>
          <ul class="space-y-2 ml-6">
            <li class="text-lg text-amber-800/80">• Complete DAO governance</li>
            <li class="text-lg text-amber-800/80">• Advanced data monetization</li>
            <li class="text-lg text-amber-800/80">• Cross-chain integration</li>
            <li class="text-lg text-amber-800/80">• Enhanced privacy features</li>
          </ul>
        </div>

        <div class="mt-8">
          <h4 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">Phase 4: Ecosystem Expansion</h4>
          <p class="text-lg text-amber-800/80 mb-4">Broadening our impact through:</p>
          <ul class="space-y-2 ml-6">
            <li class="text-lg text-amber-800/80">• Traditional medicine integration</li>
            <li class="text-lg text-amber-800/80">• Research platform launch</li>
            <li class="text-lg text-amber-800/80">• Global health initiatives</li>
            <li class="text-lg text-amber-800/80">• Advanced AI analytics</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  7: `
    <div class="whitepaper-content">
      <div class="section">
        <h3>CONCLUSION</h3>
        
        <div class="space-y-6">
          <p class="text-lg text-amber-800/80 leading-relaxed">
            Amach Health represents a paradigm shift in healthcare data management and analysis. By combining blockchain technology, privacy-preserving computation, and artificial intelligence with a deep respect for traditional healing wisdom, we are creating a platform that can transform how health data is shared, analyzed, and monetized while maintaining individual privacy and control.
          </p>
          
          <p class="text-lg text-amber-800/80 leading-relaxed">
            Through our phased approach and careful consideration of technical, social, and economic factors, we believe Amach Health will become a cornerstone of the future healthcare ecosystem, enabling better health outcomes through the thoughtful integration of traditional wisdom and modern technology.
          </p>
        </div>
      </div>
    </div>
  `
}; 