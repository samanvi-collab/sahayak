# Sahayak — Hackathon MVP

A small, runnable prototype for SHG order fulfilment:
- Create an order
- Estimate costs and selling price
- Split work across members using capacity
- Track member progress
- Flag delayed work and propose a reallocation
- Require leader approval before payout is marked approved

This is a prototype. Payment is **simulated**; no real UPI transfer occurs.
The delay/recovery workflow is a rule-based demo, not a trained prediction model.

## Run the backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/docs for the API.

## Run the frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. The frontend expects the API at
`http://127.0.0.1:8000`.

## Demo flow

1. Add members and their daily capacities.
2. Create an order (quantity, due date, unit material cost, labour cost, overhead, margin).
3. Click **Allocate work**.
4. Update a member's completed quantity.
5. Click **Check risk / recover order** to see a proposed reassignment.
6. Click **Approve payout** to record leader approval.

## Important before submission

- Replace demo names and assumptions with verified team-approved examples.
- Do not claim this prototype makes real payments or uses validated AI predictions.
- Add authentication, role-based access, persistent database, consent and privacy controls
  before any real-world pilot.
