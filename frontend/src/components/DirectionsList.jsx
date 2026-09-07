import React from 'react';
import { ArrowLeft, Navigation, MapPin } from 'lucide-react';

export default function DirectionsList({ route, onBack }) {
  if (!route || !route.steps) return null;

  return (
    <div className="gm-directions-list-container">
      <div className="gm-directions-header">
        <button className="gm-icon-btn" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div className="gm-directions-title">
          <h3>Steps</h3>
          <span>{route.duration_text} ({route.distance_text})</span>
        </div>
      </div>
      <div className="gm-directions-steps">
        {route.steps.map((step, idx) => (
          <div key={idx} className="gm-direction-step">
            <div className="gm-step-icon">
              {idx === route.steps.length - 1 ? (
                <MapPin size={20} color="#d93025" />
              ) : (
                <Navigation size={20} color="#5f6368" style={{ transform: 'rotate(45deg)' }} />
              )}
            </div>
            <div className="gm-step-details">
              <div className="gm-step-instruction" dangerouslySetInnerHTML={{ __html: step.instruction }} />
              {step.distance && <div className="gm-step-distance">{step.distance}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
