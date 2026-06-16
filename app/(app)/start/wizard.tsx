"use client";

import { useState } from "react";
import { startProjectAction } from "./actions";

type ClientOpt = { id: string; name: string };

const DELIVERY: [string, string][] = [
  ["DFY", "Done for you"],
  ["DWY", "Done with you"],
  ["DIY", "Do it yourself"],
];
const GOALS: [string, string][] = [
  ["", "Goal (optional)"],
  ["BOOK_A_CALL", "Book a call"],
  ["BUY", "Buy"],
  ["REGISTER", "Register"],
];
const STEPS = ["Client", "Engagement", "Build", "Start"];

export function StartWizard({ clients, ghlReady }: { clients: ClientOpt[]; ghlReady: boolean }) {
  const [step, setStep] = useState(0);
  const [clientMode, setClientMode] = useState<"ghl" | "existing" | "new">(
    ghlReady ? "ghl" : clients.length ? "existing" : "new",
  );

  const field = "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm";
  const ghost = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50";
  const primary = "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700";

  const radio = (mode: typeof clientMode, label: string, hint: string, disabled = false) => (
    <label className={`flex items-start gap-2 rounded-lg border p-3 ${clientMode === mode ? "border-zinc-900" : "border-zinc-200"} ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="radio"
        name="clientModeRadio"
        className="mt-1"
        checked={clientMode === mode}
        disabled={disabled}
        onChange={() => setClientMode(mode)}
      />
      <span>
        <span className="block text-sm font-medium text-zinc-900">{label}</span>
        <span className="block text-xs text-zinc-500">{hint}</span>
      </span>
    </label>
  );

  return (
    <form action={startProjectAction} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="clientMode" value={clientMode} />

      <ol className="mb-6 flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${i === step ? "bg-zinc-900 text-white" : i < step ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"}`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {/* Step 0: client */}
      <div hidden={step !== 0} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-zinc-700">Who is this for?</h3>
        {radio("ghl", "Import from GoHighLevel", ghlReady ? "Pull the sub-account by its location id." : "Set GHL_API_TOKEN to enable.", !ghlReady)}
        {clientMode === "ghl" ? (
          <label className="text-sm font-medium text-zinc-700">
            GoHighLevel location id
            <input name="ghlLocationId" className={field} placeholder="e.g. ve9EPM428h8vShlRW1KT" />
          </label>
        ) : null}
        {clients.length ? radio("existing", "Existing client", "Pick a client already in the tool.") : null}
        {clientMode === "existing" ? (
          <label className="text-sm font-medium text-zinc-700">
            Client
            <select name="clientId" defaultValue="" className={field}>
              <option value="" disabled>
                Pick a client
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {radio("new", "New client by hand", "Create a client without GoHighLevel.")}
        {clientMode === "new" ? (
          <label className="text-sm font-medium text-zinc-700">
            Client name
            <input name="clientName" className={field} />
          </label>
        ) : null}
      </div>

      {/* Step 1: engagement */}
      <div hidden={step !== 1} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-zinc-700">The engagement</h3>
        <label className="text-sm font-medium text-zinc-700">
          Name
          <input name="engagementName" className={field} placeholder="e.g. Lead magnet funnel" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-zinc-700">
            Delivery model
            <select name="deliveryType" defaultValue="DFY" className={field}>
              {DELIVERY.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Currency
            <input name="currency" defaultValue="ZAR" className={field} />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            List price
            <input name="listPrice" type="number" min="0" className={field} />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Selling price
            <input name="price" type="number" min="0" className={field} />
          </label>
        </div>
      </div>

      {/* Step 2: build */}
      <div hidden={step !== 2} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-zinc-700">The funnel build</h3>
        <label className="text-sm font-medium text-zinc-700">
          Build name
          <input name="buildName" className={field} placeholder="Defaults to the engagement name" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-zinc-700">
            Conversion goal
            <select name="conversionGoal" defaultValue="" className={field}>
              {GOALS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Audience
            <input name="audienceSegment" className={field} />
          </label>
        </div>
      </div>

      {/* Step 3: start */}
      <div hidden={step !== 3} className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-zinc-700">Start with the brand messaging</h3>
        <p className="text-sm text-zinc-600">
          Creating the project builds the full BRS pipeline from the template. The Brand Messaging
          Playbook is the first thing to do, so you will land straight in it to start the session.
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          className={ghost}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className={primary} onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        ) : (
          <button type="submit" className={primary}>
            Create and open the playbook
          </button>
        )}
      </div>
    </form>
  );
}
