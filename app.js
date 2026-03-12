const REGION_GROUPS = {
  AMER: [
    { label: "North America (Eastern)", tz: "America/New_York" },
    { label: "North America (Pacific)", tz: "America/Los_Angeles" },
    { label: "South America (Brazil)", tz: "America/Sao_Paulo" }
  ],
  EMEA: [
    { label: "United Kingdom / Ireland", tz: "Europe/London" },
    { label: "Europe (Central)", tz: "Europe/Berlin" },
    { label: "Middle East (UAE)", tz: "Asia/Dubai" }
  ],
  APAC: [
    { label: "India", tz: "Asia/Kolkata" },
    { label: "East Asia (Japan)", tz: "Asia/Tokyo" },
    { label: "Southeast Asia (Singapore)", tz: "Asia/Singapore" },
    { label: "Australia (Sydney)", tz: "Australia/Sydney" },
    { label: "New Zealand", tz: "Pacific/Auckland" }
  ]
};

const attendeeList = document.getElementById("attendeeList");
const addAttendeeBtn = document.getElementById("addAttendeeBtn");
const findSlotsBtn = document.getElementById("findSlotsBtn");
const resultsDiv = document.getElementById("results");

const meetingDateInput = document.getElementById("meetingDate");
const durationInput = document.getElementById("duration");
const workStartInput = document.getElementById("workStart");
const workEndInput = document.getElementById("workEnd");

function setDefaultDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  meetingDateInput.value = `${yyyy}-${mm}-${dd}`;
}

function groupOptionsHtml(selectedGroup) {
  return Object.keys(REGION_GROUPS)
    .map((group) => `<option value="${group}" ${group === selectedGroup ? "selected" : ""}>${group}</option>`)
    .join("");
}

function getGroupByTimezone(tz) {
  for (const [group, regions] of Object.entries(REGION_GROUPS)) {
    if (regions.some((region) => region.tz === tz)) {
      return group;
    }
  }
  return "EMEA";
}

function getRegionsForGroup(group) {
  return REGION_GROUPS[group] || REGION_GROUPS.EMEA;
}

function setRegionOptions(select, group, preferredTz) {
  const regions = getRegionsForGroup(group);
  select.innerHTML = regions
    .map((region) => `<option value="${region.tz}">${region.label}</option>`)
    .join("");

  const available = regions.some((region) => region.tz === preferredTz);
  select.value = available ? preferredTz : regions[0].tz;
}

function getRegionLabelByTimezone(tz) {
  for (const regions of Object.values(REGION_GROUPS)) {
    const found = regions.find((region) => region.tz === tz);
    if (found) {
      return found.label;
    }
  }
  return tz;
}

function addAttendeeRow(name = "", tz = "Europe/London") {
  const group = getGroupByTimezone(tz);
  const row = document.createElement("div");
  row.className = "attendee-row";
  row.innerHTML = `
    <div>
      <label>Attendee Name</label>
      <input type="text" placeholder="e.g. Ana" value="${name}" class="attendee-name" />
    </div>
    <div>
      <label>Region Group</label>
      <select class="attendee-group">${groupOptionsHtml(group)}</select>
    </div>
    <div>
      <label>Region</label>
      <select class="attendee-region"></select>
    </div>
    <div>
      <button type="button" class="remove-btn">Remove</button>
    </div>
  `;

  attendeeList.appendChild(row);

  const groupSelect = row.querySelector(".attendee-group");
  const regionSelect = row.querySelector(".attendee-region");

  setRegionOptions(regionSelect, group, tz);

  groupSelect.addEventListener("change", () => {
    setRegionOptions(regionSelect, groupSelect.value);
  });

  row.querySelector(".remove-btn").addEventListener("click", () => {
    if (attendeeList.children.length > 1) {
      row.remove();
    } else {
      window.alert("At least one attendee is required.");
    }
  });
}

