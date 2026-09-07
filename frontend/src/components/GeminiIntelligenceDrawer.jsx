import React from 'react';
import { Info } from 'lucide-react';

export default function GeminiIntelligenceDrawer({ explanation, isLoading }) {
  return (
    <div className="gm-summary-box">
      <div className="gm-summary-title">
        <Info size={15} />
        <span>Why this route</span>
      </div>
      <div className="gm-summary-body">
        {isLoading ? (
          <span className="gm-muted-italic">
            Comparing lighting, emergency-service distance and road condition along each route…
          </span>
        ) : explanation ? (
          <p>{explanation}</p>
        ) : (
          <p>
            Set a start and destination, then choose <strong>Get directions</strong> for a
            plain-language breakdown of why one route is safer than the other.
          </p>
        )}
      </div>
    </div>
  );
}
