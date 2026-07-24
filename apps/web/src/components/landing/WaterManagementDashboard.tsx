"use client";

import Link from "next/link";
import { KeyboardEvent, useMemo, useState, WheelEvent } from "react";
import {
  MOCK_PONDS,
  MOCK_VERIFICATION_ALERTS,
  MockPond,
  MockVerificationAlert,
} from "@/lib/mock-data";

type PondStatus = "normal" | "warning" | "critical" | "inactive";
type StaffStatus = "online" | "offline" | "on-duty";

type ProjectedPoint = {
  x: number;
  y: number;
};

type PondReading = {
  waterLevel: number;
  temperature: string;
  ph: string;
  lastInspection: string;
};

type PondViewModel = {
  id: string;
  name: string;
  location: string;
  species: string;
  stock: number;
  areaSqm: number;
  status: PondStatus;
  points: string;
  centroid: ProjectedPoint;
  reading: PondReading;
  assignedStaff: string;
  alerts: MockVerificationAlert[];
};

type StaffMember = {
  id: string;
  name: string;
  initials: string;
  role: string;
  assignedPondId: string;
  status: StaffStatus;
  lastActivity: string;
  shift: string;
  contact: string;
  focus: string;
};

const STATUS_META: Record<PondStatus, { label: string; tone: string; description: string }> = {
  normal: {
    label: "Normal",
    tone: "normal",
    description: "Water readings are inside the operating range.",
  },
  warning: {
    label: "Warning",
    tone: "warning",
    description: "Attention recommended during the next field round.",
  },
  critical: {
    label: "Critical",
    tone: "critical",
    description: "Immediate review is needed by the operations team.",
  },
  inactive: {
    label: "Inactive",
    tone: "inactive",
    description: "Telemetry or pond operations are currently paused.",
  },
};

const WATER_READINGS: Record<string, PondReading> = {
  "pond-1-laguna-north": {
    waterLevel: 84,
    temperature: "27.8 C",
    ph: "7.3",
    lastInspection: "July 7, 2026, 8:20 AM",
  },
  "pond-2-laguna-south": {
    waterLevel: 78,
    temperature: "28.6 C",
    ph: "7.1",
    lastInspection: "July 7, 2026, 7:45 AM",
  },
  "pond-3-bulacan-delta": {
    waterLevel: 69,
    temperature: "30.4 C",
    ph: "6.7",
    lastInspection: "July 6, 2026, 5:10 PM",
  },
  "pond-4-rizal-hillside": {
    waterLevel: 46,
    temperature: "32.1 C",
    ph: "5.9",
    lastInspection: "July 7, 2026, 6:35 AM",
  },
};

