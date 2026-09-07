import React from 'react';
import { Shield, LogOut } from 'lucide-react';

export default function Header({
  status,
  user,
  authReady,
  firebaseConfigured,
  devName,
  onDevNameChange,
  onSignIn,
  onSignOut,
}) {
  return (
    <div className="gm-header">
      <div className="gm-brand">
        <div className="gm-logo-icon">
          <Shield size={20} strokeWidth={2.4} style={{ color: '#1a73e8' }} />
        </div>
        <div>
          <h1 className="gm-logo-title">SafeRoute</h1>
          <div className="gm-logo-sub">Kochi safety navigation</div>
        </div>
      </div>

      {firebaseConfigured ? (
        user ? (
          <div className="gm-auth-chip">
            {user.photo ? (
              <img src={user.photo} alt="" className="gm-auth-avatar" referrerPolicy="no-referrer" />
            ) : (
              <span className="gm-auth-avatar gm-auth-avatar-fallback">
                {(user.name || '?').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="gm-auth-name" title={user.email || ''}>
              {(user.name || 'You').split(' ')[0]}
            </span>
            <button className="gm-auth-signout" onClick={onSignOut} title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        ) : authReady ? (
          <button className="gm-auth-signin" onClick={onSignIn}>
            Sign in
          </button>
        ) : null
      ) : (
        <input
          className="gm-devname-input"
          value={devName || ''}
          placeholder="Your name"
          title="Shown on your contributions (dev mode)"
          onChange={(e) => onDevNameChange(e.target.value)}
        />
      )}
    </div>
  );
}
