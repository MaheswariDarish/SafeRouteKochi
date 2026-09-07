import React, { useRef } from 'react';
import {
  Footprints,
  Car,
  ArrowUpDown,
  ArrowRight,
  Search,
  ShieldCheck,
  Moon,
  Sun,
  CloudRain,
  LocateFixed,
  X,
} from 'lucide-react';
import { Autocomplete } from '@react-google-maps/api';

export default function DirectionsBox({
  origin,
  destination,
  onOriginChange,
  onDestChange,
  onOriginResolved,
  onDestResolved,
  onSwap,
  onUseMyLocation,
  onClear,
  hour,
  onHourChange,
  isRaining,
  onRainToggle,
  onCalculate,
  isLoading,
  travelMode,
  onTravelModeChange,
  isGoogleLoaded,
  compact = false,
}) {
  const originAutocompleteRef = useRef(null);
  const destAutocompleteRef = useRef(null);

  // Keep suggestions local: restrict to India, bias hard toward the Kochi area.
  const autocompleteOptions = {
    componentRestrictions: { country: 'in' },
    bounds: { north: 10.3, south: 9.75, east: 76.65, west: 76.1 },
    strictBounds: false,
    fields: ['formatted_address', 'geometry', 'name'],
  };

  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const isNight = hour >= 20 || hour < 5;
  const currentHour = new Date().getHours();
  const isNow = hour === currentHour;

  const readPlace = (auto, onText, onResolved) => {
    const place = auto?.getPlace();
    if (!place) return;
    const label = place.name
      ? place.formatted_address
        ? `${place.name}, ${place.formatted_address}`
        : place.name
      : place.formatted_address || '';
    if (label) onText(label);
    if (place.geometry?.location && onResolved) {
      onResolved({
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
    }
  };

  const onOriginPlaceChanged = () =>
    readPlace(originAutocompleteRef.current, onOriginChange, onOriginResolved);
  const onDestPlaceChanged = () =>
    readPlace(destAutocompleteRef.current, onDestChange, onDestResolved);

  const quickRoutes = [
    ['MG Road, Kochi', 'Kakkanad, Kochi'],
    ['Marine Drive, Kochi', 'Lulu Mall, Edappally'],
    ['Fort Kochi', 'Vyttila Hub'],
  ];

  return (
    <div>
      <div className="gm-mode-tabs">
        <button
          className={`gm-tab-btn ${travelMode === 'drive' ? 'active' : ''}`}
          onClick={() => onTravelModeChange('drive')}
        >
          <Car size={16} /> Drive
        </button>
        <button
          className={`gm-tab-btn ${travelMode === 'walk' ? 'active' : ''}`}
          onClick={() => onTravelModeChange('walk')}
        >
          <Footprints size={16} /> Walk
        </button>
        <button
          className={`gm-tab-btn ${travelMode === 'safe' ? 'active' : ''}`}
          onClick={() => onTravelModeChange('safe')}
        >
          <ShieldCheck size={16} /> Safest
        </button>
      </div>

      <div className="gm-search-inputs">
        <div className="gm-input-row">
          <span className="gm-pin-indicator">
            <span className="gm-dot-origin" />
          </span>
          {isGoogleLoaded ? (
            <Autocomplete
              onLoad={(auto) => (originAutocompleteRef.current = auto)}
              onPlaceChanged={onOriginPlaceChanged}
              options={autocompleteOptions}
              className="gm-autocomplete-wrapper"
            >
              <input
                type="text"
                className="gm-text-search-input"
                placeholder="Choose starting point"
                value={origin}
                onChange={(e) => onOriginChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onCalculate()}
              />
            </Autocomplete>
          ) : (
            <input
              type="text"
              className="gm-text-search-input"
              placeholder="Choose starting point"
              value={origin}
              onChange={(e) => onOriginChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCalculate()}
            />
          )}
          {onUseMyLocation && (
            <button
              type="button"
              className="gm-inline-icon-btn"
              onClick={onUseMyLocation}
              title="Use my location"
            >
              <LocateFixed size={15} />
            </button>
          )}
        </div>

        <div className="gm-input-row">
          <span className="gm-pin-indicator">
            <span className="gm-dot-dest" />
          </span>
          {isGoogleLoaded ? (
            <Autocomplete
              onLoad={(auto) => (destAutocompleteRef.current = auto)}
              onPlaceChanged={onDestPlaceChanged}
              options={autocompleteOptions}
              className="gm-autocomplete-wrapper"
            >
              <input
                type="text"
                className="gm-text-search-input"
                placeholder="Choose destination"
                value={destination}
                onChange={(e) => onDestChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onCalculate()}
              />
            </Autocomplete>
          ) : (
            <input
              type="text"
              className="gm-text-search-input"
              placeholder="Choose destination"
              value={destination}
              onChange={(e) => onDestChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCalculate()}
            />
          )}
        </div>

        <button className="gm-swap-btn" onClick={onSwap} title="Reverse start and destination">
          <ArrowUpDown size={16} />
        </button>
      </div>

      {!compact && (
        <div className="gm-quick-chips">
          {quickRoutes.map(([from, to]) => (
            <button
              key={from + to}
              className="gm-quick-chip"
              onClick={() => {
                onOriginChange(from);
                onDestChange(to);
              }}
            >
              {from.split(',')[0]} <ArrowRight size={11} /> {to.split(',')[0]}
            </button>
          ))}
        </div>
      )}

      <div className={`gm-sim-bar ${compact ? 'gm-sim-bar-compact' : ''}`}>
        <div className="gm-slider-header">
          <span>
            Leave at{' '}
            {!isNow && (
              <button type="button" className="gm-link-btn" onClick={() => onHourChange(currentHour)}>
                now
              </button>
            )}
          </span>
          <strong>
            {isNight ? <Moon size={13} /> : <Sun size={13} />} {displayHour}:00 {ampm}
            {isNow && <span className="gm-now-tag">now</span>}
          </strong>
        </div>
        <input
          type="range"
          min="0"
          max="23"
          value={hour}
          onChange={(e) => onHourChange(parseInt(e.target.value, 10))}
          className="gm-range-input"
        />
        <label className="gm-switch-label">
          <input
            type="checkbox"
            checked={isRaining}
            onChange={(e) => onRainToggle(e.target.checked)}
            style={{ accentColor: '#1a73e8' }}
          />
          <CloudRain size={14} /> Monsoon rain / flood risk
        </label>
      </div>

      <div className="gm-calc-action">
        <button className="gm-primary-button" onClick={onCalculate} disabled={isLoading}>
          {isLoading ? (
            <span>Searching…</span>
          ) : (
            <>
              <Search size={16} /> Get directions
            </>
          )}
        </button>
        {onClear && (origin || destination) && (
          <button
            type="button"
            className="gm-clear-btn"
            onClick={onClear}
            title="Clear directions"
          >
            <X size={16} /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
