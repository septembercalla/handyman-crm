import type {
  Customer,
  Handyman,
  Task,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  TaskStatusHistoryEntry,
  User,
} from "@/lib/types";
import { addDays, todayISO } from "@/lib/format";

/**
 * Demo data. Replaced by the real API from SPEC §5 — same response shapes.
 * All addresses are in the Nashville, TN area (as in the reference).
 */

export const DEMO_USER: User = {
  id: "u-1",
  email: "dispatcher@handyman.crm",
  full_name: "Alex Dispatcher",
  role: "admin",
  is_active: true,
  created_at: "2026-01-12T09:00:00.000Z",
};

export const HANDYMEN: Handyman[] = [
  {
    id: "h-1",
    full_name: "Marcus Webb",
    phone: "+1 (615) 555-0142",
    email: "marcus.webb@example.com",
    skills: ["plumbing", "appliance", "general"],
    hourly_rate: 65,
    color: "#1A6FE0",
    status: "active",
    notes: "Certified for gas appliances. Does not work Sundays.",
    created_at: "2026-02-01T09:00:00.000Z",
    updated_at: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "h-2",
    full_name: "Tornike Kiladze",
    phone: "+1 (615) 555-0198",
    email: "tornike.k@example.com",
    skills: ["electrical", "hvac", "general"],
    hourly_rate: 72,
    color: "#1F8A4C",
    status: "active",
    notes: "Licensed TN electrician. Takes urgent call-outs.",
    created_at: "2026-02-03T09:00:00.000Z",
    updated_at: "2026-08-11T09:00:00.000Z",
  },
  {
    id: "h-3",
    full_name: "Dana Ruiz",
    phone: "+1 (615) 555-0177",
    email: "dana.ruiz@example.com",
    skills: ["carpentry", "painting", "general"],
    hourly_rate: 58,
    color: "#C77700",
    status: "active",
    notes: "Owns finishing tools. Covers the south and east side.",
    created_at: "2026-03-10T09:00:00.000Z",
    updated_at: "2026-07-22T09:00:00.000Z",
  },
  {
    id: "h-4",
    full_name: "Priya Nair",
    phone: "+1 (615) 555-0163",
    email: "priya.nair@example.com",
    skills: ["hvac", "appliance", "electrical"],
    hourly_rate: 70,
    color: "#7A3FBF",
    status: "active",
    notes: "HVAC certified. Prefers morning time windows.",
    created_at: "2026-04-02T09:00:00.000Z",
    updated_at: "2026-08-19T09:00:00.000Z",
  },
  {
    id: "h-5",
    full_name: "Eli Barton",
    phone: "+1 (615) 555-0121",
    email: "eli.barton@example.com",
    skills: ["general", "carpentry", "painting"],
    hourly_rate: 52,
    color: "#0E7C8C",
    status: "inactive",
    notes: "On leave until September 15.",
    created_at: "2026-05-18T09:00:00.000Z",
    updated_at: "2026-08-25T09:00:00.000Z",
  },
];

type CustomerSeed = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
];

// full_name, phone, email, street, city, state, zip, lat, lng
const CUSTOMER_SEED: CustomerSeed[] = [
  ["Helen Prescott", "+1 (615) 555-0301", "helen.p@example.com", "8400 Eastgate Blvd", "Mount Juliet", "TN", "37122", 36.2005, -86.5186],
  ["Ray Coleman", "+1 (615) 555-0302", "ray.coleman@example.com", "1604 Commerce St", "Nashville", "TN", "37203", 36.1583, -86.7908],
  ["Nadia Foster", "+1 (615) 555-0303", "nadia.f@example.com", "845 Belmont Blvd", "Nashville", "TN", "37212", 36.1338, -86.7902],
  ["Gordon Pike", "+1 (615) 555-0304", "gordon.pike@example.com", "2820 Plymouth Rd", "Brentwood", "TN", "37027", 36.0331, -86.7828],
  ["Sofia Marchetti", "+1 (615) 555-0305", "sofia.m@example.com", "1070 Versailles Rd", "Franklin", "TN", "37064", 35.9251, -86.8689],
  ["Wendell Cross", "+1 (615) 555-0306", "wendell.c@example.com", "9600 Telegraph Rd", "Hermitage", "TN", "37076", 36.1867, -86.6122],
  ["Bianca Ortiz", "+1 (615) 555-0307", "bianca.o@example.com", "6600 Dixie Hwy", "Madison", "TN", "37115", 36.2570, -86.7136],
  ["Curtis Hale", "+1 (615) 555-0308", "curtis.hale@example.com", "40445 Van Dyke Ave", "Antioch", "TN", "37013", 36.0595, -86.6722],
  ["Ingrid Salo", "+1 (615) 555-0309", "ingrid.salo@example.com", "312 Rosebank Ave", "Nashville", "TN", "37206", 36.1930, -86.7302],
  ["Terrence Boyd", "+1 (615) 555-0310", "terrence.b@example.com", "77 Charlotte Pike", "Nashville", "TN", "37209", 36.1553, -86.8408],
  ["Marisol Vega", "+1 (615) 555-0311", "marisol.v@example.com", "1215 Gallatin Pike S", "Madison", "TN", "37115", 36.2648, -86.7093],
  ["Owen Whitfield", "+1 (615) 555-0312", "owen.w@example.com", "530 Old Hickory Blvd", "Nashville", "TN", "37138", 36.2489, -86.6206],
  ["Ada Lindqvist", "+1 (615) 555-0313", "ada.l@example.com", "4402 Granny White Pike", "Nashville", "TN", "37204", 36.1063, -86.7929],
  ["Hugo Bennett", "+1 (615) 555-0314", "hugo.bennett@example.com", "990 Murfreesboro Pike", "Nashville", "TN", "37217", 36.1157, -86.6689],
];

