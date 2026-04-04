import Image from "next/image";

export default function Home() {
  const features = [
    {
      title: "Iris capture",
      description:
        "Guided capture, quality checks, and reliable extraction designed for low-friction enrollment.",
    },
    {
      title: "Anti-spoofing",
      description:
        "Liveness analysis and visual consistency checks to block image, screen, and replay attacks.",
    },
    {
      title: "Wallet security",
      description:
        "A wallet-first architecture with secure identity checks, clean handoff, and crypto-ready flows.",
    },
  ];

  const workflow = [
    "Capture the iris with guided camera alignment.",
    "Extract a stable biometric fingerprint from the scan.",
    "Run anti-spoofing checks before any decision is made.",
    "Unlock the wallet experience when the identity is verified.",
  ];

  const screens = [
    {
      title: "Scan",
      label: "Authentification biometrique",
      body: "Position your eye in front of the camera and launch the scan flow.",
      accent: "Live capture",
    },
    {
      title: "Register",
      label: "Create a new wallet",
      body: "If the iris is unknown, the user can create a wallet and bind it to the biometric hash.",
      accent: "Enrollment",
    },
    {
      title: "Dashboard",
      label: "Wallet connected",
      body: "Once verified, the dashboard presents balance, wallet address, and account status.",
      accent: "Secure session",
    },
  ];

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="IrisWallet home">
          <span className="brand-mark">
            <Image src="/logo.png" alt="IrisWallet logo" width={42} height={42} priority />
          </span>
          <span className="brand-copy">
            <strong>IrisWallet</strong>
            <span>Biometric wallet platform</span>
          </span>
        </a>

        <nav className="nav-pills" aria-label="Section navigation">
          <a href="#product">Product</a>
          <a href="#workflow">Workflow</a>
          <a href="#security">Security</a>
        </nav>
      </header>

      <section className="hero section-pad" id="top">
        <div className="section-inner hero-grid">
          <div className="hero-copy fade-up">
            <p className="eyebrow">BIOMETRIC ACCESS</p>
            <h1>
              The wallet experience, secured by iris recognition.
              <span> Fast, intentional, and harder to spoof.</span>
            </h1>
            <p className="lead">
              IrisWallet combines biometric identity, anti-spoofing, and secure
              wallet orchestration into a single polished user journey.
            </p>
            <div className="actions">
              <a href="#workflow" className="btn btn-primary">
                Explore the flow
              </a>
              <a href="#contact" className="btn btn-ghost">
                Talk to us
              </a>
            </div>
            <div className="hero-metrics">
              <div className="metric-card">
                <span className="metric-label">Verification path</span>
                <strong>3-stage biometric flow</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Design language</span>
                <strong>Dark UI with cyan glow</strong>
              </div>
            </div>
          </div>

          <div className="hero-panel fade-up">
            <div className="panel-header">
              <div>
                <p>Live preview</p>
                <strong>IrisWallet dashboard</strong>
              </div>
              <span className="status-dot">Connected</span>
            </div>

            <div className="panel-toggle" aria-label="Screen switch preview">
              <span className="is-active">Scan</span>
              <span>Register</span>
              <span>Dashboard</span>
            </div>

            <div className="scan-card">
              <div className="scan-ring">
                <div className="scan-core" />
              </div>
              <p>Place your eye in front of the camera and start the biometric scan.</p>
              <button className="btn-primary btn-primary-compact" type="button">
                <span className="btn-icon">👁</span>
                Scan iris
              </button>
            </div>

            <div className="panel-grid">
              <div className="mini-card">
                <span className="metric-label">Balance</span>
                <strong>12.48 ETH</strong>
              </div>
              <div className="mini-card">
                <span className="metric-label">Wallet</span>
                <strong>Connected</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="section-pad">
        <div className="section-inner">
          <div className="section-head fade-up">
            <p className="eyebrow">Product Stack</p>
            <h2>A polished biometric wallet stack built for trust.</h2>
          </div>
          <div className="pillars">
            {features.map((feature) => (
              <article key={feature.title} className="card fade-up">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="section-pad">
        <div className="section-inner workflow-layout">
          <div className="workflow-card fade-up">
            <p className="eyebrow">Workflow</p>
            <h2>How the experience moves from scan to access.</h2>
            <ol className="workflow-list">
              {workflow.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div id="security" className="security-card fade-up">
            <p className="eyebrow">Security posture</p>
            <h3>Built to reduce spoofing and keep the user flow clean.</h3>
            <ul>
              <li>Biometric decision gates before wallet access</li>
              <li>Clear separation between capture, verification, and unlock</li>
              <li>Compact dashboard-first UI patterns for fast comprehension</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section-pad screens-section">
        <div className="section-inner">
          <div className="section-head fade-up">
            <p className="eyebrow">App States</p>
            <h2>Three screens that define the product experience.</h2>
          </div>

          <div className="screens-grid">
            {screens.map((screen) => (
              <article key={screen.title} className="screen-mock fade-up">
                <div className="screen-mock-top">
                  <span className="screen-badge">{screen.accent}</span>
                  <span className="screen-status" />
                </div>

                <div className="screen-mock-body">
                  <p className="screen-kicker">{screen.title}</p>
                  <h3>{screen.label}</h3>
                  <p>{screen.body}</p>
                </div>

                <div className="screen-mock-footer">
                  <span className="footer-chip">Camera ready</span>
                  <span className="footer-chip">Cyan UI</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="section-pad">
        <div className="section-inner">
          <div className="cta fade-up">
            <p className="eyebrow">Contact</p>
            <h2>Want to partner on IrisWallet?</h2>
            <p>
              We are open to technical partnerships, pilot deployments, and
              conversations with teams building secure digital identity products.
            </p>
            <div className="actions">
              <a className="btn btn-primary" href="mailto:contact@iriswallet.com">
                contact@iriswallet.com
              </a>
              <a className="btn btn-ghost" href="#top">
                Back to top
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
