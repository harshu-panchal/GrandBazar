import React, { useMemo, useState } from "react";
import { GoogleMap, useJsApiLoader, Circle } from "@react-google-maps/api";
import { Map } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { inr, TrendChip } from "@shared/components/dashboard/common";
import { getGoogleMapsJsApiLoaderOptions } from "@/core/services/googleMapsLoader";

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const mapContainerStyle = { width: "100%", height: "100%" };

const CITY_COLORS = [
  "#4f46e5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

const CityMapPanel = ({ rows, mapUnlocked, onUnlock }) => {
  const googleMapApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError } = useJsApiLoader(
    getGoogleMapsJsApiLoaderOptions(googleMapApiKey),
  );

  const withCoords = useMemo(
    () => (rows || []).filter((r) => r.lat != null && r.lng != null && r.weekSales > 0),
    [rows],
  );
  const maxSales = useMemo(
    () => Math.max(...withCoords.map((r) => r.weekSales || r.sales || 0), 1),
    [withCoords],
  );

  if (!mapUnlocked) {
    return (
      <div className="h-[280px] rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
          <Map className="h-5 w-5" />
        </div>
        <p className="text-xs text-slate-600 max-w-xs">
          Google Maps loads only when needed. Open the map to see city sales density.
        </p>
        <button
          type="button"
          onClick={onUnlock}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
        >
          Open Map
        </button>
      </div>
    );
  }

  if (!googleMapApiKey || loadError) {
    return (
      <div className="h-[280px] rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-500 p-4 text-center">
        Map unavailable. Configure VITE_GOOGLE_MAPS_API_KEY to enable city circles.
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="h-[280px] rounded-xl bg-slate-100 animate-pulse" />;
  }

  return (
    <div className="h-[280px] rounded-xl overflow-hidden ring-1 ring-slate-100">
      <GoogleMap mapContainerStyle={mapContainerStyle} center={DEFAULT_CENTER} zoom={5} options={{ disableDefaultUI: true }}>
        {withCoords.map((city, i) => {
          const sales = city.weekSales || city.sales || 0;
          const radius = 8000 + (sales / maxSales) * 42000;
          const color = CITY_COLORS[i % CITY_COLORS.length];
          return (
            <Circle
              key={city.city}
              center={{ lat: city.lat, lng: city.lng }}
              radius={radius}
              options={{
                fillColor: color,
                fillOpacity: 0.35,
                strokeColor: color,
                strokeOpacity: 0.8,
                strokeWeight: 1,
              }}
            />
          );
        })}
      </GoogleMap>
    </div>
  );
};

const CityWiseSales = ({ cityWiseSales }) => {
  const [showAll, setShowAll] = useState(false);
  const [mapUnlocked, setMapUnlocked] = useState(false);

  const rows = cityWiseSales?.rows || [];
  const totals = cityWiseSales?.totals || { sales: 0, orders: 0 };
  const visible = showAll ? rows : rows.slice(0, 6);

  return (
    <Card
      title="Sales Overview (City Wise)"
      subtitle="Today · circle size reflects weekly sales"
      headerAction={
        rows.length > 6 ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-semibold text-primary hover:text-primary/80"
          >
            {showAll ? "Show Less" : "View All Cities"}
          </button>
        ) : null
      }
      contentClassName="p-4"
      className="h-full"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CityMapPanel rows={rows} mapUnlocked={mapUnlocked} onUnlock={() => setMapUnlocked(true)} />
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-bold uppercase text-slate-400 border-b border-slate-100">
                <th className="pb-2">City</th>
                <th className="pb-2 text-right">Sales (Today)</th>
                <th className="pb-2 text-right">Orders</th>
                <th className="pb-2 text-right">Growth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-slate-400">
                    No city data yet
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={row.city}>
                    <td className="py-2.5 text-sm font-semibold text-slate-800">{row.city}</td>
                    <td className="py-2.5 text-sm font-bold text-slate-900 text-right">{inr(row.sales)}</td>
                    <td className="py-2.5 text-sm text-slate-600 text-right">{row.orders}</td>
                    <td className="py-2.5 text-right">
                      <TrendChip pct={row.growthPct} />
                    </td>
                  </tr>
                ))
              )}
              {visible.length > 0 && (
                <tr className="bg-slate-50/80 font-bold">
                  <td className="py-2.5 text-sm text-slate-800">Total</td>
                  <td className="py-2.5 text-sm text-right">{inr(totals.sales)}</td>
                  <td className="py-2.5 text-sm text-right">{totals.orders}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
};

export default CityWiseSales;
