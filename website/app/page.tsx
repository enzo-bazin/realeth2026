import Image from "next/image";

export default function Home() {
  const features = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ),
      title: "Iris Capture",
      description:
        "Guided capture with real-time quality checks and reliable extraction designed for frictionless enrollment.",
      accent: "#00e5ff",
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      title: "Identity Assurance",
      description:
        "Layered identity checks and consistency validation built for dependable authentication decisions.",
      accent: "#a78bfa",
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          <circle cx="12" cy="16" r="1"/>
        </svg>
      ),
      title: "Wallet Security",
      description:
        "Wallet-first architecture with secure identity verification, clean handoff, and crypto-ready transaction flows.",
      accent: "#fbbf24",
    },
  ];

  const workflow = [
    {
      title: "Capture",
      description: "Align your eye with the guided camera overlay and initiate the scan.",
    },
    {
      title: "Extract",
      description: "A stable biometric fingerprint is derived from the iris pattern.",
    },
    {
      title: "Verify",
      description: "Identity checks run before any authentication decision is made.",
    },
    {
      title: "Unlock",
      description: "The wallet experience opens once the identity is cryptographically verified.",
    },
  ];

  const screens = [
    {
      title: "Scan",
      label: "Biometric authentication",
      body: "Position your eye in front of the camera and launch the scan flow. Real-time feedback guides you through alignment.",
      accent: "Live capture",
      chips: ["Camera ready", "Guided overlay"],
    },
    {
      title: "Register",
      label: "Create a new wallet",
      body: "If the iris is unknown, create a wallet and bind it to your unique biometric hash. One identity, one wallet.",
      accent: "Enrollment",
      chips: ["New identity", "Hash binding"],
    },
    {
      title: "Dashboard",
      label: "Wallet connected",
      body: "Once verified, access your balance, wallet address, transaction history, and account status in real time.",
      accent: "Secure session",
      chips: ["Authenticated", "Live data"],
    },
  ];

  const guide = [
    {
      step: "01",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
          <line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
      ),
      title: "Open the App",
      description:
        "Launch the IrisWallet extension on your device. The camera overlay appears automatically, no setup required.",
    },
    {
      step: "02",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ),
      title: "Scan Your Iris",
      description:
        "Align your eye with the guided ring and tap Scan. A biometric fingerprint is derived in under 2 seconds.",
    },
    {
      step: "03",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      title: "Register or Unlock",
      description:
        "New iris? A wallet is created and cryptographically bound to your identity. Already enrolled? You're instantly authenticated.",
    },
    {
      step: "04",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      ),
      title: "Manage Your Wallet",
      description:
        "View your balance, wallet address, and transaction history — all behind your iris. No passwords. No seed phrases.",
    },
  ];

  const securityItems = [
    "Biometric decision gates before any wallet access",
    "Clear separation between capture, verification, and unlock stages",
    "Compact dashboard-first UI for instant comprehension",
    "Cryptographic hash binding — no raw biometric data stored",
  ];

  return (
    <main>
      {/* ── Topbar ──────────────────────────── */}
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top" aria-label="IrisWallet home">
            <span className="brand-mark">
              <Image src="/logo.png" alt="IrisWallet" width={36} height={36} priority />
            </span>
            <span className="brand-copy">
              <strong>IrisWallet</strong>
              <span>Biometric Wallet</span>
            </span>
          </a>

          <nav className="nav-links" aria-label="Main navigation">
            <a href="#product">Product</a>
            <a href="#workflow">Workflow</a>
            <a href="#how-to-use">How to Use</a>
            <a href="#screens">Screens</a>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────── */}
      <section className="hero section-pad" id="top">
        <div className="section-inner hero-grid">
          <div className="hero-copy reveal">
            <p className="eyebrow">Biometric Access</p>
            <h1>
              Your wallet, secured by your iris.
              <span>Fast. Intentional. Unforgeable.</span>
            </h1>
            <p className="lead">
              IrisWallet combines biometric identity, real-time verification,
              and secure wallet orchestration into a seamless user experience.
            </p>
            <div className="actions">
              <a href="#workflow" className="btn btn-primary">
                Explore the flow
              </a>
              <a href="#screens" className="btn btn-ghost">
                View screens
              </a>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-value">3-step</span>
                <span className="stat-label">Verification</span>
              </div>
              <div className="stat">
                <span className="stat-value">&lt; 2s</span>
                <span className="stat-label">Scan Time</span>
              </div>
              <div className="stat">
                <span className="stat-value">Zero</span>
                <span className="stat-label">Raw Data Stored</span>
              </div>
            </div>
          </div>

          <div className="hero-visual reveal reveal-delay-2">
            <div className="hero-panel">
              <div className="panel-header">
                <div className="panel-header-left">
                  <p>Live Preview</p>
                  <strong>IrisWallet Dashboard</strong>
                </div>
                <span className="status-pill">Connected</span>
              </div>

              <div className="panel-tabs">
                <span className="panel-tab active">Scan</span>
                <span className="panel-tab">Register</span>
                <span className="panel-tab">Dashboard</span>
              </div>

              <div className="scan-area">
                <div className="scan-ring">
                  <div className="scan-core" />
                </div>
                <p className="scan-label">
                  Place your eye in front of the camera and start the biometric scan.
                </p>
                <button className="scan-btn" type="button">
                  <span>👁</span>
                  Scan Iris
                </button>
              </div>

              <div className="panel-info-grid">
                <div className="panel-info-card">
                  <span className="panel-info-label">Balance</span>
                  <span className="panel-info-value">12.48 ETH</span>
                </div>
                <div className="panel-info-card">
                  <span className="panel-info-label">Status</span>
                  <span className="panel-info-value">Verified</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Built With ────────────────────── */}
      <section className="built-with-section">
        <div className="section-inner">
          <div className="built-with reveal">
            <span className="built-with-label">Built with</span>
            <div className="marquee-track">
              <div className="marquee-inner">
                {[...Array(6)].map((_, i) => (
                  <div className="marquee-group" key={i} aria-hidden={i > 0 ? "true" : undefined}>
                    <a className="partner-logo" href="https://www.ledger.com" target="_blank" rel="noopener noreferrer">
                      <Image src="/logo-ledger.png" alt="Ledger" width={40} height={40} />
                      <span>Ledger</span>
                    </a>
                    <a className="partner-logo" href="https://chain.link" target="_blank" rel="noopener noreferrer">
                      <Image src="/logo-chainlink.png" alt="Chainlink" width={40} height={40} />
                      <span>Chainlink</span>
                    </a>
                    <a className="partner-logo" href="https://unlink.io" target="_blank" rel="noopener noreferrer">
                      <Image src="/logo-unlink.png" alt="Unlink Labs" width={40} height={40} />
                      <span>Unlink Labs</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product ─────────────────────────── */}
      <section id="product" className="section-pad">
        <div className="section-inner">
          <div className="section-head reveal">
            <p className="eyebrow">Product Stack</p>
            <h2>A biometric wallet stack built for trust.</h2>
            <p className="subtitle">
              Every layer is designed to improve trust, simplify enrollment,
              and keep your digital identity secure.
            </p>
          </div>
          <div className="features-grid">
            {features.map((feature, i) => (
              <article
                key={feature.title}
                className={`feature-card reveal reveal-delay-${i + 1}`}
                style={{ "--card-accent": feature.accent } as React.CSSProperties}
              >
                <div className="feature-card-glow" />
                <div className="feature-card-content">
                  <div className="feature-icon">{feature.icon}</div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
                <div className="feature-card-border" />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow + Security ──────────────── */}
      <section id="workflow" className="section-pad">
        <div className="section-inner">
          <div className="section-head reveal">
            <p className="eyebrow">Workflow</p>
            <h2>From scan to wallet access in four steps.</h2>
          </div>
          <div className="workflow-grid">
            <div className="workflow-steps">
              <div className="workflow-line" aria-hidden="true">
                <div className="workflow-line-fill" />
              </div>
              {workflow.map((step, i) => (
                <div key={step.title} className={`step reveal reveal-delay-${i + 1}`}>
                  <div className="step-marker">
                    <span className="step-number">{String(i + 1).padStart(2, "0")}</span>
                    <div className="step-pulse" />
                  </div>
                  <div className="step-content">
                    <h4>{step.title}</h4>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="security-panel reveal reveal-delay-2" id="security">
              <p className="eyebrow">Security Posture</p>
              <h3>Built to keep the flow secure and easy to understand.</h3>
              <ul className="security-list">
                {securityItems.map((item) => (
                  <li key={item} className="security-item">
                    <span className="security-check">✓</span>
                    <p>{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── How to Use ──────────────────────── */}
      <section id="how-to-use" className="section-pad">
        <div className="section-inner">
          <div className="section-head reveal">
            <p className="eyebrow">Get Started</p>
            <h2>Up and running in four steps.</h2>
            <p className="subtitle">
              No passwords, no seed phrases. Just your iris and your wallet.
            </p>
          </div>
          <div className="guide-grid">
            {guide.map((item, i) => (
              <article
                key={item.step}
                className={`guide-card reveal reveal-delay-${i + 1}`}
              >
                <div className="guide-card-top">
                  <span className="guide-step">{item.step}</span>
                  <div className="guide-icon">{item.icon}</div>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── App Screens ─────────────────────── */}
      <section id="screens" className="section-pad">
        <div className="section-inner">
          <div className="section-head reveal">
            <p className="eyebrow">App States</p>
            <h2>Three screens that define the experience.</h2>
            <p className="subtitle">
              Each screen maps to a stage in the biometric wallet journey — from
              first scan to full dashboard access.
            </p>
          </div>
          <div className="screens-grid">
            {screens.map((screen, i) => (
              <article
                key={screen.title}
                className={`screen-card reveal reveal-delay-${i + 1}`}
              >
                <div className="screen-top">
                  <span className="screen-badge">{screen.accent}</span>
                  <span className="screen-dot" />
                </div>
                <div className="screen-body">
                  <span className="screen-kicker">{screen.title}</span>
                  <h3>{screen.label}</h3>
                  <p>{screen.body}</p>
                </div>
                <div className="screen-footer">
                  {screen.chips.map((chip) => (
                    <span key={chip} className="screen-chip">{chip}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────── */}
      <footer className="site-footer">
        <div className="section-inner footer-inner">
          <span className="footer-copy">
            &copy; {new Date().getFullYear()} IrisWallet. All rights reserved.
          </span>
          <div className="footer-links">
            <a href="#product">Product</a>
            <a href="#workflow">Workflow</a>
            <a href="#how-to-use">How to Use</a>
            <a href="#screens">Screens</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
