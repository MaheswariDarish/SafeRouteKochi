import React from 'react';
import { Siren } from 'lucide-react';

export default function SosButton({ onClick }) {
  return (
    <button className="gm-sos-btn" onClick={onClick} title="Emergency help & police jurisdiction">
      <Siren size={16} />
      SOS
    </button>
  );
}