const STAFF_MEMBERS: StaffMember[] = [
  {
    id: "staff-miguel",
    name: "Miguel Cruz",
    initials: "MC",
    role: "Pond Technician",
    assignedPondId: "pond-3-bulacan-delta",
    status: "on-duty",
    lastActivity: "Checked aerators 12 min ago",
    shift: "6:00 AM - 2:00 PM",
    contact: "miguel@aquapin.com",
    focus: "Dissolved oxygen response",
  },
  {
    id: "staff-sarah",
    name: "Sarah Santos",
    initials: "SS",
    role: "Water Quality Lead",
    assignedPondId: "pond-2-laguna-south",
    status: "online",
    lastActivity: "Uploaded pH sample 24 min ago",
    shift: "7:00 AM - 3:00 PM",
    contact: "sarah@aquapin.com",
    focus: "pH and salinity checks",
  },
  {
    id: "staff-jose",
    name: "Jose Rizal",
    initials: "JR",
    role: "Field Supervisor",
    assignedPondId: "pond-4-rizal-hillside",
    status: "on-duty",
    lastActivity: "Filed mortality review 31 min ago",
    shift: "5:00 AM - 1:00 PM",
    contact: "jose@aquapin.com",
    focus: "Critical response coordination",
  },
  {
    id: "staff-ana",
    name: "Ana Reyes",
    initials: "AR",
    role: "Feed Coordinator",
    assignedPondId: "pond-1-laguna-north",
    status: "online",
    lastActivity: "Adjusted feed plan 43 min ago",
    shift: "8:00 AM - 4:00 PM",
    contact: "ana@aquapin.com",
    focus: "Feed inventory and ration plan",
  },
  {
    id: "staff-lara",
    name: "Lara Kim",
    initials: "LK",
    role: "Pond Technician",
    assignedPondId: "pond-2-laguna-south",
    status: "offline",
    lastActivity: "Completed morning round 2 hr ago",
    shift: "4:00 AM - 12:00 PM",
    contact: "lara@aquapin.com",
    focus: "Net checks and visual inspection",
  },
  {
    id: "staff-ben",
    name: "Ben Torres",
    initials: "BT",
    role: "Maintenance",
    assignedPondId: "pond-3-bulacan-delta",
    status: "on-duty",
    lastActivity: "Serviced pump bay 9 min ago",
    shift: "6:00 AM - 2:00 PM",
    contact: "ben@aquapin.com",
    focus: "Pump and aerator uptime",
  },
  {
    id: "staff-maya",
    name: "Maya Lim",
    initials: "ML",
    role: "Water Quality Lead",
    assignedPondId: "pond-1-laguna-north",
    status: "offline",
    lastActivity: "Reviewed sensor drift yesterday",
    shift: "2:00 PM - 10:00 PM",
    contact: "maya@aquapin.com",
    focus: "Sensor calibration",
  },
  {
    id: "staff-paolo",
    name: "Paolo Garcia",
    initials: "PG",
    role: "Field Supervisor",
    assignedPondId: "pond-4-rizal-hillside",
    status: "online",
    lastActivity: "Assigned response checklist 1 hr ago",
    shift: "10:00 AM - 6:00 PM",
    contact: "paolo@aquapin.com",
    focus: "Staff dispatch and verification",
  },
];

function getPondStatus(pond: MockPond): PondStatus {
  const alerts = MOCK_VERIFICATION_ALERTS.filter((alert) => alert.pondId === pond.id);

  if (!pond.isActive) return "inactive";
  if (pond.currentStockCount < 1000 || alerts.some((alert) => alert.severity === "danger")) {
    return "critical";
  }
  if (pond.currentStockCount < 2500 || alerts.some((alert) => alert.severity === "warning")) {
    return "warning";
  }
  return "normal";
}

