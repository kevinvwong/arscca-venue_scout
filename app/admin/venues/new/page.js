"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const LOT_TYPES = [
  { value: "parking_lot",       label: "Parking Lot" },
  { value: "fairground",        label: "Fairground" },
  { value: "racetrack",         label: "Racetrack" },
  { value: "stadium",           label: "Stadium" },
  { value: "convention_center", label: "Convention Center" },
  { value: "other",             label: "Other" },
];

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC",
  "ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export default function NewVenuePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", address: "", city: "", state: "", zip: "",
    lot_type: "", estimated_acres: "",
    owner_name: "", owner_email: "", owner_phone: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Venue name is required."); return; }
    setError("");
    setSaving(true);
    try {
      const res  = await fetch("/api/admin/venues", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      router.push(`/admin?score=${data.venue.id}`);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="max-w-prose">
      <div className="mb-6">
        <a href="/admin" className="text-sm text-ink-muted hover:text-brand-600">← Venues</a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Add venue</h1>
        <p className="text-sm text-ink-muted mt-1">
          Enter what you know — everything except the name is optional.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5 bg-white rounded-xl border border-gray-200 p-6">
        {error && <div className="notice-error" role="alert">{error}</div>}

        <div>
          <label className="label" htmlFor="name">Venue name *</label>
          <input
            id="name"
            className="input"
            value={form.name}
            onChange={set("name")}
            placeholder="e.g. Stone Mountain Park East Lot"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="address">Street address</label>
          <input
            id="address"
            className="input"
            value={form.address}
            onChange={set("address")}
            placeholder="123 Main St"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="city">City</label>
            <input id="city" className="input" value={form.city} onChange={set("city")} />
          </div>
          <div>
            <label className="label" htmlFor="state">State</label>
            <select id="state" className="input" value={form.state} onChange={set("state")}>
              <option value="">—</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="lot_type">Lot type</label>
            <select id="lot_type" className="input" value={form.lot_type} onChange={set("lot_type")}>
              <option value="">—</option>
              {LOT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="estimated_acres">Estimated acres</label>
            <input
              id="estimated_acres"
              type="number"
              min="0"
              step="0.5"
              className="input"
              value={form.estimated_acres}
              onChange={set("estimated_acres")}
              placeholder="e.g. 6.5"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-4">
            Owner / Contact (optional)
          </p>
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="owner_name">Owner or property manager name</label>
              <input id="owner_name" className="input" value={form.owner_name} onChange={set("owner_name")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="owner_email">Email</label>
                <input
                  id="owner_email"
                  type="email"
                  className="input"
                  value={form.owner_email}
                  onChange={set("owner_email")}
                />
              </div>
              <div>
                <label className="label" htmlFor="owner_phone">Phone</label>
                <input
                  id="owner_phone"
                  type="tel"
                  className="input"
                  value={form.owner_phone}
                  onChange={set("owner_phone")}
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            rows={3}
            className="input resize-none"
            value={form.notes}
            onChange={set("notes")}
            placeholder="Anything notable about this venue — how you found it, constraints, conversations so far…"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Add venue"}
          </button>
          <a href="/admin" className="btn-outline">Cancel</a>
        </div>
      </form>
    </div>
  );
}