export const CUSTOMERS: Customer[] = CUSTOMER_SEED.map((c, i) => ({
  id: `c-${i + 1}`,
  full_name: c[0],
  phone: c[1],
  email: c[2],
  street_address: c[3],
  city: c[4],
  state: c[5],
  zip: c[6],
  notes:
    i % 4 === 0
      ? "Gate code 4417. Dog in the yard — call ahead."
      : i % 4 === 1
        ? "Water meter in the basement, key with the neighbour on the right."
        : "",
  created_at: `2026-0${(i % 6) + 1}-1${i % 9}T10:00:00.000Z`,
}));

const CUSTOMER_GEO = new Map(
  CUSTOMER_SEED.map((c, i) => [`c-${i + 1}`, { lat: c[7], lng: c[8] }]),
);

type TaskSeed = [
  customerIdx: number,
  handymanIdx: number | null,
  title: string,
  category: TaskCategory,
  priority: TaskPriority,
  status: TaskStatus,
  dayOffset: number | null,
  start: string | null,
  end: string | null,
  durationMin: number | null,
  description: string,
];

const TASK_SEED: TaskSeed[] = [
  [0, 0, "Kitchen faucet is leaking", "plumbing", "normal", "in_progress", 0, "09:00", "11:00", 90, "Dripping from the base, water pooling in the cabinet."],
  [1, 1, "Living room outlets are dead", "electrical", "high", "in_progress", 0, "09:30", "12:00", 120, "Half the outlets died after a storm, the breaker will not hold."],
  [2, 2, "Replace interior door", "carpentry", "normal", "assigned", 0, "13:00", "16:00", 180, "Door and frame already bought, on site."],
  [3, 3, "AC is not cooling", "hvac", "urgent", "assigned", 0, "08:00", "10:00", 120, "Unit blows warm air, clicks on start-up."],
  [4, 0, "Install dishwasher", "appliance", "normal", "assigned", 0, "12:00", "15:00", 150, "Appliance on site, needs a water line tie-in."],
  [5, 1, "Replace hallway switches", "electrical", "low", "assigned", 0, "14:00", "15:30", 60, "Three single-pole switches."],
  [6, null, "Bathroom drain is clogged", "plumbing", "high", "new", 0, "16:00", "18:00", 60, "Water drains very slowly, smell from the drain."],
  [7, null, "Touch up walls after a leak", "painting", "low", "new", 0, null, null, 120, "Stain on the bedroom ceiling, about 20 sq ft."],
  [8, 0, "Washing machine is leaking", "appliance", "high", "assigned", 0, "16:00", "17:30", 90, "Puddle under the machine after the spin cycle."],
  [9, 0, "Inspect the water heater", "plumbing", "normal", "assigned", 0, "17:45", "19:00", 75, "Routine pre-season check."],
  [10, 1, "Stairway light is out", "electrical", "normal", "assigned", 0, "16:30", "17:30", 60, "Bulb was replaced, no change."],
  [11, 2, "Adjust cabinet hinges", "carpentry", "low", "assigned", 0, "17:00", "18:00", 60, "Cabinet doors hang crooked."],
  [12, 3, "Replace HVAC filters", "hvac", "normal", "assigned", 0, "11:00", "12:00", 60, "Filter set is with the customer."],

  [8, 2, "Assemble kitchen cabinets", "carpentry", "normal", "assigned", 1, "09:00", "17:00", 420, "Flat-packed, instructions included."],
  [9, 3, "HVAC maintenance", "hvac", "normal", "assigned", 1, "10:00", "12:00", 120, "Annual service, filter replacement."],
  [10, 0, "Toilet tank is running", "plumbing", "high", "assigned", 1, "13:00", "14:30", 90, "Water keeps trickling into the bowl."],
  [11, 1, "Hang living room chandelier", "electrical", "normal", "assigned", 1, "15:00", "16:30", 90, "Heavy fixture, needs a concrete anchor."],
  [12, null, "Front door sticks", "carpentry", "normal", "new", 1, "09:00", "11:00", 60, "Door catches the threshold, hinges have sagged."],
  [13, null, "Wall oven will not turn on", "appliance", "high", "new", 1, null, null, 90, "Panel lights up but there is no heat."],

  [0, 1, "Replace breaker in the panel", "electrical", "urgent", "assigned", 2, "08:30", "10:00", 90, "Breaker runs hot, smells of plastic."],
  [3, 2, "Paint the fence", "painting", "low", "assigned", 2, "09:00", "15:00", 300, "60 ft of sections, paint supplied by the customer."],
  [5, null, "Install bathroom faucet", "plumbing", "normal", "new", 2, null, null, 90, "New faucet already purchased."],
  [7, null, "Repair the gate", "general", "low", "new", 3, null, null, 120, "Gate has sagged, the latch will not close."],
  [9, 3, "Clean the AC condenser unit", "hvac", "normal", "assigned", 3, "11:00", "13:00", 120, "Second floor, a ladder is required."],
  [11, null, "Replace hallway laminate", "carpentry", "normal", "new", 4, null, null, 300, "130 sq ft, material arrives Thursday."],
  [13, null, "Inspection after water damage", "general", "high", "new", 4, null, null, 60, "Needs a scope assessment and an estimate."],

  [1, 0, "Replace supply hoses", "plumbing", "normal", "done", -1, "09:00", "10:00", 60, "The kitchen supply hose burst."],
  [4, 1, "Outlet for the washing machine", "electrical", "normal", "done", -1, "11:00", "13:00", 120, "Run a dedicated circuit from the panel."],
  [6, 2, "Repair kitchen cabinet", "carpentry", "low", "done", -1, "14:00", "16:00", 120, "Hinge tore out, the door face is crooked."],
  [8, 3, "Replace thermostat", "hvac", "normal", "done", -2, "09:00", "10:30", 90, "The old thermostat will not hold temperature."],
  [10, 0, "Clear the sink trap", "plumbing", "low", "done", -2, "13:00", "14:00", 60, "Sink was draining slowly."],
  [12, null, "Move a bedroom outlet", "electrical", "low", "cancelled", -2, null, null, 90, "Customer cancelled — postponing the remodel."],
];