function parseHmToMinutes(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function getLocalMinutes(dateUtc, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(dateUtc);

  const hour = Number(parts.find((part) => part.type === "hour").value);
  const minute = Number(parts.find((part) => part.type === "minute").value);
  return hour * 60 + minute;
}

function isWithinWorkingHours(startUtc, endUtc, timeZone, workStartMin, workEndMin) {
  const localStart = getLocalMinutes(startUtc, timeZone);
  const localEnd = getLocalMinutes(endUtc, timeZone);
  return localStart >= workStartMin && localEnd <= workEndMin;
}

function formatInZone(dateUtc, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(dateUtc);
}

function averageComfortScore(startUtc, attendees) {
  // Prefer meetings closer to 1:00 PM local time for each attendee.
  const target = 13 * 60;
  let score = 0;
  for (const attendee of attendees) {
    const mins = getLocalMinutes(startUtc, attendee.tz);
    score += Math.abs(mins - target);
  }
  return score / attendees.length;
}

function collectAttendees() {
  const rows = [...attendeeList.querySelectorAll(".attendee-row")];
  return rows.map((row) => {
    const name = row.querySelector(".attendee-name").value.trim() || "Attendee";
    const tz = row.querySelector(".attendee-region").value;
    return {
      name,
      tz,
      regionLabel: getRegionLabelByTimezone(tz)
    };
  });
}

function findSlots() {
  const dateStr = meetingDateInput.value;
  const durationMin = Number(durationInput.value);
  const workStartMin = parseHmToMinutes(workStartInput.value);
  const workEndMin = parseHmToMinutes(workEndInput.value);
  const attendees = collectAttendees();

  if (!dateStr) {
    window.alert("Please choose a meeting date.");
    return;
  }
  if (!durationMin || durationMin < 15) {
    window.alert("Please enter a valid duration (minimum 15 minutes).");
    return;
  }
  if (workEndMin <= workStartMin) {
    window.alert("Workday end must be later than start.");
    return;
  }

  const dayStartUtc = new Date(`${dateStr}T00:00:00Z`);
  const dayEndUtc = new Date(`${dateStr}T23:59:59Z`);

  const candidateSlots = [];
  const stepMin = 30;

  for (let t = dayStartUtc.getTime(); t <= dayEndUtc.getTime(); t += stepMin * 60000) {
    const startUtc = new Date(t);
    const endUtc = new Date(t + durationMin * 60000);

    const okForAll = attendees.every((attendee) =>
      isWithinWorkingHours(startUtc, endUtc, attendee.tz, workStartMin, workEndMin)
    );

    if (okForAll) {
      candidateSlots.push({
        startUtc,
        endUtc,
        comfort: averageComfortScore(startUtc, attendees)
      });
    }
  }

  candidateSlots.sort((a, b) => a.comfort - b.comfort);
  renderResults(candidateSlots.slice(0, 8), attendees);
}

function renderResults(slots, attendees) {
  if (!slots.length) {
    resultsDiv.innerHTML = `
      <p class="muted">
        No overlapping slots found for the selected date and work hours.
        Try extending work hours or adding another date.
      </p>
    `;
    return;
  }

  const uniqueZones = [];
  for (const attendee of attendees) {
    if (!uniqueZones.find((zone) => zone.tz === attendee.tz)) {
      uniqueZones.push({ tz: attendee.tz, label: attendee.regionLabel });
    }
  }

  const headers = uniqueZones.map((zone) => `<th>${zone.label}</th>`).join("");

  const rows = slots
    .map((slot, idx) => {
      const utcText = `${formatInZone(slot.startUtc, "UTC")} - ${formatInZone(slot.endUtc, "UTC")} (UTC)`;
      const perZone = uniqueZones
        .map((zone) => `<td>${formatInZone(slot.startUtc, zone.tz)} - ${formatInZone(slot.endUtc, zone.tz)}</td>`)
        .join("");

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${utcText}</td>
          ${perZone}
        </tr>
      `;
    })
    .join("");

  resultsDiv.innerHTML = `
    <div class="results-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>UTC Slot</th>
            ${headers}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted">
      Suggestions are ranked by local-time comfort (closer to midday for all regions).
    </p>
  `;
}

addAttendeeBtn.addEventListener("click", () => addAttendeeRow());
findSlotsBtn.addEventListener("click", findSlots);

setDefaultDate();
addAttendeeRow("Host", "Europe/London");
addAttendeeRow("Teammate A", "America/New_York");
addAttendeeRow("Teammate B", "Asia/Singapore");
