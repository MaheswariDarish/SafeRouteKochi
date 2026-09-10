import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import DirectionsBox from './components/DirectionsBox';
import RouteCard from './components/RouteCard';
import GeminiIntelligenceDrawer from './components/GeminiIntelligenceDrawer';
import MapLayersFab from './components/MapLayersFab';
import GoogleMapView from './components/GoogleMapView';
import MapView from './components/MapView';
import DirectionsList from './components/DirectionsList';
import PlacePanel from './components/PlacePanel';
import AddFeaturePanel from './components/AddFeaturePanel';
import RoadAssessmentPanel from './components/RoadAssessmentPanel';
import MunicipalityReport from './components/MunicipalityReport';
import EventsPanel from './components/EventsPanel';
import LivePanel from './components/LivePanel';
import AddEventPanel from './components/AddEventPanel';
import SurveyPanel from './components/SurveyPanel';
import SosButton from './components/SosButton';
import SosPanel from './components/SosPanel';
import { LocateFixed } from 'lucide-react';
import { initFirebase, onAuthChange, signInWithGoogle, signOutUser, firebaseConfigured } from './lib/firebase';
import { getDevName, setDevName } from './lib/api';

export default function App() {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [segments, setSegments] = useState([]);
  const [features, setFeatures] = useState([]);
  const [events, setEvents] = useState([]);
  const [origin, setOrigin] = useState('MG Road, Kochi');
  const [destination, setDestination] = useState('Kakkanad, Kochi');
  // Exact coords when a place was picked from autocomplete (null = geocode the text).
  const [originCoord, setOriginCoord] = useState(null);
  const [destCoord, setDestCoord] = useState(null);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [isRaining, setIsRaining] = useState(false);
  const [travelMode, setTravelMode] = useState('drive');
  const [isLoading, setIsLoading] = useState(false);
  const [routesData, setRoutesData] = useState(null);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  // Layer toggles
  const [showSafety, setShowSafety] = useState(true);
  const [showPolice, setShowPolice] = useState(false);
  const [showLighting, setShowLighting] = useState(false);
  const [showFeatures, setShowFeatures] = useState(true);
  const [showEvents, setShowEvents] = useState(false);
  const [showPotholeZones, setShowPotholeZones] = useState(false);
  const [showRatings, setShowRatings] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [liveFocusId, setLiveFocusId] = useState(null);
  const [liveVersion, setLiveVersion] = useState(0);
  const [contributionVersion, setContributionVersion] = useState(0);

  // Identity
  const [user, setUser] = useState(null); // Firebase user, or null
  const [authReady, setAuthReady] = useState(false);

  // Left-panel mode: search | directions | place | contribute | assess | events | survey
  const [panelMode, setPanelMode] = useState('search');
  const [selectedPlace, setSelectedPlace] = useState(null); // { placeId?, lat, lng }
  const [draftCoord, setDraftCoord] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [placesService, setPlacesService] = useState(null);
  const [flyTo, setFlyTo] = useState(null); // { lat, lng, zoom }
  const [userLocation, setUserLocation] = useState(null); // { lat, lng, accuracy }
  const [surveyCtx, setSurveyCtx] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      console.warn('status load error:', e);
    }
  }, []);

  const loadSegments = useCallback(async () => {
    try {
      const res = await fetch('/api/segments');
      if (res.ok) setSegments(await res.json());
    } catch (e) {
      console.warn('segments load error:', e);
    }
  }, []);

  const loadFeatures = useCallback(async () => {
    try {
      const res = await fetch('/api/features');
      if (res.ok) setFeatures(await res.json());
    } catch (e) {
      console.warn('features load error:', e);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) setEvents((await res.json()).events || []);
    } catch (e) {
      console.warn('events load error:', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfgRes = await fetch('/api/config');
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          setConfig(cfg);
          if (cfg.firebase) {
            initFirebase(cfg.firebase);
            onAuthChange((u) => {
              setUser(u);
              setAuthReady(true);
            });
          } else {
            setAuthReady(true);
          }
        }
      } catch (e) {
        console.warn('config load error:', e);
        setAuthReady(true);
      }
    })();
    loadStatus();
    loadSegments();
    loadFeatures();
    loadEvents();
  }, [loadStatus, loadSegments, loadFeatures, loadEvents]);

  // Identity for contributions. In Firebase mode, `user` (or null). In dev mode,
  // a remembered local name (editable in the header).
  const [devName, setDevNameState] = useState(() => getDevName());
  const changeDevName = (n) => {
    setDevNameState(n);
    setDevName(n);
  };
  const contributorName = (firebaseConfigured ? user?.name : devName) || 'Anonymous';

  // Contributions are anonymous by default — never block on identity. Signing
  // in (Header button) is optional and just attributes future contributions.
  const ensureIdentity = useCallback(async () => true, []);

  // Ask for the user's location once, quietly.
  const locateMe = useCallback((recenter = false) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setUserLocation(loc);
        if (recenter) setFlyTo({ lat: loc.lat, lng: loc.lng, zoom: 16 });
      },
      (err) => console.warn('geolocation:', err.message),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    locateMe(false);
  }, [locateMe]);

  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
    setOriginCoord(destCoord);
    setDestCoord(originCoord);
  };

  const changeOrigin = (v) => {
    setOrigin(v);
    setOriginCoord(null);
  };
  const changeDestination = (v) => {
    setDestination(v);
    setDestCoord(null);
  };

  const useMyLocationAsOrigin = () => {
    if (!userLocation) {
      locateMe(false);
      return;
    }
    setOrigin('Your location');
    setOriginCoord({ lat: userLocation.lat, lng: userLocation.lng });
  };

  const clearDirections = () => {
    setOrigin('');
    setDestination('');
    setOriginCoord(null);
    setDestCoord(null);
    setRoutesData(null);
    setSelectedRouteIdx(0);
    setPanelMode('search');
    if (userLocation) setFlyTo({ lat: userLocation.lat, lng: userLocation.lng, zoom: 15 });
  };

  // Re-route when the traveller changes time / mode / weather after a route is
  // already shown, so the ETA reflects Google's traffic for that time.
  const recalcRef = useRef(null);
  const hasRoutes = Boolean(routesData);
  useEffect(() => {
    if (!hasRoutes || !recalcRef.current) return;
    const t = setTimeout(() => recalcRef.current(), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour, travelMode, isRaining]);

  // Drop a stale route the moment either endpoint changes, so the map/cards
  // never show a line for a place that's no longer in the search box.
  const currentQueryKey =
    `${originCoord ? `${originCoord.lat},${originCoord.lng}` : origin}` +
    `|${destCoord ? `${destCoord.lat},${destCoord.lng}` : destination}`;
  const lastQueryKeyRef = useRef(currentQueryKey);
  useEffect(() => {
    if (routesData && lastQueryKeyRef.current !== currentQueryKey) {
      setRoutesData(null);
      setSelectedRouteIdx(0);
    }
  }, [currentQueryKey, routesData]);

  const handleCalculateRoutes = async () => {
    setIsLoading(true);
    setPanelMode('search');
    try {
      const res = await fetch('/api/routes/find-safe-corridor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: originCoord ? [originCoord.lat, originCoord.lng] : origin,
          destination: destCoord ? [destCoord.lat, destCoord.lng] : destination,
          hour,
          is_raining: isRaining,
          mode: travelMode,
          explain: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRoutesData(data);
        setSelectedRouteIdx(0);
        lastQueryKeyRef.current = currentQueryKey;
      } else {
        console.error('Route request failed:', res.status);
      }
    } catch (err) {
      console.error('Error calculating routes:', err);
    } finally {
      setIsLoading(false);
    }
  };
  recalcRef.current = handleCalculateRoutes;

  const startNavigation = (route) => {
    if (!routesData) return;
    const [oLat, oLng] = routesData.origin;
    const [dLat, dLng] = routesData.destination;
    const gmode = travelMode === 'walk' ? 'walking' : 'driving';
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${oLat},${oLng}&destination=${dLat},${dLng}&travelmode=${gmode}`;
    window.open(url, '_blank', 'noopener');
    setSurveyCtx({
      origin,
      destination,
      route_label: route?.label || null,
    });
    setPanelMode('survey');
  };

  const handleMapClick = (loc) => {
    if (panelMode === 'contribute' || panelMode === 'addevent') {
      setDraftCoord({ lat: loc.lat, lng: loc.lng });
      return;
    }
    setSelectedPlace({ placeId: loc.placeId || null, lat: loc.lat, lng: loc.lng });
    setPanelMode('place');
  };

  const openContribute = async (coord) => {
    if (!(await ensureIdentity())) return;
    setDraftCoord(coord || (selectedPlace ? { lat: selectedPlace.lat, lng: selectedPlace.lng } : null));
    setPanelMode('contribute');
  };

  const openAssess = async () => {
    if (!(await ensureIdentity())) return;
    setPanelMode('assess');
  };

  const openAddEvent = async () => {
    if (!(await ensureIdentity())) return;
    setDraftCoord(null);
    setPanelMode('addevent');
  };

  const afterContribution = () => {
    loadFeatures();
    loadSegments();
    loadStatus();
    setContributionVersion((v) => v + 1);
  };

  const showOnMap = (lat, lng, opts = {}) => {
    setReportOpen(false);
    setFlyTo({ lat, lng, zoom: opts.zoom || 17 });
    if (!opts.noPanel) {
      setSelectedPlace({ placeId: null, lat, lng });
      setPanelMode('place');
    }
  };

  const hasGoogleMapsKey = Boolean(config?.google_maps_api_key);
  const routeList = routesData?.routes || [];
  const activeRoute = routeList[selectedRouteIdx] || routesData?.route_b || null;
  const isPickMode = panelMode === 'contribute' || panelMode === 'addevent';
  const markerLocation =
    isPickMode
      ? draftCoord
      : panelMode === 'place' && selectedPlace
      ? { lat: selectedPlace.lat, lng: selectedPlace.lng }
      : null;
  const eventsVisible = showEvents || panelMode === 'events' || panelMode === 'addevent';

  return (
    <div className="maps-app">
      <aside className="gm-directions-panel">
        {panelMode === 'search' && (
          <>
            <Header
              status={status}
              user={user}
              authReady={authReady}
              firebaseConfigured={firebaseConfigured}
              devName={devName}
              onDevNameChange={changeDevName}
              onSignIn={() => signInWithGoogle().catch(() => {})}
              onSignOut={() => {
                signOutUser();
                setUser(null);
              }}
            />
            <DirectionsBox
              origin={origin}
              destination={destination}
              onOriginChange={changeOrigin}
              onDestChange={changeDestination}
              onOriginResolved={setOriginCoord}
              onDestResolved={setDestCoord}
              onSwap={handleSwap}
              onUseMyLocation={useMyLocationAsOrigin}
              onClear={clearDirections}
              hour={hour}
              onHourChange={setHour}
              isRaining={isRaining}
              onRainToggle={setIsRaining}
              onCalculate={handleCalculateRoutes}
              isLoading={isLoading}
              travelMode={travelMode}
              onTravelModeChange={setTravelMode}
              isGoogleLoaded={hasGoogleMapsKey && Boolean(window.google?.maps?.places)}
              compact={Boolean(routesData)}
            />

            <div className="gm-results-scroll">
              {routesData && (
                <>
                  {routeList.map((r, i) => (
                    <RouteCard
                      key={i}
                      route={r}
                      label={r.label || `Route ${i + 1}`}
                      isRecommended={i === 0}
                      isSelected={i === selectedRouteIdx}
                      onSelect={() => setSelectedRouteIdx(i)}
                      onStart={() => startNavigation(r)}
                      onSteps={() => {
                        setSelectedRouteIdx(i);
                        setPanelMode('directions');
                      }}
                      estimatedTime={r.duration_text}
                      estimatedDistance={r.distance_text}
                    />
                  ))}

                  {routesData.geocode_ok === false && (
                    <div className="gm-inline-warning">
                      Couldn't pin those exact places — showing an approximate corridor.
                    </div>
                  )}

                  <GeminiIntelligenceDrawer
                    explanation={routesData.explanation}
                    isLoading={isLoading}
                  />
                </>
              )}

              {!routesData && (
                <GeminiIntelligenceDrawer explanation={null} isLoading={isLoading} />
              )}
            </div>
          </>
        )}

        {panelMode === 'directions' && (
          <DirectionsList route={activeRoute} onBack={() => setPanelMode('search')} />
        )}

        {panelMode === 'place' && (
          <PlacePanel
            place={selectedPlace}
            placesService={placesService}
            onBack={() => {
              setPanelMode('search');
              setSelectedPlace(null);
            }}
            onContribute={() => openContribute()}
            onDetailedAssessment={openAssess}
            onConfirmFeature={afterContribution}
            ensureIdentity={ensureIdentity}
            contributorName={contributorName}
          />
        )}

        {panelMode === 'contribute' && (
          <AddFeaturePanel
            coord={draftCoord}
            onCoordChange={setDraftCoord}
            contributorName={contributorName}
            onCancel={() => setPanelMode(selectedPlace ? 'place' : 'search')}
            onSaved={() => {
              afterContribution();
              setPanelMode(selectedPlace ? 'place' : 'search');
            }}
          />
        )}

        {panelMode === 'assess' && (
          <RoadAssessmentPanel
            coord={selectedPlace ? { lat: selectedPlace.lat, lng: selectedPlace.lng } : draftCoord}
            contributorName={contributorName}
            onCancel={() => setPanelMode(selectedPlace ? 'place' : 'search')}
            onSaved={() => {
              afterContribution();
              setPanelMode(selectedPlace ? 'place' : 'search');
            }}
          />
        )}

        {panelMode === 'events' && (
          <EventsPanel
            events={events}
            onBack={() => setPanelMode('search')}
            onShowOnMap={(lat, lng) => showOnMap(lat, lng, { noPanel: true, zoom: 15 })}
            onAddEvent={openAddEvent}
            contributorName={contributorName}
            onChanged={loadEvents}
          />
        )}

        {panelMode === 'addevent' && (
          <AddEventPanel
            coord={draftCoord}
            contributorName={contributorName}
            onCancel={() => setPanelMode('events')}
            onSaved={() => {
              loadEvents();
              loadStatus();
              setPanelMode('events');
            }}
          />
        )}

        {panelMode === 'live' && (
          <LivePanel
            location={userLocation}
            focusId={liveFocusId}
            contributorName={contributorName}
            onBack={() => {
              setLiveFocusId(null);
              setPanelMode('search');
            }}
            onLocate={() => locateMe(true)}
            onChanged={() => setLiveVersion((v) => v + 1)}
          />
        )}

        {panelMode === 'survey' && (
          <SurveyPanel
            context={surveyCtx}
            contributorName={contributorName}
            ensureIdentity={ensureIdentity}
            onDone={() => {
              loadStatus();
              setPanelMode('search');
            }}
          />
        )}

        {panelMode === 'sos' && (
          <SosPanel
            location={userLocation}
            placesService={placesService}
            onBack={() => setPanelMode('search')}
            onLocate={() => locateMe(true)}
          />
        )}
      </aside>

      <MapLayersFab
        showSafety={showSafety}
        onToggleSafety={() => setShowSafety(!showSafety)}
        showPolice={showPolice}
        onTogglePolice={() => setShowPolice(!showPolice)}
        showLighting={showLighting}
        onToggleLighting={() => setShowLighting(!showLighting)}
        showFeatures={showFeatures}
        onToggleFeatures={() => setShowFeatures(!showFeatures)}
        showEvents={showEvents}
        onToggleEvents={() => setShowEvents(!showEvents)}
        showPotholeZones={showPotholeZones}
        onTogglePotholeZones={() => setShowPotholeZones(!showPotholeZones)}
        showRatings={showRatings}
        onToggleRatings={() => setShowRatings(!showRatings)}
        showLive={showLive}
        onToggleLive={() => setShowLive(!showLive)}
        onOpenLive={() => setPanelMode('live')}
        onOpenEvents={() => setPanelMode('events')}
        onOpenReport={() => setReportOpen(true)}
      />

      <SosButton onClick={() => setPanelMode('sos')} />

      <button
        className="gm-locate-btn"
        onClick={() => locateMe(true)}
        title="Show your location"
      >
        <LocateFixed size={18} />
      </button>

      {isPickMode && (
        <div className="gm-pick-hint">
          {panelMode === 'addevent'
            ? 'Click the map where the event is'
            : 'Click the map on the exact spot'}
        </div>
      )}

      {hasGoogleMapsKey ? (
        <GoogleMapView
          apiKey={config.google_maps_api_key}
          segments={segments}
          features={features}
          showFeatures={showFeatures}
          events={eventsVisible ? events : []}
          routesData={routesData}
          selectedRouteIdx={selectedRouteIdx}
          showSafety={showSafety}
          showPolice={showPolice}
          showLighting={showLighting}
          hour={hour}
          userLocation={userLocation}
          showPotholeZones={showPotholeZones}
          showRatings={showRatings}
          ratingsReloadKey={contributionVersion}
          showLive={showLive || Boolean(routesData)}
          liveReloadKey={liveVersion}
          onMapClick={handleMapClick}
          onFeatureClick={(f) => handleMapClick({ lat: f.lat, lng: f.lng })}
          onSpotClick={(s) => handleMapClick({ lat: s.lat, lng: s.lng })}
          onLiveClick={(r) => {
            setLiveFocusId(r.report_id);
            setPanelMode('live');
          }}
          onEventClick={(e) => showOnMap(e.lat, e.lng, { noPanel: true, zoom: 15 })}
          onRouteSelect={setSelectedRouteIdx}
          markerLocation={markerLocation}
          pickMode={isPickMode}
          flyTo={flyTo}
          onPlacesServiceReady={setPlacesService}
        />
      ) : (
        <MapView
          segments={segments}
          features={features}
          showFeatures={showFeatures}
          events={eventsVisible ? events : []}
          routesData={routesData}
          selectedRouteIdx={selectedRouteIdx}
          showSafety={showSafety}
          showPolice={showPolice}
          showLighting={showLighting}
          hour={hour}
          userLocation={userLocation}
          onMapClick={handleMapClick}
          markerLocation={markerLocation}
          flyTo={flyTo}
        />
      )}

      {reportOpen && (
        <MunicipalityReport onClose={() => setReportOpen(false)} onShowOnMap={showOnMap} />
      )}
    </div>
  );
}
