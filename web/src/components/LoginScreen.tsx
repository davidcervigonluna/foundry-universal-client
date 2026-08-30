interface Props { onAnon: () => void; onEntra: () => void; }
// Landing screen: choose how to sign in. The Entra button always opens the
// identity form, where you set tenant/client id for this session.
export function LoginScreen({ onAnon, onEntra }: Props) {
  return (
    <div className="login-screen">
      <div className="login-hero">
        <div className="login-logo">◆</div>
        <h1>Foundry Universal Client</h1>
        <p className="login-sub">Choose how you want to sign in</p>
      </div>
      <div className="login-options">
        <button className="login-card-btn" onClick={onAnon}>
          <div className="lc-icon">🕶️</div>
          <div className="lc-title">Sign in as anonymous</div>
          <div className="lc-desc">Test an agent that was shared with you. You need its
            endpoint and the credentials (service principal) given by the administrator.
            No history, no profiles.</div>
        </button>
        <button className="login-card-btn" onClick={onEntra}>
          <div className="lc-icon">🔐</div>
          <div className="lc-title">Sign in with Entra ID</div>
          <div className="lc-desc">Configure your identity (tenant + client id) right here
            in the UI. Your Foundry RBAC permissions apply. Access to project, playground,
            agents, history and profiles.</div>
        </button>
      </div>
    </div>
  );
}