function getProjectionBounds(ponds: MockPond[]) {
  const coordinates = ponds.flatMap((pond) =>
    pond.boundary && pond.boundary.length >= 3 ? pond.boundary : [pond.coordinates],
  );
  const latitudes = coordinates.map((point) => point.lat);
  const longitudes = coordinates.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latPad = Math.max((maxLat - minLat) * 0.16, 0.006);
  const lngPad = Math.max((maxLng - minLng) * 0.16, 0.006);

  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

function projectPoint(
  point: { lat: number; lng: number },
  bounds: ReturnType<typeof getProjectionBounds>,
): ProjectedPoint {
  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;

  return {
    x: ((point.lng - bounds.minLng) / lngSpan) * 100,
    y: (1 - (point.lat - bounds.minLat) / latSpan) * 100,
  };
}

function createFallbackBoundary(pond: MockPond) {
  const offset = 0.001;

  return [
    { lat: pond.coordinates.lat + offset, lng: pond.coordinates.lng - offset },
    { lat: pond.coordinates.lat + offset, lng: pond.coordinates.lng + offset },
    { lat: pond.coordinates.lat - offset, lng: pond.coordinates.lng + offset },
    { lat: pond.coordinates.lat - offset, lng: pond.coordinates.lng - offset },
  ];
}

function getCentroid(points: ProjectedPoint[]): ProjectedPoint {
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function expandBoundaryForDisplay(points: ProjectedPoint[]): ProjectedPoint[] {
  const centroid = getCentroid(points);
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const width = Math.max(...xValues) - Math.min(...xValues);
  const height = Math.max(...yValues) - Math.min(...yValues);
  const largestDimension = Math.max(width, height, 0.1);
  const scale = Math.min(Math.max(7 / largestDimension, 1), 24);

  return points.map((point) => ({
    x: Math.max(3, Math.min(97, centroid.x + (point.x - centroid.x) * scale)),
    y: Math.max(3, Math.min(97, centroid.y + (point.y - centroid.y) * scale)),
  }));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function statusLabel(status: StaffStatus) {
  if (status === "on-duty") return "On duty";
  if (status === "online") return "Online";
  return "Offline";
}

export default function WaterManagementDashboard() {
  const [hoveredPondId, setHoveredPondId] = useState<string | null>(null);
  const [selectedPondId, setSelectedPondId] = useState<string | null>("pond-4-rizal-hillside");
  const [staffSearch, setStaffSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StaffStatus | "all">("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [pondFilter, setPondFilter] = useState("all");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const ponds = useMemo<PondViewModel[]>(() => {
    const bounds = getProjectionBounds(MOCK_PONDS);

    return MOCK_PONDS.map((pond) => {
      const boundary = pond.boundary && pond.boundary.length >= 3 ? pond.boundary : createFallbackBoundary(pond);
      const projected = expandBoundaryForDisplay(boundary.map((point) => projectPoint(point, bounds)));
      const alerts = MOCK_VERIFICATION_ALERTS.filter((alert) => alert.pondId === pond.id);
      const assignedStaff =
        STAFF_MEMBERS.find((staff) => staff.assignedPondId === pond.id)?.name ?? pond.createdByName;

      return {
        id: pond.id,
        name: pond.name,
        location: pond.location,
        species: pond.currentSpecies ?? "Unassigned",
        stock: pond.currentStockCount,
        areaSqm: pond.areaSqm,
        status: getPondStatus(pond),
        points: projected.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),
        centroid: getCentroid(projected),
        reading:
          WATER_READINGS[pond.id] ??
          ({
            waterLevel: 0,
            temperature: "No data",
            ph: "No data",
            lastInspection: "No inspection recorded",
          } satisfies PondReading),
        assignedStaff,
        alerts,
      };
    });
  }, []);

  const selectedPond = ponds.find((pond) => pond.id === selectedPondId) ?? null;
  const hoveredPond = ponds.find((pond) => pond.id === hoveredPondId) ?? null;
  const selectedStaff = STAFF_MEMBERS.find((staff) => staff.id === selectedStaffId) ?? null;
  const roleOptions = Array.from(new Set(STAFF_MEMBERS.map((staff) => staff.role)));
  const activeAlerts = ponds.reduce((total, pond) => total + pond.alerts.length, 0);
  const normalCount = ponds.filter((pond) => pond.status === "normal").length;
  const warningCount = ponds.filter((pond) => pond.status === "warning").length;
  const criticalCount = ponds.filter((pond) => pond.status === "critical").length;

  const filteredStaff = STAFF_MEMBERS.filter((staff) => {
    const normalizedSearch = staffSearch.trim().toLowerCase();
    const pondName = ponds.find((pond) => pond.id === staff.assignedPondId)?.name ?? "";
    const matchesSearch =
      normalizedSearch.length === 0 ||
      staff.name.toLowerCase().includes(normalizedSearch) ||
      staff.role.toLowerCase().includes(normalizedSearch) ||
      pondName.toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter === "all" || staff.status === statusFilter;
    const matchesRole = roleFilter === "all" || staff.role === roleFilter;
    const matchesPond = pondFilter === "all" || staff.assignedPondId === pondFilter;

    return matchesSearch && matchesStatus && matchesRole && matchesPond;
  });

  function selectPondWithKeyboard(event: KeyboardEvent<SVGGElement>, pondId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelectedPondId(pondId);
  }

  function handleStaffWheel(event: WheelEvent<HTMLDivElement>) {
    const list = event.currentTarget;
    const atTop = list.scrollTop <= 0;
    const atBottom = Math.ceil(list.scrollTop + list.clientHeight) >= list.scrollHeight;
    const canScrollUp = event.deltaY < 0 && !atTop;
    const canScrollDown = event.deltaY > 0 && !atBottom;

    if (canScrollUp || canScrollDown) {
      event.preventDefault();
      event.stopPropagation();
      list.scrollTop += event.deltaY;
    }
  }

  return (
    <section className="water-dashboard" aria-labelledby="water-dashboard-title">
      <div className="water-dashboard-head">
        <div>
          <p className="water-kicker">Live water-management dashboard</p>
          <h2 id="water-dashboard-title">Monitored ponds, staff, and response status</h2>
        </div>
        <div className="water-dashboard-actions" aria-label="Dashboard actions">
          <Link href="/login">Open admin console</Link>
          <Link href="#map">Review ponds</Link>
        </div>
      </div>

      <div className="water-metric-grid" aria-label="Water operations summary">
        <article className="water-metric-card">
          <span>Monitored ponds</span>
          <strong>{ponds.length}</strong>
          <p>{normalCount} normal, {warningCount} warning, {criticalCount} critical</p>
        </article>
        <article className="water-metric-card">
          <span>Active alerts</span>
          <strong>{activeAlerts}</strong>
          <p>Verification and water-quality items</p>
        </article>
        <article className="water-metric-card">
          <span>Staff online</span>
          <strong>{STAFF_MEMBERS.filter((staff) => staff.status !== "offline").length}</strong>
          <p>{STAFF_MEMBERS.filter((staff) => staff.status === "on-duty").length} currently on duty</p>
        </article>
        <article className="water-metric-card">
          <span>Average water level</span>
          <strong>
            {Math.round(
              ponds.reduce((total, pond) => total + pond.reading.waterLevel, 0) / Math.max(ponds.length, 1),
            )}
            %
          </strong>
          <p>Across active sensor readings</p>
        </article>
      </div>

      <div className="water-dashboard-grid">
        <section className="water-map-panel" id="map" aria-labelledby="water-map-title">
          <div className="water-panel-head">
            <div>
              <p className="water-kicker">Pond boundary map</p>
              <h3 id="water-map-title">All monitored ponds</h3>
            </div>
            <div className="water-map-legend" aria-label="Map legend">
              {(Object.keys(STATUS_META) as PondStatus[]).map((status) => (
                <span className={`water-legend-item is-${status}`} key={status}>
                  <span aria-hidden="true" />
                  {STATUS_META[status].label}
                </span>
              ))}
            </div>
          </div>

          <div className="water-map-workspace">
            <div className="water-map-canvas" aria-label="Interactive pond polygons">
              <svg className="water-map-svg" viewBox="0 0 100 100" role="img" aria-labelledby="map-svg-title">
                <title id="map-svg-title">AquaPin monitored pond polygon boundaries</title>
                <defs>
                  <linearGradient id="waterSurface" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0f4250" />
                    <stop offset="52%" stopColor="#082b35" />
                    <stop offset="100%" stopColor="#041b24" />
                  </linearGradient>
                  <pattern id="waterGrid" width="8" height="8" patternUnits="userSpaceOnUse">
                    <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(142, 229, 218, 0.12)" strokeWidth="0.35" />
                  </pattern>
                </defs>
                <rect width="100" height="100" rx="4" fill="url(#waterSurface)" />
                <rect width="100" height="100" rx="4" fill="url(#waterGrid)" />
                <path
                  className="water-map-current"
                  d="M2 72 C20 63 31 79 45 68 C60 55 73 60 98 49 L98 100 L2 100 Z"
                />
                <path
                  className="water-map-coast"
                  d="M0 20 C18 15 30 24 45 18 C62 11 73 18 100 9 L100 0 L0 0 Z"
                />

                {ponds.map((pond) => {
                  const isSelected = selectedPondId === pond.id;
                  const isHovered = hoveredPondId === pond.id;

                  return (
                    <g
                      className={`water-map-pond is-${pond.status}${isSelected ? " is-selected" : ""}${
                        isHovered ? " is-hovered" : ""
                      }`}
                      key={pond.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${pond.name}, ${STATUS_META[pond.status].label}. Open pond details.`}
                      aria-pressed={isSelected}
                      onBlur={() => setHoveredPondId(null)}
                      onClick={() => setSelectedPondId(pond.id)}
                      onFocus={() => setHoveredPondId(pond.id)}
                      onKeyDown={(event) => selectPondWithKeyboard(event, pond.id)}
                      onMouseEnter={() => setHoveredPondId(pond.id)}
                      onMouseLeave={() => setHoveredPondId(null)}
                    >
                      <title>{pond.name}</title>
                      <polygon points={pond.points} />
                    </g>
                  );
                })}

                {hoveredPond ? (
                  <g className="water-map-hover-label" aria-hidden="true">
                    <rect
                      x={Math.max(4, Math.min(hoveredPond.centroid.x - 15, 66))}
                      y={Math.max(4, hoveredPond.centroid.y - 10)}
                      width="30"
                      height="7"
                      rx="2"
                    />
                    <text x={hoveredPond.centroid.x} y={Math.max(8.8, hoveredPond.centroid.y - 5.4)}>
                      {hoveredPond.name.replace(" Pond ", " ")}
                    </text>
                  </g>
                ) : null}
              </svg>

              {hoveredPond ? (
                <div className={`water-map-chip is-${hoveredPond.status}`} role="status">
                  <strong>{hoveredPond.name}</strong>
                  <span>{STATUS_META[hoveredPond.status].label}</span>
                </div>
              ) : null}
            </div>

            <aside className="water-pond-details" aria-live="polite">
              {selectedPond ? (
                <>
                  <div className="water-details-head">
                    <div>
                      <span className={`water-status-pill is-${selectedPond.status}`}>
                        {STATUS_META[selectedPond.status].label}
                      </span>
                      <h4>{selectedPond.name}</h4>
                      <p>{selectedPond.location}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedPondId(null)} aria-label="Close pond details">
                      Close
                    </button>
                  </div>

                  <div className="water-detail-grid">
                    <article>
                      <span>Current status</span>
                      <strong>{STATUS_META[selectedPond.status].label}</strong>
                    </article>
                    <article>
                      <span>Water level</span>
                      <strong>{selectedPond.reading.waterLevel}%</strong>
                    </article>
                    <article>
                      <span>Temperature</span>
                      <strong>{selectedPond.reading.temperature}</strong>
                    </article>
                    <article>
                      <span>pH level</span>
                      <strong>{selectedPond.reading.ph}</strong>
                    </article>
                    <article>
                      <span>Assigned staff</span>
                      <strong>{selectedPond.assignedStaff}</strong>
                    </article>
                    <article>
                      <span>Stock</span>
                      <strong>{formatNumber(selectedPond.stock)}</strong>
                    </article>
                    <article>
                      <span>Area</span>
                      <strong>{formatNumber(selectedPond.areaSqm)} sqm</strong>
                    </article>
                  </div>

                  <div className="water-detail-row">
                    <span>Last inspection</span>
                    <strong>{selectedPond.reading.lastInspection}</strong>
                  </div>
                  <div className="water-detail-row">
                    <span>Status note</span>
                    <strong>{STATUS_META[selectedPond.status].description}</strong>
                  </div>

                  <div className="water-alert-list" id="alerts">
                    <span>Recent alerts</span>
                    {selectedPond.alerts.length > 0 ? (
                      selectedPond.alerts.map((alert) => (
                        <article className={`water-alert-item is-${alert.severity}`} key={alert.id}>
                          <strong>{alert.message}</strong>
                          <p>{alert.detail}</p>
                        </article>
                      ))
                    ) : (
                      <article className="water-alert-item is-clear">
                        <strong>No active alerts</strong>
                        <p>Latest readings are inside configured limits.</p>
                      </article>
                    )}
                  </div>

                  <Link className="water-full-details" href="/login">
                    View Full Details
                  </Link>
                </>
              ) : (
                <div className="water-empty-details">
                  <span>No pond selected</span>
                  <p>Select a pond boundary to review water readings, staff assignment, and recent alerts.</p>
                </div>
              )}
            </aside>
          </div>
        </section>

        <aside className="water-staff-panel" id="staff" aria-labelledby="water-staff-title">
          <div className="water-staff-fixed">
            <div className="water-panel-head">
              <div>
                <p className="water-kicker">Staff coordination</p>
                <h3 id="water-staff-title">Field team</h3>
              </div>
              <span className="water-staff-count">{filteredStaff.length}/{STAFF_MEMBERS.length}</span>
            </div>

            <label className="water-search-field">
              <span>Search staff</span>
              <input
                type="search"
                value={staffSearch}
                onChange={(event) => setStaffSearch(event.target.value)}
                placeholder="Name, role, or pond"
              />
            </label>

            <div className="water-filter-grid" aria-label="Staff filters">
              <label>
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StaffStatus | "all")}
                >
                  <option value="all">All</option>
                  <option value="online">Online</option>
                  <option value="on-duty">On duty</option>
                  <option value="offline">Offline</option>
                </select>
              </label>
              <label>
                <span>Role</span>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="all">All roles</option>
                  {roleOptions.map((role) => (
                    <option value={role} key={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Pond</span>
                <select value={pondFilter} onChange={(event) => setPondFilter(event.target.value)}>
                  <option value="all">All ponds</option>
                  {ponds.map((pond) => (
                    <option value={pond.id} key={pond.id}>
                      {pond.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div
            className="water-staff-list"
            role="list"
            tabIndex={0}
            aria-label="Scrollable staff entries"
            onWheel={handleStaffWheel}
          >
            {filteredStaff.map((staff) => {
              const assignedPond = ponds.find((pond) => pond.id === staff.assignedPondId);
              const isSelected = staff.id === selectedStaffId;

              return (
                <button
                  className={`water-staff-entry is-${staff.status}${isSelected ? " is-selected" : ""}`}
                  type="button"
                  role="listitem"
                  key={staff.id}
                  onClick={() => setSelectedStaffId(staff.id)}
                >
                  <span className="water-staff-avatar" aria-hidden="true">
                    {staff.initials}
                  </span>
                  <span className="water-staff-copy">
                    <strong>{staff.name}</strong>
                    <span>{staff.role}</span>
                    <small>{assignedPond?.name ?? "Unassigned"}</small>
                  </span>
                  <span className="water-staff-meta">
                    <span className={`water-staff-status is-${staff.status}`}>{statusLabel(staff.status)}</span>
                    <small>{staff.lastActivity}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedStaff ? (
            <div className="water-staff-drawer" role="dialog" aria-label={`${selectedStaff.name} details`}>
              <button type="button" onClick={() => setSelectedStaffId(null)} aria-label="Close staff details">
                Close
              </button>
              <span className={`water-staff-status is-${selectedStaff.status}`}>
                {statusLabel(selectedStaff.status)}
              </span>
              <h4>{selectedStaff.name}</h4>
              <p>{selectedStaff.role}</p>
              <dl>
                <div>
                  <dt>Assigned pond</dt>
                  <dd>{ponds.find((pond) => pond.id === selectedStaff.assignedPondId)?.name ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Shift</dt>
                  <dd>{selectedStaff.shift}</dd>
                </div>
                <div>
                  <dt>Last activity</dt>
                  <dd>{selectedStaff.lastActivity}</dd>
                </div>
                <div>
                  <dt>Focus</dt>
                  <dd>{selectedStaff.focus}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