export function buildTasks(): { tasks: Task[]; history: TaskStatusHistoryEntry[] } {
  const today = todayISO();
  const tasks: Task[] = [];
  const history: TaskStatusHistoryEntry[] = [];

  TASK_SEED.forEach((s, i) => {
    const [
      customerIdx,
      handymanIdx,
      title,
      category,
      priority,
      status,
      dayOffset,
      start,
      end,
      durationMin,
      description,
    ] = s;

    const customer = CUSTOMERS[customerIdx];
    const geo = CUSTOMER_GEO.get(customer.id)!;
    const scheduled = dayOffset === null ? null : addDays(today, dayOffset);
    const createdAt = new Date(
      Date.now() - (TASK_SEED.length - i) * 3600_000 * 7,
    ).toISOString();

    const id = `t-${i + 1}`;
    const task: Task = {
      id,
      task_number: `T-${1000 + i + 1}`,
      customer_id: customer.id,
      handyman_id: handymanIdx === null ? null : HANDYMEN[handymanIdx].id,
      title,
      category,
      description,
      priority,
      status,
      street_address: customer.street_address,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
      // small jitter so stops at the same customer do not overlap
      latitude: +(geo.lat + ((i % 5) - 2) * 0.0015).toFixed(6),
      longitude: +(geo.lng + ((i % 7) - 3) * 0.0015).toFixed(6),
      scheduled_date: scheduled,
      time_window_start: start,
      time_window_end: end,
      estimated_duration_min: durationMin,
      price: null,
      internal_notes: i % 5 === 0 ? "Customer asks for a call 30 minutes ahead." : "",
      created_by: DEMO_USER.id,
      created_at: createdAt,
      updated_at: createdAt,
      started_at:
        status === "in_progress" || status === "done"
          ? new Date(Date.now() - 3 * 3600_000).toISOString()
          : null,
      completed_at:
        status === "done"
          ? new Date(Date.now() - 1 * 3600_000).toISOString()
          : null,
    };
    tasks.push(task);

    // status history: the chain from new to the current status
    const chain: TaskStatus[] = ["new"];
    if (["assigned", "in_progress", "done"].includes(status)) chain.push("assigned");
    if (["in_progress", "done"].includes(status)) chain.push("in_progress");
    if (status === "done") chain.push("done");
    if (status === "cancelled") chain.push("cancelled");

    chain.forEach((to, k) => {
      history.push({
        id: `${id}-h${k}`,
        task_id: id,
        from_status: k === 0 ? null : chain[k - 1],
        to_status: to,
        changed_by: DEMO_USER.id,
        changed_by_name: DEMO_USER.full_name,
        changed_at: new Date(
          new Date(createdAt).getTime() + k * 45 * 60_000,
        ).toISOString(),
      });
    });
  });

  return { tasks, history };
}
